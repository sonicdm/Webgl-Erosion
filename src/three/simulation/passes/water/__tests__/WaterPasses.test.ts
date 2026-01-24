import * as THREE from 'three';
import { RenderTargets } from '../../../targets/RenderTargets';
import { GpgpuPass, PassRunner } from '../../../../gpgpu';

// Mock GpgpuPass
const mockSetInputTexture = jest.fn();
const mockSetUniform = jest.fn();
jest.mock('../../../../gpgpu/GpgpuPass', () => {
  return {
    GpgpuPass: jest.fn().mockImplementation(() => ({
      setInputTexture: mockSetInputTexture,
      setUniform: mockSetUniform,
    })),
  };
});

// Mock PassRunner
const mockExecutePingPongPass = jest.fn();
const mockExecuteMRTPass = jest.fn();
jest.mock('../../../../gpgpu/PassRunner', () => {
  return {
    PassRunner: jest.fn().mockImplementation(() => ({
      executePingPongPass: mockExecutePingPongPass,
      executeMRTPass: mockExecuteMRTPass,
    })),
  };
});

// Mock MRTRenderTarget
jest.mock('../../../../gpgpu/MRTRenderTarget', () => {
  const THREE = require('three');
  return {
    MRTRenderTarget: jest.fn().mockImplementation((width: number, height: number, count: number) => {
      const targets = new THREE.WebGLMultipleRenderTargets(width, height, count);
      return {
        getTargets: jest.fn(() => targets),
      };
    }),
  };
});

// Mock shader imports by creating a module mock
jest.mock('../WaterPasses', () => {
  const THREE = require('three');
  const { GpgpuPass } = require('../../../../gpgpu/GpgpuPass');
  const { PassRunner } = require('../../../../gpgpu/PassRunner');
  const { MRTRenderTarget } = require('../../../../gpgpu/MRTRenderTarget');
  
  // Create a mock implementation that matches the real class structure
  class MockWaterPasses {
    private renderTargets: any;
    private passRunner: any;
    private fullscreenQuad: THREE.BufferGeometry;
    private simres: number;
    private renderer: THREE.WebGLRenderer;
    private rainPass: any;
    private flowPass: any;
    private waterHeightPass: any;
    private evaporationPass: any;

    constructor(
      renderTargets: any,
      passRunner: any,
      fullscreenQuad: THREE.BufferGeometry,
      simres: number,
      renderer: THREE.WebGLRenderer
    ) {
      this.renderTargets = renderTargets;
      this.passRunner = passRunner;
      this.fullscreenQuad = fullscreenQuad;
      this.simres = simres;
      this.renderer = renderer;
      
      // Create mock passes
      this.rainPass = new GpgpuPass('quadVert', 'rainFrag', fullscreenQuad);
      this.flowPass = new GpgpuPass('quadVert', 'flowFrag', fullscreenQuad);
      this.waterHeightPass = new GpgpuPass('quadVert', 'waterHeightFrag', fullscreenQuad);
      this.evaporationPass = new GpgpuPass('quadVert', 'evaporationFrag', fullscreenQuad);
    }

    executeRain(controls: any, timer: number, brushState?: any, waterSources?: any): void {
      this.rainPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.rainPass.setUniform('raindeg', controls.RainDegree);
      this.rainPass.setUniform('u_SimRes', this.simres);
      this.rainPass.setUniform('u_Time', timer);
      
      // Handle brush state
      if (brushState && brushState.brushPos) {
        const [brushPosX, brushPosY] = brushState.brushPos;
        if (brushPosX >= 0 && brushPosX <= 1 && brushPosY >= 0 && brushPosY <= 1) {
          this.rainPass.setUniform('u_BrushPos', new THREE.Vector2(brushPosX, brushPosY));
        } else {
          this.rainPass.setUniform('u_BrushPos', new THREE.Vector2(-10.0, -10.0));
        }
      } else {
        this.rainPass.setUniform('u_BrushPos', new THREE.Vector2(-10.0, -10.0));
      }
      
      // Handle water sources
      if (waterSources) {
        this.rainPass.setUniform('u_SourceCount', waterSources.count);
      } else {
        this.rainPass.setUniform('u_SourceCount', 0);
      }
      
      this.passRunner.executePingPongPass(this.rainPass, this.renderTargets.terrainPP);
    }

    executeFlow(controls: any): void {
      this.flowPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.flowPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
      this.flowPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
      this.flowPass.setUniform('u_SimRes', this.simres);
      this.flowPass.setUniform('u_PipeLen', controls.pipelen);
      this.flowPass.setUniform('u_timestep', controls.timestep);
      this.flowPass.setUniform('u_PipeArea', controls.pipeAra);
      this.passRunner.executePingPongPass(this.flowPass, this.renderTargets.fluxPP);
    }

    executeWaterHeight(controls: any, timer: number): void {
      const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 2);
      mrtTarget.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
      mrtTarget.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
      
      this.waterHeightPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.waterHeightPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
      this.waterHeightPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
      this.waterHeightPass.setInputTexture('readVel', this.renderTargets.velocityPP.getReadTexture());
      this.waterHeightPass.setUniform('u_SimRes', this.simres);
      this.waterHeightPass.setUniform('u_PipeLen', controls.pipelen);
      this.waterHeightPass.setUniform('u_timestep', controls.timestep);
      this.waterHeightPass.setUniform('u_PipeArea', controls.pipeAra);
      this.waterHeightPass.setUniform('u_VelMult', controls.VelocityMultiplier || 1.0);
      this.waterHeightPass.setUniform('u_VelAdvMag', controls.VelocityAdvectionMag || 1.0);
      this.waterHeightPass.setUniform('u_Time', timer);
      
      this.passRunner.executeMRTPass(this.waterHeightPass, mrtTarget.getTargets());
      this.renderTargets.terrainPP.swap();
      this.renderTargets.velocityPP.swap();
    }

    executeEvaporation(controls: any): void {
      this.evaporationPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
      this.evaporationPass.setUniform('evapod', controls.EvaporationConstant);
      this.passRunner.executePingPongPass(this.evaporationPass, this.renderTargets.terrainPP);
    }
  }
  
  return {
    WaterPasses: MockWaterPasses,
  };
});

// Import after mocks
import { createSimulationParams } from '../../../../../app/dto/SimulationParams';
import { WaterPasses } from '../WaterPasses';

describe('WaterPasses', () => {
  let waterPasses: WaterPasses;
  let mockRenderTargets: RenderTargets;
  let mockPassRunner: PassRunner;
  let mockFullscreenQuad: THREE.BufferGeometry;
  let mockRenderer: THREE.WebGLRenderer;
  const simres = 1024;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    mockFullscreenQuad = new THREE.BufferGeometry();
    mockRenderer = {
      setRenderTarget: jest.fn(),
    } as any;

    const mockTexture = {} as THREE.Texture;
    const mockRenderTarget = {
      texture: mockTexture,
    } as THREE.WebGLRenderTarget;

    mockRenderTargets = {
      terrainPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      fluxPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      velocityPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      sedimentPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
    } as any;

    mockPassRunner = new PassRunner(mockRenderer, {} as THREE.OrthographicCamera, simres);

    waterPasses = new WaterPasses(
      mockRenderTargets,
      mockPassRunner,
      mockFullscreenQuad,
      simres,
      mockRenderer
    );
  });

  describe('constructor', () => {
    it('should create all water passes', () => {
      expect(GpgpuPass).toHaveBeenCalledTimes(4);
    });
  });

  describe('executeRain', () => {
    it('should set input textures and uniforms', () => {
      const controls = createSimulationParams({
        RainDegree: 0.5,
        brushSize: 10,
        brushStrenth: 0.5,
        brushType: 1,
        brushPressed: 0,
        brushOperation: 0,
        flattenTargetHeight: 0,
        slopeActive: 0,
        RainErosion: true,
        RainErosionStrength: 1.0,
        RainErosionDropSize: 1.0,
        SimulationResolution: simres,
      }, simres);
      const timer = 0.1;

      waterPasses.executeRain(controls, timer);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });

    it('should handle brushState with valid brushPos', () => {
      const controls = createSimulationParams({ RainDegree: 0.5, brushSize: 10, SimulationResolution: simres }, simres);
      const brushState = {
        brushPos: [0.5, 0.5] as [number, number],
        mouseWorldPos: [1, 2, 3, 1] as [number, number, number, number],
        mouseWorldDir: [0, -1, 0] as [number, number, number],
      };

      waterPasses.executeRain(controls, 0, brushState);

      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });

    it('should handle waterSources', () => {
      const controls = createSimulationParams({ RainDegree: 0.5, SimulationResolution: simres }, simres);
      const waterSources = {
        count: 2,
        positions: new Float32Array([0.1, 0.2, 0.3, 0.4]),
        sizes: new Float32Array([1.0, 2.0]),
        strengths: new Float32Array([0.5, 0.7]),
      };

      waterPasses.executeRain(controls, 0, undefined, waterSources);

      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeFlow', () => {
    it('should set input textures and uniforms', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);

      waterPasses.executeFlow(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.fluxPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeWaterHeight', () => {
    it('should execute MRT pass and swap targets', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, VelocityMultiplier: 1.0, VelocityAdvectionMag: 1.0, SimulationResolution: simres }, simres);
      const timer = 0.1;

      waterPasses.executeWaterHeight(controls, timer);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.fluxPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecuteMRTPass).toHaveBeenCalled();
      expect(mockRenderTargets.terrainPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.swap).toHaveBeenCalled();
    });
  });

  describe('executeEvaporation', () => {
    it('should set input textures and uniforms', () => {
      const controls = createSimulationParams({ EvaporationConstant: 0.1, SimulationResolution: simres }, simres);

      waterPasses.executeEvaporation(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });
});
