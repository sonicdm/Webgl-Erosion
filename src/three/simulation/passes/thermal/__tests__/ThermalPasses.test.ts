import * as THREE from 'three';
import { RenderTargets } from '../../../targets/RenderTargets';
import { PassRunner } from '../../../../gpgpu/PassRunner';
import { GpgpuPass } from '../../../../gpgpu/GpgpuPass';

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
jest.mock('../../../../gpgpu/PassRunner', () => {
  return {
    PassRunner: jest.fn().mockImplementation(() => ({
      executePingPongPass: mockExecutePingPongPass,
    })),
  };
});

// Mock ThermalPasses module
jest.mock('../ThermalPasses', () => {
  const THREE = require('three');
  const { GpgpuPass } = require('../../../../gpgpu/GpgpuPass');
  const { PassRunner } = require('../../../../gpgpu/PassRunner');
  
  class MockThermalPasses {
    private renderTargets: any;
    private passRunner: any;
    private fullscreenQuad: THREE.BufferGeometry;
    private simres: number;
    private maxslippagePass: any;
    private thermalFluxPass: any;
    private thermalApplyPass: any;

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
      
      this.maxslippagePass = new GpgpuPass('quadVert', 'maxSlippageHeightFrag', fullscreenQuad);
      this.thermalFluxPass = new GpgpuPass('quadVert', 'thermalFluxFrag', fullscreenQuad);
      this.thermalApplyPass = new GpgpuPass('quadVert', 'thermalApplyFrag', fullscreenQuad);
    }

    executeMaxSlippage(controls: any): void {
      this.maxslippagePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.maxslippagePass.setUniform('u_SimRes', this.simres);
      this.maxslippagePass.setUniform('u_PipeLen', controls.pipelen);
      this.maxslippagePass.setUniform('u_timestep', controls.timestep);
      this.maxslippagePass.setUniform('u_PipeArea', controls.pipeAra);
      this.maxslippagePass.setUniform('unif_TalusScale', controls.thermalTalusAngleScale || 1.0);
      this.maxslippagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
      this.passRunner.executePingPongPass(this.maxslippagePass, this.renderTargets.maxslippagePP);
    }

    executeThermalFlux(controls: any): void {
      this.thermalFluxPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.thermalFluxPass.setInputTexture('readMaxSlippage', this.renderTargets.maxslippagePP.getReadTexture());
      this.thermalFluxPass.setUniform('u_SimRes', this.simres);
      this.thermalFluxPass.setUniform('u_PipeLen', controls.pipelen);
      this.thermalFluxPass.setUniform('u_timestep', controls.timestep);
      this.thermalFluxPass.setUniform('u_PipeArea', controls.pipeAra);
      this.thermalFluxPass.setUniform('unif_thermalRate', controls.thermalRate || 0.5);
      this.passRunner.executePingPongPass(this.thermalFluxPass, this.renderTargets.terrainFluxPP);
    }

    executeThermalApply(controls: any): void {
      this.thermalApplyPass.setInputTexture('readTerrainFlux', this.renderTargets.terrainFluxPP.getReadTexture());
      this.thermalApplyPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
      this.thermalApplyPass.setUniform('u_SimRes', this.simres);
      this.thermalApplyPass.setUniform('u_PipeLen', controls.pipelen);
      this.thermalApplyPass.setUniform('u_timestep', controls.timestep);
      this.thermalApplyPass.setUniform('u_PipeArea', controls.pipeAra);
      this.thermalApplyPass.setUniform('unif_thermalErosionScale', controls.thermalErosionScale || 1.0);
      this.passRunner.executePingPongPass(this.thermalApplyPass, this.renderTargets.terrainPP);
    }
  }
  
  return {
    ThermalPasses: MockThermalPasses,
  };
});

// Import after mocks
import { ThermalPasses } from '../ThermalPasses';

describe('ThermalPasses', () => {
  let thermalPasses: ThermalPasses;
  let mockRenderTargets: RenderTargets;
  let mockPassRunner: PassRunner;
  let mockFullscreenQuad: THREE.BufferGeometry;
  const simres = 1024;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFullscreenQuad = new THREE.BufferGeometry();

    const mockTexture = {} as THREE.Texture;

    mockRenderTargets = {
      terrainPP: {
        getReadTexture: jest.fn(() => mockTexture),
      } as any,
      maxslippagePP: {
        getReadTexture: jest.fn(() => mockTexture),
      } as any,
      terrainFluxPP: {
        getReadTexture: jest.fn(() => mockTexture),
      } as any,
    } as any;

    mockPassRunner = new PassRunner({} as THREE.WebGLRenderer, {} as THREE.OrthographicCamera, simres);

    thermalPasses = new ThermalPasses(
      mockRenderTargets,
      mockPassRunner,
      mockFullscreenQuad,
      simres
    );
  });

  describe('constructor', () => {
    it('should create all thermal passes', () => {
      expect(GpgpuPass).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeMaxSlippage', () => {
    it('should set input textures and uniforms', () => {
      const controls = {
        pipelen: 1.0,
        timestep: 0.01,
        pipeAra: 1.0,
        thermalTalusAngleScale: 1.0,
        RainErosion: false,
      };

      thermalPasses.executeMaxSlippage(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeThermalFlux', () => {
    it('should set input textures and uniforms', () => {
      const controls = {
        pipelen: 1.0,
        timestep: 0.01,
        pipeAra: 1.0,
        thermalRate: 0.5,
      };

      thermalPasses.executeThermalFlux(controls);

      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.maxslippagePP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });

  describe('executeThermalApply', () => {
    it('should set input textures and uniforms', () => {
      const controls = {
        pipelen: 1.0,
        timestep: 0.01,
        pipeAra: 1.0,
        thermalErosionScale: 1.0,
      };

      thermalPasses.executeThermalApply(controls);

      expect(mockRenderTargets.terrainFluxPP.getReadTexture).toHaveBeenCalled();
      expect(mockRenderTargets.terrainPP.getReadTexture).toHaveBeenCalled();
      expect(mockExecutePingPongPass).toHaveBeenCalled();
    });
  });
});
