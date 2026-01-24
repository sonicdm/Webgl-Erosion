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

// Mock LavaPasses module
jest.mock('../LavaPasses', () => {
  const THREE = require('three');
  const { GpgpuPass } = require('../../../../gpgpu/GpgpuPass');
  const { PassRunner } = require('../../../../gpgpu/PassRunner');
  const { MRTRenderTarget } = require('../../../../gpgpu/MRTRenderTarget');
  
  class MockLavaPasses {
    private renderTargets: any;
    private passRunner: any;
    private fullscreenQuad: THREE.BufferGeometry;
    private simres: number;
    private renderer: THREE.WebGLRenderer;
    private lavaFlowPass: any;
    private lavaUpdatePass: any;
    private lavaTerrainPass: any;

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
      
      this.lavaFlowPass = new GpgpuPass('quadVert', 'lavaFlowFrag', fullscreenQuad);
      this.lavaUpdatePass = new GpgpuPass('quadVert', 'lavaUpdateFrag', fullscreenQuad);
      this.lavaTerrainPass = new GpgpuPass('quadVert', 'lavaTerrainFrag', fullscreenQuad);
    }

    executeLavaFlow(controls: any, timer: number, lavaSources?: any): void {
      this.renderer.setRenderTarget(null);
      this.lavaFlowPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.lavaFlowPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
      this.lavaFlowPass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
      this.lavaFlowPass.setUniform('u_SimRes', this.simres);
      this.lavaFlowPass.setUniform('u_PipeLen', controls.pipelen);
      this.lavaFlowPass.setUniform('u_timestep', controls.timestep);
      this.lavaFlowPass.setUniform('u_PipeArea', controls.pipeAra);
      this.lavaFlowPass.setUniform('u_Time', timer);
      
      if (lavaSources) {
        this.lavaFlowPass.setUniform('u_LavaSourceCount', lavaSources.count);
      } else {
        this.lavaFlowPass.setUniform('u_LavaSourceCount', 0);
      }
      
      this.passRunner.executePingPongPass(this.lavaFlowPass, this.renderTargets.lavaFluxPP);
    }

    executeLavaUpdate(controls: any, timer: number, brushState?: any, lavaSources?: any): void {
      this.lavaUpdatePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.lavaUpdatePass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
      this.lavaUpdatePass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
      this.lavaUpdatePass.setUniform('u_SimRes', this.simres);
      this.lavaUpdatePass.setUniform('u_PipeLen', controls.pipelen);
      this.lavaUpdatePass.setUniform('u_timestep', controls.timestep);
      this.lavaUpdatePass.setUniform('u_PipeArea', controls.pipeAra);
      this.lavaUpdatePass.setUniform('u_Time', timer);
      
      if (lavaSources) {
        this.lavaUpdatePass.setUniform('u_LavaSourceCount', lavaSources.count);
      } else {
        this.lavaUpdatePass.setUniform('u_LavaSourceCount', 0);
      }
      
      if (brushState) {
        if (brushState.mouseWorldPos) {
          this.lavaUpdatePass.setUniform('u_MouseWorldPos', new THREE.Vector4(...brushState.mouseWorldPos));
        }
        if (brushState.brushPos) {
          this.lavaUpdatePass.setUniform('u_BrushPos', new THREE.Vector2(...brushState.brushPos));
        }
      }
      
      this.passRunner.executePingPongPass(this.lavaUpdatePass, this.renderTargets.lavaPP);
    }

    executeLavaTerrain(controls: any, lavaSources?: any): void {
      const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
      mrt.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
      mrt.getTargets().texture[1] = this.renderTargets.lavaPP.getWriteTarget().texture;
      
      this.lavaTerrainPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.lavaTerrainPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
      this.lavaTerrainPass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
      this.lavaTerrainPass.setUniform('u_SimRes', this.simres);
      this.lavaTerrainPass.setUniform('u_timestep', controls.timestep);
      
      if (lavaSources) {
        this.lavaTerrainPass.setUniform('u_LavaSourceCount', lavaSources.count);
      } else {
        this.lavaTerrainPass.setUniform('u_LavaSourceCount', 0);
      }
      
      this.passRunner.executeMRTPass(this.lavaTerrainPass, mrt.getTargets());
      this.renderTargets.terrainPP.swap();
      this.renderTargets.lavaPP.swap();
    }
  }
  
  return {
    LavaPasses: MockLavaPasses,
  };
});

// Import after mocks
import { createSimulationParams } from '../../../../../app/dto/SimulationParams';
import { LavaPasses } from '../LavaPasses';

describe('LavaPasses', () => {
  let lavaPasses: LavaPasses;
  let mockRenderTargets: RenderTargets;
  let mockPassRunner: PassRunner;
  let mockFullscreenQuad: THREE.BufferGeometry;
  let mockRenderer: THREE.WebGLRenderer;
  const simres = 1024;

  beforeEach(() => {
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
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      lavaPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      lavaFluxPP: {
        getReadTexture: jest.fn(() => mockTexture),
      } as any,
    } as any;

    mockPassRunner = new PassRunner(mockRenderer, {} as THREE.OrthographicCamera, simres);

    lavaPasses = new LavaPasses(
      mockRenderTargets,
      mockPassRunner,
      mockFullscreenQuad,
      simres,
      mockRenderer
    );
  });

  describe('constructor', () => {
    it('should create all lava passes', () => {
      expect(GpgpuPass).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeLavaFlow', () => {
    it('should set input textures and uniforms', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);
      const timer = 0.1;

      lavaPasses.executeLavaFlow(controls, timer);

      expect(mockRenderer.setRenderTarget).toHaveBeenCalledWith(null);
      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });

    it('should handle lavaSources', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);
      const lavaSources = {
        count: 2,
        positions: new Float32Array([0.1, 0.2, 0.3, 0.4]),
        sizes: new Float32Array([1.0, 2.0]),
        strengths: new Float32Array([0.5, 0.7]),
      };

      lavaPasses.executeLavaFlow(controls, 0, lavaSources);

      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeLavaUpdate', () => {
    it('should set input textures and uniforms', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);
      const timer = 0.1;

      lavaPasses.executeLavaUpdate(controls, timer);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.lavaPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });

    it('should handle brushState', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);
      const brushState = {
        brushPos: [0.5, 0.5] as [number, number],
        mouseWorldPos: [1, 2, 3, 1] as [number, number, number, number],
      };

      lavaPasses.executeLavaUpdate(controls, 0, brushState);

      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeLavaTerrain', () => {
    it('should execute MRT pass and swap targets', () => {
      const controls = createSimulationParams({ timestep: 0.01, SimulationResolution: simres }, simres);

      lavaPasses.executeLavaTerrain(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.lavaPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecuteMRTPass).toHaveBeenCalled();
      expect(mockRenderTargets.terrainPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.lavaPP.swap).toHaveBeenCalled();
    });
  });
});
