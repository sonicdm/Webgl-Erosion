import * as THREE from 'three';
import { shaderManifest } from '../../shaders/manifest';

/**
 * Base class for GPGPU pass materials.
 * Provides common functionality for all simulation passes.
 */
export abstract class BasePassMaterial {
  protected material: THREE.RawShaderMaterial;
  protected fragmentShader: string;

  constructor(fragmentShader: string) {
    this.fragmentShader = fragmentShader;
    const quadVertShader = shaderManifest.getShaderSource('quadVert');
    
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: quadVertShader.vert!,
      fragmentShader: fragmentShader,
      uniforms: {},
    });
  }

  /**
   * Gets the Three.js material
   */
  public getMaterial(): THREE.RawShaderMaterial {
    return this.material;
  }

  /**
   * Sets a uniform value
   */
  protected setUniform(name: string, value: any): void {
    if (!this.material.uniforms[name]) {
      this.material.uniforms[name] = { value: null };
    }
    this.material.uniforms[name].value = value;
  }

  /**
   * Gets a uniform value
   */
  protected getUniform(name: string): any {
    return this.material.uniforms[name]?.value;
  }

  /**
   * Sets an input texture
   */
  protected setTexture(name: string, texture: THREE.Texture): void {
    this.setUniform(name, texture);
  }

  /**
   * Disposes of the material
   */
  public dispose(): void {
    this.material.dispose();
  }
}

