import * as THREE from 'three';
import { PingPongTarget } from '../../gpgpu/PingPongTarget';

/**
 * Manages all render targets for simulation passes
 * Encapsulates ping-pong targets and non-ping-pong render targets
 */
export class RenderTargets {
  // Ping-pong targets
  public readonly terrainPP: PingPongTarget;
  public readonly fluxPP: PingPongTarget;
  public readonly velocityPP: PingPongTarget;
  public readonly sedimentPP: PingPongTarget;
  public readonly sedimentBlendPP: PingPongTarget;
  public readonly maxslippagePP: PingPongTarget;
  public readonly terrainFluxPP: PingPongTarget;
  public readonly lavaPP: PingPongTarget;
  public readonly lavaFluxPP: PingPongTarget;

  // Non-ping-pong textures
  public readonly terrainNor: THREE.WebGLRenderTarget;
  public readonly sedimentAdvectA: THREE.WebGLRenderTarget;
  public readonly sedimentAdvectB: THREE.WebGLRenderTarget;

  constructor(simres: number) {
    // Initialize ping-pong targets
    this.terrainPP = new PingPongTarget(simres, simres);
    this.fluxPP = new PingPongTarget(simres, simres);
    this.velocityPP = new PingPongTarget(simres, simres);
    this.sedimentPP = new PingPongTarget(simres, simres);
    this.sedimentBlendPP = new PingPongTarget(simres, simres);
    this.maxslippagePP = new PingPongTarget(simres, simres);
    this.terrainFluxPP = new PingPongTarget(simres, simres);
    this.lavaPP = new PingPongTarget(simres, simres);
    this.lavaFluxPP = new PingPongTarget(simres, simres);

    // Initialize non-ping-pong textures
    this.terrainNor = this.createRenderTarget(simres, simres);
    this.sedimentAdvectA = this.createRenderTarget(simres, simres);
    this.sedimentAdvectB = this.createRenderTarget(simres, simres);
  }

  /**
   * Creates a render target with standard float texture configuration
   */
  private createRenderTarget(width: number, height: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: false,
    });
  }

  /**
   * Disposes all render targets
   */
  public dispose(): void {
    // Dispose ping-pong targets
    this.terrainPP.dispose();
    this.fluxPP.dispose();
    this.velocityPP.dispose();
    this.sedimentPP.dispose();
    this.sedimentBlendPP.dispose();
    this.maxslippagePP.dispose();
    this.terrainFluxPP.dispose();
    this.lavaPP.dispose();
    this.lavaFluxPP.dispose();

    // Dispose non-ping-pong textures
    this.terrainNor.dispose();
    this.sedimentAdvectA.dispose();
    this.sedimentAdvectB.dispose();
  }
}
