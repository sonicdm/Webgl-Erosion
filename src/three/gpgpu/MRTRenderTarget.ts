import * as THREE from 'three';
import { ensureTextureFloat } from '../utils/textureFormatVTF';

/**
 * Manages Multiple Render Targets (MRT) for passes that output 2-4 textures.
 * Wraps WebGLMultipleRenderTargets with proper format configuration.
 */
export class MRTRenderTarget {
  private targets: THREE.WebGLMultipleRenderTargets;
  private width: number;
  private height: number;
  private count: number;

  constructor(width: number, height: number, count: number) {
    if (count < 2 || count > 4) {
      throw new Error(`MRT count must be between 2 and 4, got ${count}`);
    }

    this.width = width;
    this.height = height;
    this.count = count;

    // Create WebGLMultipleRenderTargets - constructor accepts options in newer Three.js versions
    // Try using options object if supported, otherwise configure manually
    try {
      // Three.js r150+ supports options in constructor
      this.targets = new THREE.WebGLMultipleRenderTargets(width, height, count, {
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
    } catch (e) {
      // Fallback for older Three.js versions - create and configure manually
      this.targets = new THREE.WebGLMultipleRenderTargets(width, height, count);
      for (let i = 0; i < count; i++) {
        ensureTextureFloat(this.targets.texture[i]);
      }
    }
  }

  /**
   * Gets the MRT render targets
   */
  public getTargets(): THREE.WebGLMultipleRenderTargets {
    return this.targets;
  }

  /**
   * Gets a specific texture by index
   */
  public getTexture(index: number): THREE.Texture {
    if (index < 0 || index >= this.count) {
      throw new Error(`Texture index out of range: ${index} (count: ${this.count})`);
    }
    return this.targets.texture[index];
  }

  /**
   * Gets all textures
   */
  public getTextures(): THREE.Texture[] {
    return this.targets.texture as THREE.Texture[];
  }

  /**
   * Resizes the render targets
   */
  public setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) {
      return; // No resize needed
    }

    this.width = width;
    this.height = height;

    this.targets.setSize(width, height);
  }

  /**
   * Disposes of all render targets
   */
  public dispose(): void {
    this.targets.dispose();
  }
}

