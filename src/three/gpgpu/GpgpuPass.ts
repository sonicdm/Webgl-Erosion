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
      
      // Verify framebuffer status for MRT (only log errors)
      const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
        const statusNames: { [key: number]: string } = {
          0x8CD5: 'FRAMEBUFFER_COMPLETE',
          0x8CD6: 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT',
          0x8CD7: 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT',
          0x8CD9: 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS',
          0x8CDD: 'FRAMEBUFFER_UNSUPPORTED'
        };
        const statusName = statusNames[fbStatus] || `0x${fbStatus.toString(16)}`;
        console.error('MRT framebuffer error:', statusName);
        // Log texture info for debugging
        for (let i = 0; i < mrt.texture.length; i++) {
          const tex = mrt.texture[i];
          console.error(`MRT texture ${i}:`, {
            type: tex.type,
            format: tex.format,
            width: tex.image?.width,
            height: tex.image?.height
          });
        }
      }
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
    
    // Clear any WebGL errors before rendering
    while (gl.getError() !== gl.NO_ERROR) {}
    
    // Render - Three.js requires objects to be in a scene
    // The key is that render() must be called with a valid render target set
    renderer.render(this.scene, camera);
    
    // Check for WebGL errors after rendering
    let glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
      const errorNames: { [key: number]: string } = {
        0x0500: 'INVALID_ENUM',
        0x0501: 'INVALID_VALUE',
        0x0502: 'INVALID_OPERATION',
        0x0503: 'INVALID_FRAMEBUFFER_OPERATION',
        0x0504: 'OUT_OF_MEMORY',
        0x0505: 'CONTEXT_LOST_WEBGL'
      };
      console.error('WebGL error after render:', errorNames[glError] || `0x${glError.toString(16)}`);
    }
    
    // Check for shader compilation/linking errors (only log if there's a problem)
    const program = (this.material as any).program;
    if (program && gl instanceof WebGL2RenderingContext) {
      const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
      if (!linked) {
        const log = gl.getProgramInfoLog(program);
        console.error('Shader program link error:', log);
      }
    }
    
    // Check for WebGL errors after render (only log if there's an error)
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      const errorNames: { [key: number]: string } = {
        0x0500: 'INVALID_ENUM',
        0x0501: 'INVALID_VALUE',
        0x0502: 'INVALID_OPERATION',
        0x0503: 'INVALID_FRAMEBUFFER_OPERATION',
        0x0504: 'OUT_OF_MEMORY',
        0x0505: 'CONTEXT_LOST_WEBGL'
      };
      console.error('WebGL error:', errorNames[error] || `0x${error.toString(16)}`);
    }
    
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

