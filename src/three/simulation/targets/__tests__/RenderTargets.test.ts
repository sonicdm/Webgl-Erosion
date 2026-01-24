import { RenderTargets } from '../RenderTargets';
import { PingPongTarget } from '../../../gpgpu/PingPongTarget';
import * as THREE from 'three';

describe('RenderTargets', () => {
  let renderTargets: RenderTargets;
  const simres = 1024;

  beforeEach(() => {
    renderTargets = new RenderTargets(simres);
  });

  describe('constructor', () => {
    it('should create all ping-pong targets', () => {
      expect(renderTargets.terrainPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.fluxPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.velocityPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.sedimentPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.sedimentBlendPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.maxslippagePP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.terrainFluxPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.lavaPP).toBeInstanceOf(PingPongTarget);
      expect(renderTargets.lavaFluxPP).toBeInstanceOf(PingPongTarget);
    });

    it('should create all non-ping-pong render targets', () => {
      expect(renderTargets.terrainNor).toBeInstanceOf(THREE.WebGLRenderTarget);
      expect(renderTargets.sedimentAdvectA).toBeInstanceOf(THREE.WebGLRenderTarget);
      expect(renderTargets.sedimentAdvectB).toBeInstanceOf(THREE.WebGLRenderTarget);
    });

    it('should create render targets with correct dimensions', () => {
      expect(renderTargets.terrainNor.width).toBe(simres);
      expect(renderTargets.terrainNor.height).toBe(simres);
      expect(renderTargets.sedimentAdvectA.width).toBe(simres);
      expect(renderTargets.sedimentAdvectA.height).toBe(simres);
      expect(renderTargets.sedimentAdvectB.width).toBe(simres);
      expect(renderTargets.sedimentAdvectB.height).toBe(simres);
    });

    it('should configure render targets with FloatType', () => {
      expect(renderTargets.terrainNor.texture.type).toBe(THREE.FloatType);
      expect(renderTargets.sedimentAdvectA.texture.type).toBe(THREE.FloatType);
      expect(renderTargets.sedimentAdvectB.texture.type).toBe(THREE.FloatType);
    });
  });

  describe('dispose', () => {
    it('should dispose all ping-pong targets', () => {
      const disposeSpy = jest.spyOn(renderTargets.terrainPP, 'dispose');
      renderTargets.dispose();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should dispose all non-ping-pong render targets', () => {
      const disposeSpy = jest.spyOn(renderTargets.terrainNor, 'dispose');
      renderTargets.dispose();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should not throw when disposing', () => {
      expect(() => {
        renderTargets.dispose();
      }).not.toThrow();
    });
  });
});
