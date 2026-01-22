import * as THREE from 'three';
import { GpgpuPass } from './GpgpuPass';
import { PingPongTarget } from './PingPongTarget';
import { MRTRenderTarget } from './MRTRenderTarget';

/**
 * Utility class for executing GPGPU passes with proper state management.
 * Handles viewport setup, render target binding, and ping-pong swaps.
 */
export class PassRunner {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.OrthographicCamera;
  private simres: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.OrthographicCamera,
    simres: number
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.simres = simres;
  }

  /**
   * Executes a single-output pass
   */
  public executeSinglePass(
    pass: GpgpuPass,
    outputTarget: THREE.WebGLRenderTarget
  ): void {
    this.setupViewport(this.simres, this.simres);
    pass.render(this.renderer, this.camera, outputTarget);
  }

  /**
   * Executes an MRT pass (2-4 outputs)
   */
  public executeMRTPass(
    pass: GpgpuPass,
    outputTarget: THREE.WebGLMultipleRenderTargets
  ): void {
    this.setupViewport(this.simres, this.simres);
    pass.render(this.renderer, this.camera, outputTarget);
  }

  /**
   * Executes a pass with ping-pong target
   */
  public executePingPongPass(
    pass: GpgpuPass,
    pingPong: PingPongTarget
  ): void {
    this.executeSinglePass(pass, pingPong.getWriteTarget());
    pingPong.swap();
  }

  /**
   * Executes a pass with MRT ping-pong targets
   * Note: This is a simplified version - full MRT ping-pong would need custom implementation
   */
  public executeMRTPingPongPass(
    pass: GpgpuPass,
    mrtTarget: MRTRenderTarget,
    pingPongTargets: PingPongTarget[]
  ): void {
    // For MRT passes, we write to the MRT target
    // Then manually swap the individual ping-pong pairs
    this.executeMRTPass(pass, mrtTarget.getTargets());
    
    // Swap all ping-pong targets
    for (const pp of pingPongTargets) {
      pp.swap();
    }
  }

  /**
   * Sets up viewport for simulation resolution
   */
  private setupViewport(width: number, height: number): void {
    this.renderer.setViewport(0, 0, width, height);
  }

  /**
   * Updates simulation resolution
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
  }
}

