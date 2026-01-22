import * as THREE from 'three';

/**
 * Manages a pair of ping-pong render targets for GPGPU passes.
 * Automatically handles swapping between read and write targets.
 */
export class PingPongTarget {
  private readTarget: THREE.WebGLRenderTarget;
  private writeTarget: THREE.WebGLRenderTarget;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // Create two render targets with float format
    this.readTarget = this.createRenderTarget(width, height);
    this.writeTarget = this.createRenderTarget(width, height);
  }

  /**
   * Creates a render target with RGBA32F format for simulation data
   */
  private createRenderTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });

    return target;
  }

  /**
   * Gets the current read target
   */
  public getReadTarget(): THREE.WebGLRenderTarget {
    return this.readTarget;
  }

  /**
   * Gets the current write target
   */
  public getWriteTarget(): THREE.WebGLRenderTarget {
    return this.writeTarget;
  }

  /**
   * Gets the read target's texture
   */
  public getReadTexture(): THREE.Texture {
    return this.readTarget.texture;
  }

  /**
   * Gets the write target's texture
   */
  public getWriteTexture(): THREE.Texture {
    return this.writeTarget.texture;
  }

  /**
   * Swaps read and write targets (ping-pong)
   */
  public swap(): void {
    const tmp = this.readTarget;
    this.readTarget = this.writeTarget;
    this.writeTarget = tmp;
  }

  /**
   * Resizes both render targets
   */
  public setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) {
      return; // No resize needed
    }

    this.width = width;
    this.height = height;

    this.readTarget.setSize(width, height);
    this.writeTarget.setSize(width, height);
  }

  /**
   * Disposes of both render targets
   */
  public dispose(): void {
    this.readTarget.dispose();
    this.writeTarget.dispose();
  }
}

