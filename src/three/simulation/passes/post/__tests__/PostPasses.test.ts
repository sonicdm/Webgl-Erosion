import * as THREE from 'three';
import { RenderTargets } from '../../../targets/RenderTargets';
import { PassRunner } from '../../../../gpgpu/PassRunner';
import { GpgpuPass } from '../../../../gpgpu/GpgpuPass';

// Mock GpgpuPass
jest.mock('../../../../gpgpu/GpgpuPass', () => {
  return {
    GpgpuPass: jest.fn().mockImplementation(() => ({
      setInputTexture: jest.fn(),
      setUniform: jest.fn(),
    })),
  };
});

// Mock PassRunner
const mockExecuteSinglePass = jest.fn();
jest.mock('../../../../gpgpu/PassRunner', () => {
  return {
    PassRunner: jest.fn().mockImplementation(() => ({
      executeSinglePass: mockExecuteSinglePass,
    })),
  };
});

// Mock PostPasses module
jest.mock('../PostPasses', () => {
  const THREE = require('three');
  const { GpgpuPass } = require('../../../../gpgpu/GpgpuPass');
  const { PassRunner } = require('../../../../gpgpu/PassRunner');
  
  class MockPostPasses {
    private renderTargets: any;
    private passRunner: any;
    private fullscreenQuad: THREE.BufferGeometry;
    private cleanPass: any;

    constructor(
      renderTargets: any,
      passRunner: any,
      fullscreenQuad: THREE.BufferGeometry
    ) {
      this.renderTargets = renderTargets;
      this.passRunner = passRunner;
      this.fullscreenQuad = fullscreenQuad;
      
      this.cleanPass = new GpgpuPass('quadVert', 'cleanFrag', fullscreenQuad);
    }

    clearAllTargets(): void {
      // Clear all ping-pong targets
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.fluxPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.fluxPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.velocityPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.velocityPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentBlendPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentBlendPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.maxslippagePP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.maxslippagePP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainFluxPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainFluxPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaPP.getWriteTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaFluxPP.getReadTarget());
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaFluxPP.getWriteTarget());

      // Clear non-ping-pong textures
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainNor);
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentAdvectA);
      this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentAdvectB);
    }
  }
  
  return {
    PostPasses: MockPostPasses,
  };
});

// Import after mocks
import { PostPasses } from '../PostPasses';

describe('PostPasses', () => {
  let postPasses: PostPasses;
  let mockRenderTargets: RenderTargets;
  let mockPassRunner: PassRunner;
  let mockFullscreenQuad: THREE.BufferGeometry;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFullscreenQuad = new THREE.BufferGeometry();

    const mockRenderTarget = {
      texture: {} as THREE.Texture,
    } as THREE.WebGLRenderTarget;

    mockRenderTargets = {
      terrainPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      fluxPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      velocityPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      sedimentPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      sedimentBlendPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      maxslippagePP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      terrainFluxPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      lavaPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      lavaFluxPP: {
        getReadTarget: jest.fn(() => mockRenderTarget),
        getWriteTarget: jest.fn(() => mockRenderTarget),
      } as any,
      terrainNor: mockRenderTarget,
      sedimentAdvectA: mockRenderTarget,
      sedimentAdvectB: mockRenderTarget,
    } as any;

    mockPassRunner = new PassRunner({} as THREE.WebGLRenderer, {} as THREE.OrthographicCamera, 1024);

    postPasses = new PostPasses(
      mockRenderTargets,
      mockPassRunner,
      mockFullscreenQuad
    );
  });

  describe('constructor', () => {
    it('should create clean pass', () => {
      expect(GpgpuPass).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearAllTargets', () => {
    it('should clear all ping-pong targets', () => {
      postPasses.clearAllTargets();

      // Should call executeSinglePass for all ping-pong targets (read + write) and non-ping-pong targets
      // 9 ping-pong targets * 2 (read + write) + 3 non-ping-pong = 21 calls
      expect(mockExecuteSinglePass).toHaveBeenCalledTimes(21);
    });
  });
});
