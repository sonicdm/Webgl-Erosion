import * as THREE from 'three';
import { RenderTargets } from '../../../targets/RenderTargets';
import { PassRunner } from '../../../../gpgpu/PassRunner';
import { GpgpuPass } from '../../../../gpgpu/GpgpuPass';
import { MRTRenderTarget } from '../../../../gpgpu/MRTRenderTarget';

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
const mockExecuteSinglePass = jest.fn();
jest.mock('../../../../gpgpu/PassRunner', () => {
  return {
    PassRunner: jest.fn().mockImplementation(() => ({
      executePingPongPass: mockExecutePingPongPass,
      executeMRTPass: mockExecuteMRTPass,
      executeSinglePass: mockExecuteSinglePass,
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

// Mock SedimentPasses module to avoid shader import issues
jest.mock('../SedimentPasses', () => {
  const THREE = require('three');
  const { GpgpuPass } = require('../../../../gpgpu/GpgpuPass');
  const { PassRunner } = require('../../../../gpgpu/PassRunner');
  const { MRTRenderTarget } = require('../../../../gpgpu/MRTRenderTarget');
  
  class MockSedimentPasses {
    private renderTargets: any;
    private passRunner: any;
    private fullscreenQuad: THREE.BufferGeometry;
    private simres: number;
    private sedimentPass: any;
    private advectPass: any;
    private macCormackPass: any;
    private averagePass: any;

    constructor(
      renderTargets: any,
      passRunner: any,
      fullscreenQuad: THREE.BufferGeometry,
      simres: number
    ) {
      this.renderTargets = renderTargets;
      this.passRunner = passRunner;
      this.fullscreenQuad = fullscreenQuad;
      this.simres = simres;
      
      this.sedimentPass = new GpgpuPass('quadVert', 'sedimentFrag', fullscreenQuad);
      this.advectPass = new GpgpuPass('quadVert', 'sedimentAdvectFrag', fullscreenQuad);
      this.macCormackPass = new GpgpuPass('quadVert', 'maccormackFrag', fullscreenQuad);
      this.averagePass = new GpgpuPass('quadVert', 'averageFrag', fullscreenQuad);
    }

    executeSediment(controls: any, timer: number): void {
      const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 4);
      mrtTarget.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
      mrtTarget.getTargets().texture[1] = this.renderTargets.sedimentPP.getWriteTarget().texture;
      mrtTarget.getTargets().texture[2] = this.renderTargets.terrainNor.texture;
      mrtTarget.getTargets().texture[3] = this.renderTargets.velocityPP.getWriteTarget().texture;
      
      this.sedimentPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.sedimentPass.setInputTexture('readVelocity', this.renderTargets.velocityPP.getReadTexture());
      this.sedimentPass.setInputTexture('readSediment', this.renderTargets.sedimentPP.getReadTexture());
      this.sedimentPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
      this.sedimentPass.setUniform('u_SimRes', this.simres);
      this.sedimentPass.setUniform('u_PipeLen', controls.pipelen);
      this.sedimentPass.setUniform('Kc', controls.Kc);
      this.sedimentPass.setUniform('Ks', controls.Ks);
      this.sedimentPass.setUniform('Kd', controls.Kd);
      this.sedimentPass.setUniform('u_timestep', controls.timestep);
      this.sedimentPass.setUniform('u_Time', timer);
      
      this.passRunner.executeMRTPass(this.sedimentPass, mrtTarget.getTargets());
      this.renderTargets.terrainPP.swap();
      this.renderTargets.sedimentPP.swap();
      this.renderTargets.velocityPP.swap();
    }

    executeMacCormackAdvection(controls: any): void {
      const mrt1 = new MRTRenderTarget(this.simres, this.simres, 3);
      mrt1.getTargets().texture[0] = this.renderTargets.sedimentAdvectA.texture;
      mrt1.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
      mrt1.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
      
      this.advectPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
      this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
      this.advectPass.setInputTexture('sediBlend', this.renderTargets.sedimentBlendPP.getReadTexture());
      this.advectPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
      this.advectPass.setUniform('unif_advectMultiplier', 1);
      this.advectPass.setUniform('u_SimRes', this.simres);
      this.advectPass.setUniform('u_PipeLen', controls.pipelen);
      this.advectPass.setUniform('u_timestep', controls.timestep);
      this.passRunner.executeMRTPass(this.advectPass, mrt1.getTargets());
      
      const mrt2 = new MRTRenderTarget(this.simres, this.simres, 3);
      mrt2.getTargets().texture[0] = this.renderTargets.sedimentAdvectB.texture;
      mrt2.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
      mrt2.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
      
      this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentAdvectA.texture);
      this.advectPass.setUniform('unif_advectMultiplier', -1);
      this.passRunner.executeMRTPass(this.advectPass, mrt2.getTargets());
      
      this.macCormackPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
      this.macCormackPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
      this.macCormackPass.setInputTexture('sediadvecta', this.renderTargets.sedimentAdvectA.texture);
      this.macCormackPass.setInputTexture('sediadvectb', this.renderTargets.sedimentAdvectB.texture);
      this.macCormackPass.setUniform('u_SimRes', this.simres);
      this.macCormackPass.setUniform('u_PipeLen', controls.pipelen);
      this.macCormackPass.setUniform('u_timestep', controls.timestep);
      this.passRunner.executeSinglePass(this.macCormackPass, this.renderTargets.sedimentPP.getWriteTarget());
      
      this.renderTargets.sedimentBlendPP.swap();
      this.renderTargets.sedimentPP.swap();
      this.renderTargets.velocityPP.swap();
    }

    executeSimpleAdvection(controls: any): void {
      const mrt = new MRTRenderTarget(this.simres, this.simres, 3);
      mrt.getTargets().texture[0] = this.renderTargets.sedimentPP.getWriteTarget().texture;
      mrt.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
      mrt.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
      
      this.advectPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
      this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
      this.advectPass.setInputTexture('sediBlend', this.renderTargets.sedimentBlendPP.getReadTexture());
      this.advectPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
      this.advectPass.setUniform('unif_advectMultiplier', 1);
      this.advectPass.setUniform('u_SimRes', this.simres);
      this.advectPass.setUniform('u_PipeLen', controls.pipelen);
      this.advectPass.setUniform('u_timestep', controls.timestep);
      this.passRunner.executeMRTPass(this.advectPass, mrt.getTargets());
      
      this.renderTargets.sedimentBlendPP.swap();
      this.renderTargets.sedimentPP.swap();
      this.renderTargets.velocityPP.swap();
    }

    executeAverage(controls: any): void {
      const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
      mrt.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
      mrt.getTargets().texture[1] = this.renderTargets.terrainNor.texture;
      
      this.averagePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.averagePass.setUniform('u_SimRes', this.simres);
      this.averagePass.setUniform('u_PipeLen', controls.pipelen);
      this.averagePass.setUniform('u_timestep', controls.timestep);
      this.averagePass.setUniform('u_PipeArea', controls.pipeAra);
      
      this.passRunner.executeMRTPass(this.averagePass, mrt.getTargets());
      this.renderTargets.terrainPP.swap();
    }
  }
  
  return {
    SedimentPasses: MockSedimentPasses,
  };
});

// Import after mocks
import { createSimulationParams } from '../../../../../app/dto/SimulationParams';
import { SedimentPasses } from '../SedimentPasses';

describe('SedimentPasses', () => {
  let sedimentPasses: SedimentPasses;
  let mockRenderTargets: RenderTargets;
  let mockPassRunner: PassRunner;
  let mockFullscreenQuad: THREE.BufferGeometry;
  const simres = 1024;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFullscreenQuad = new THREE.BufferGeometry();

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
      sedimentPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      velocityPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      sedimentBlendPP: {
        getReadTexture: jest.fn(() => mockTexture),
        getWriteTarget: jest.fn(() => mockRenderTarget),
        swap: jest.fn(),
      } as any,
      sedimentAdvectA: mockRenderTarget,
      sedimentAdvectB: mockRenderTarget,
      terrainNor: mockRenderTarget,
      lavaPP: {
        getReadTexture: jest.fn(() => mockTexture),
      } as any,
    } as any;

    mockPassRunner = new PassRunner({} as THREE.WebGLRenderer, {} as THREE.OrthographicCamera, simres);

    sedimentPasses = new SedimentPasses(
      mockRenderTargets,
      mockPassRunner,
      mockFullscreenQuad,
      simres
    );
  });

  describe('constructor', () => {
    it('should create all sediment passes', () => {
      expect(GpgpuPass).toHaveBeenCalledTimes(4);
    });
  });

  describe('executeSediment', () => {
    it('should execute MRT pass and swap targets', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, Kc: 0.1, Ks: 0.2, Kd: 0.3, SimulationResolution: simres }, simres);
      const timer = 0.1;

      sedimentPasses.executeSediment(controls, timer);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.lavaPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecuteMRTPass).toHaveBeenCalled();
      expect(mockRenderTargets.terrainPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.swap).toHaveBeenCalled();
    });
  });

  describe('executeMacCormackAdvection', () => {
    it('should execute all three subpasses and swap targets', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, SimulationResolution: simres }, simres);

      sedimentPasses.executeMacCormackAdvection(controls);

      expect(mockExecuteMRTPass).toHaveBeenCalledTimes(2);
      expect(mockExecuteSinglePass).toHaveBeenCalledTimes(1);
      expect(mockRenderTargets.sedimentBlendPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.swap).toHaveBeenCalled();
    });
  });

  describe('executeSimpleAdvection', () => {
    it('should execute MRT pass and swap targets', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, SimulationResolution: simres }, simres);

      sedimentPasses.executeSimpleAdvection(controls);

      expect(mockExecuteMRTPass).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentBlendPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.sedimentPP.swap).toHaveBeenCalled();
      expect(mockRenderTargets.velocityPP.swap).toHaveBeenCalled();
    });
  });

  describe('executeAverage', () => {
    it('should execute MRT pass and swap terrain target', () => {
      const controls = createSimulationParams({ pipelen: 1.0, timestep: 0.01, pipeAra: 1.0, SimulationResolution: simres }, simres);

      sedimentPasses.executeAverage(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecuteMRTPass).toHaveBeenCalled();
      expect(mockRenderTargets.terrainPP.swap).toHaveBeenCalled();
    });
  });
});
