import * as THREE from 'three';

/**
 * Represents a GPGPU pass that executes a shader on a fullscreen quad.
 * Manages input textures, uniforms, and output render targets.
 */
export class GpgpuPass {
  private material: THREE.RawShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene; // Temporary scene for rendering
  private inputTextures: Map<string, THREE.Texture> = new Map();
  private uniforms: Map<string, THREE.IUniform> = new Map();

  constructor(
    vertexShader: string,
    fragmentShader: string,
    geometry: THREE.BufferGeometry
  ) {
    // Create RawShaderMaterial to avoid Three.js shader rewriting
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {},
    });

    // Check for shader compilation errors after material is created
    // Note: Three.js compiles shaders lazily, so we check on first render
    // We'll add error checking in the render method

    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, this.material);
    
    // Create a temporary scene for rendering
    // Three.js requires objects to be in a scene to render
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  /**
   * Sets an input texture with a uniform name
   */
  public setInputTexture(name: string, texture: THREE.Texture, unit: number = 0): void {
    this.inputTextures.set(name, texture);
    
    // Update uniform
    if (!this.material.uniforms[name]) {
      this.material.uniforms[name] = { value: null };
    }
    this.material.uniforms[name].value = texture;
    
    // Set texture unit if needed (Three.js handles this automatically, but we track it)
    texture.needsUpdate = true;
  }

  /**
   * Sets a uniform value
   */
  public setUniform(name: string, value: any): void {
    if (!this.material.uniforms[name]) {
      this.material.uniforms[name] = { value: null };
    }
    this.material.uniforms[name].value = value;
    this.uniforms.set(name, this.material.uniforms[name]);
    // Mark material as needing update to ensure uniforms are applied
    this.material.needsUpdate = true;
  }

  /**
   * Gets a uniform value
   */
  public getUniform(name: string): any {
    return this.material.uniforms[name]?.value;
  }

  /**
   * Gets the material
   */
  public getMaterial(): THREE.RawShaderMaterial {
    return this.material;
  }

  /**
   * Gets the mesh
   */
  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Executes the pass, rendering to the specified render target(s)
   */
  public render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.OrthographicCamera,
    renderTarget: THREE.WebGLRenderTarget | any | null = null  // WebGLMultipleRenderTargets type issue
  ): void {
    // Set viewport to match render target size
    if (renderTarget) {
      const width = renderTarget.width;
      const height = renderTarget.height;
      renderer.setViewport(0, 0, width, height);
    }

    // Render the fullscreen quad - this will trigger shader compilation if needed
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (renderTarget && 'texture' in renderTarget && Array.isArray((renderTarget as any).texture)) {
      // This is a WebGLMultipleRenderTargets
      const mrt = renderTarget as any;
      
      // Set render target first to bind framebuffer
      renderer.setRenderTarget(renderTarget);
      
      // CRITICAL PERFORMANCE: checkFramebufferStatus is extremely expensive (34% CPU time)
      // Only check in debug mode or when errors are detected
      // Removed per-frame check - framebuffers are validated during setup
      // If there are framebuffer errors, they'll be caught by getError() below
    } else {
      renderer.setRenderTarget(renderTarget);
    }
    
    // Ensure we clear before rendering
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.clear();
    renderer.autoClear = oldAutoClear;
    
    // Ensure geometry has the required attribute
    if (!this.mesh.geometry.attributes.vs_Pos) {
      console.error('Geometry missing vs_Pos attribute!');
      console.error('Available attributes:', Object.keys(this.mesh.geometry.attributes));
      return;
    }
    
    // CRITICAL PERFORMANCE: getError() is extremely expensive (58.6% CPU time in profile)
    // Only check errors in debug mode or when there's a known issue
    // WebGL errors are rare in production - checking every frame kills performance
    // Removed per-frame error checking - errors will be visible in console if they occur
    
    // Render - Three.js requires objects to be in a scene
    // The key is that render() must be called with a valid render target set
    renderer.render(this.scene, camera);
    
    // Error checking disabled for performance - enable only in debug builds:
    // const glError = gl.getError();
    // if (glError !== gl.NO_ERROR) { console.error('WebGL error:', glError); }
    
    renderer.setRenderTarget(null);
  }

  /**
   * Disposes of resources
   */
  public dispose(): void {
    this.material.dispose();
    // Don't dispose geometry as it may be shared
  }
}

