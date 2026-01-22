/**
 * Integration layer between Three.js runtime and existing WebGL pipeline.
 * This allows switching between runtimes and sharing state.
 */

import { ThreeJSRuntime } from './main';
import { SimulationPassManager } from './simulation/SimulationPassManager';
import { readCombinedHeight } from './utils/combined-height-readback';
import * as THREE from 'three';
import Camera from '../Camera';
import { ControlsConfig } from '../controls-config';
import { createTerrainGeometry, updateTerrainGeometry } from '../utils/terrain-geometry-builder';
import { createTerrainProceduralMaterial, updateTerrainProceduralMaterial } from './materials/terrain-procedural-material';

/**
 * Main Three.js simulation runtime that integrates with the existing system
 */
export class ThreeJSSimulationRuntime {
  private runtime: ThreeJSRuntime;
  private passManager: SimulationPassManager | null = null;
  private simres: number;
  private terrainMesh: THREE.Mesh | null = null;
  private terrainGeometry: THREE.BufferGeometry | null = null;
  private heightMapCpuBuffer: Float32Array;
  private controls: any = null; // Store controls for material updates
  private renderFrameCount: number = 0; // Track render calls for debugging
  private camera: Camera | null = null; // Custom camera with WASD movement
  private controlsConfig: ControlsConfig | null = null; // Camera configuration

  constructor(canvas: HTMLCanvasElement, glContext: WebGL2RenderingContext, simres: number) {
    this.runtime = new ThreeJSRuntime(canvas, glContext);
    this.simres = simres;
    this.heightMapCpuBuffer = new Float32Array(simres * simres * 4);
  }
  
  /**
   * Sets the camera configuration (called from main.ts after controlsConfig is loaded)
   */
  public setControlsConfig(controlsConfig: ControlsConfig, brushUsesLeftClick: boolean): void {
    this.controlsConfig = controlsConfig;
    
    // Create Camera instance - it creates its own Three.js camera internally
    // Use initial position that matches the runtime's camera
    const initialPos = [0, 15, 15] as [number, number, number];
    const initialTarget = [0, 0, 0] as [number, number, number];
    
    this.camera = new Camera(
      initialPos,
      initialTarget,
      controlsConfig.camera,
      brushUsesLeftClick
    );
    
    // Replace the runtime's camera with the Camera's Three.js camera
    // This way the Camera class owns the camera and controls it properly
    this.runtime.setCamera(this.camera.threeCamera);
    
    console.log('Custom Camera initialized with WASD movement support');
  }
  
  /**
   * Gets the Three.js camera for rendering (from Camera wrapper)
   */
  public getThreeJSCamera(): THREE.Camera {
    if (this.camera) {
      return this.camera.threeCamera;
    }
    return this.runtime.getCamera();
  }
  
  /**
   * Gets the custom Camera instance (for event handlers)
   */
  public getCamera(): Camera | null {
    return this.camera;
  }

  /**
   * Initializes the simulation pass manager
   */
  public initializeSimulation(): void {
    if (this.passManager) {
      this.passManager.dispose();
    }

    const renderer = this.runtime.getRenderer();
    const camera = this.runtime.getGPGPUCamera();
    const quad = this.runtime.getFullscreenQuad();

    this.passManager = new SimulationPassManager(
      renderer,
      camera,
      quad,
      this.simres
    );
  }

  /**
   * Initializes terrain textures with procedural generation or heightmap
   */
  public async initializeTextures(
    controls: any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): Promise<void> {
    if (!this.passManager) {
      this.initializeSimulation();
    }
    this.controls = controls; // Store controls for material updates
    await this.passManager!.initializeTextures(controls, timer, heightmapSource, terrainRandom);
  }

  /**
   * Executes one simulation step
   */
  public executeSimulationStep(controls: any): void {
    if (!this.passManager) {
      this.initializeSimulation();
    }
    this.passManager!.executeStep(controls);
  }

  /**
   * Gets combined height for raycasting/geometry updates
   * Uses stored initial heightmap if available to avoid GPU readback issues
   */
  public readCombinedHeight(): Float32Array {
    if (!this.passManager) {
      throw new Error('Simulation not initialized');
    }

    // Try to use stored initial heightmap first (avoids GPU readback issues)
    const initialHeightmap = this.passManager.getInitialHeightmap();
    if (initialHeightmap) {
      // Use stored heightmap for initial terrain
      const size = this.simres * this.simres;
      const combinedBuffer = new Float32Array(size * 4);
      combinedBuffer.set(initialHeightmap);
      this.heightMapCpuBuffer.set(combinedBuffer);
      
      return combinedBuffer;
    }

    // Fallback to GPU readback (may not work with FloatType)
    const renderer = this.runtime.getRenderer();
    const gl = renderer.getContext() as WebGL2RenderingContext;
    
    // Get the actual render targets, not just textures
    const terrainTarget = this.passManager.getTerrainRenderTarget();
    const lavaTarget = this.passManager.getLavaRenderTarget();
    
    const size = this.simres * this.simres;
    const terrainBuffer = new Float32Array(size * 4);
    const lavaBuffer = new Float32Array(size * 4);
    
    // Save current render target
    const originalRenderTarget = renderer.getRenderTarget();
    
    try {
      // Read from terrain render target - must set it as active first
      renderer.setRenderTarget(terrainTarget);
      // Force a flush to ensure GPU has finished writing
      gl.finish();
      
      // Use WebGL2 readPixels directly for FloatType textures
      // Three.js stores framebuffer in properties.get(renderTarget).__webglFramebuffer
      const properties = (renderer as any).properties;
      const terrainFramebuffer = properties?.get(terrainTarget)?.__webglFramebuffer;
      if (terrainFramebuffer) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, terrainFramebuffer);
        gl.readPixels(0, 0, this.simres, this.simres, gl.RGBA, gl.FLOAT, terrainBuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      } else {
        // Fallback to Three.js method
        renderer.readRenderTargetPixels(terrainTarget, 0, 0, this.simres, this.simres, terrainBuffer);
      }
      
      // Read from lava render target
      renderer.setRenderTarget(lavaTarget);
      gl.finish();
      
      const lavaFramebuffer = (renderer as any).properties?.get(lavaTarget)?.__webglFramebuffer;
      if (lavaFramebuffer) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, lavaFramebuffer);
        gl.readPixels(0, 0, this.simres, this.simres, gl.RGBA, gl.FLOAT, lavaBuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      } else {
        renderer.readRenderTargetPixels(lavaTarget, 0, 0, this.simres, this.simres, lavaBuffer);
      }
      
      // Check if we got valid data
      const hasTerrainData = terrainBuffer.some((val, i) => i % 4 === 0 && Math.abs(val) > 0.001);
      console.log('Readback - terrain has data:', hasTerrainData);
      if (hasTerrainData) {
        console.log('Terrain buffer first 16 values:', Array.from(terrainBuffer.slice(0, 16)));
      } else {
        console.warn('Terrain buffer is all zeros - readback may have failed');
      }
    } catch (error) {
      console.error('Error reading render targets:', error);
    } finally {
      // Restore original render target
      renderer.setRenderTarget(originalRenderTarget);
    }
    
    // Combine heights: terrain (R) + lava volume (R)
    const combinedBuffer = new Float32Array(size * 4);
    for (let i = 0; i < size; i++) {
      const terrainHeight = terrainBuffer[i * 4 + 0]; // R channel = terrain + sediment
      const lavaVolume = lavaBuffer[i * 4 + 0]; // R channel = lava volume
      
      // Validate lava volume
      const lavaTemp = lavaBuffer[i * 4 + 1]; // G channel = lava temperature
      let validLavaVolume = 0.0;
      const LAVA_MAX_VOLUME = 50.0;
      
      if (lavaVolume >= 0.0 && lavaTemp >= 0.0 && lavaTemp <= 2000.0) {
        validLavaVolume = Math.min(Math.max(lavaVolume, 0.0), LAVA_MAX_VOLUME);
      }
      
      // Combined height = terrain + sediment + lava
      combinedBuffer[i * 4 + 0] = terrainHeight + validLavaVolume;
      combinedBuffer[i * 4 + 1] = terrainBuffer[i * 4 + 1]; // Water volume
      combinedBuffer[i * 4 + 2] = terrainBuffer[i * 4 + 2]; // Rock material
      combinedBuffer[i * 4 + 3] = terrainBuffer[i * 4 + 3]; // Base rock surface
    }
    
    // Update internal buffer
    this.heightMapCpuBuffer.set(combinedBuffer);
    return combinedBuffer;
  }

  /**
   * Updates terrain geometry from height data
   * Uses THREE.Terrain mesh if available, otherwise creates geometry from heightmap
   */
  public updateTerrainGeometry(heightData: Float32Array): void {
    console.log('updateTerrainGeometry called, heightData length:', heightData.length);
    
    // Check if height data is valid (not all zeros)
    const hasValidData = heightData.some((val, i) => i % 4 === 0 && val !== 0);
    if (!hasValidData) {
      console.warn('Height data appears to be all zeros, terrain may not render correctly');
    }
    
    // Use THREE.Terrain mesh directly (as per official GitHub documentation)
    // THREE.Terrain() returns a Scene with mesh - use it directly
    const terrainMesh = this.passManager?.getTerrainMesh();
    if (terrainMesh && !this.terrainMesh) {
      console.log('Using THREE.Terrain generated mesh for rendering (official usage)');
      // Use the mesh directly from THREE.Terrain - it already has geometry and material
      this.terrainMesh = terrainMesh;
      this.terrainGeometry = terrainMesh.geometry;
      
      // THREE.Terrain mesh is already properly configured, just add to scene
      const scene = this.runtime.getScene();
      scene.add(this.terrainMesh);
      console.log('THREE.Terrain mesh added to scene (using official THREE.Terrain mesh)');
      return;
    }
    
    if (!this.terrainGeometry) {
      console.log('Creating new terrain geometry...');
      this.terrainGeometry = createTerrainGeometry(this.simres, heightData, 1.0);
      console.log('Terrain geometry created, vertices:', this.terrainGeometry.attributes.position.count);
      
      // Create terrain mesh
      if (!this.terrainMesh) {
        console.log('Creating terrain mesh...');
        // Create procedural shader material based on height and slope
        // Calculate height range from geometry
        const positions = this.terrainGeometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < positions.length; i += 3) { // y is at index 1
          const y = positions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }
        
        // Use procedural shader material
        // TEMPORARY: Use simple material to verify 3D geometry is working
        const useSimpleMaterial = true; // Set to true to test with basic material
        const material = useSimpleMaterial 
          ? new THREE.MeshStandardMaterial({ 
              color: 0x888888, 
              wireframe: false,
              side: THREE.DoubleSide,
              flatShading: false // Use smooth shading to see 3D
            })
          : createTerrainProceduralMaterial({
              minHeight: minHeight,
              maxHeight: maxHeight,
              snowRange: 0.0, // Will be updated from controls
              forestRange: 0.0, // Will be updated from controls
              terrainPalette: 1, // Default to Desert, will be updated from controls
            });
        
        this.terrainMesh = new THREE.Mesh(this.terrainGeometry, material);
        // Terrain geometry already lies in XZ with Y as height; keep identity rotation.
        this.terrainMesh.rotation.set(0, 0, 0);
        // Scale terrain to be more visible (make it 10x larger)
        this.terrainMesh.scale.set(10, 10, 10);
        this.terrainMesh.position.set(0, 0, 0);
        this.terrainMesh.frustumCulled = false; // Disable frustum culling for debugging
        this.terrainMesh.matrixAutoUpdate = true;
        
        const scene = this.runtime.getScene();
        scene.add(this.terrainMesh);
        console.log('Terrain mesh added to scene');
        
        // Camera is already positioned by Camera class constructor
        // Just log the position if Camera is available
        if (this.camera) {
          console.log('Camera positioned at:', this.camera.threeCamera.position, 'looking at:', this.camera.threeCamera.getWorldDirection(new THREE.Vector3()));
        }
      } else {
        this.terrainMesh.geometry.dispose();
        this.terrainMesh.geometry = this.terrainGeometry;
      }
    } else {
      updateTerrainGeometry(this.terrainGeometry, this.simres, heightData, 1.0);
    }
    if (this.terrainMesh && this.terrainGeometry) {
      // Ensure geometry has proper indices and faces (not wireframe)
      if (!this.terrainGeometry.index || this.terrainGeometry.index.count === 0) {
        console.warn('Terrain geometry missing indices - computing them');
        this.terrainGeometry.computeVertexNormals();
      }
      
      this.terrainMesh.geometry.attributes.position.needsUpdate = true;
      // Ensure normals are computed for the shader
      if (!this.terrainMesh.geometry.attributes.normal) {
        this.terrainMesh.geometry.computeVertexNormals();
      } else {
        this.terrainMesh.geometry.attributes.normal.needsUpdate = true;
      }
      
      // Ensure material is not wireframe and geometry has proper faces
      if (this.terrainMesh.material instanceof THREE.Material) {
        (this.terrainMesh.material as any).wireframe = false;
        this.terrainMesh.material.needsUpdate = true;
      }
      
      // Ensure geometry has indices (faces) - if missing, it will render as wireframe
      if (!this.terrainGeometry.index || this.terrainGeometry.index.count === 0) {
        console.error('Terrain geometry missing indices! This will cause wireframe rendering.');
        // Geometry should have indices from terrain-geometry-builder, but check anyway
      }
      
      // Update procedural material if it's a shader material
      if ((this.terrainMesh.material instanceof THREE.ShaderMaterial || this.terrainMesh.material instanceof THREE.RawShaderMaterial) && this.controls) {
        // Recalculate height range
        const positions = this.terrainGeometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
          const y = positions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }
        
        updateTerrainProceduralMaterial(this.terrainMesh.material as THREE.ShaderMaterial | THREE.RawShaderMaterial, {
          minHeight: minHeight,
          maxHeight: maxHeight,
          snowRange: this.controls.SnowRange || 0.0,
          forestRange: this.controls.ForestRange || 0.0,
          terrainPalette: this.controls.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
        });
      }
    }
  }
  
  /**
   * Updates material parameters from controls
   */
  public updateMaterialFromControls(controls: any): void {
    this.controls = controls;
    if (this.terrainMesh && (this.terrainMesh.material instanceof THREE.ShaderMaterial || this.terrainMesh.material instanceof THREE.RawShaderMaterial) && this.terrainGeometry) {
      const positions = this.terrainGeometry.attributes.position.array as Float32Array;
      let minHeight = Infinity;
      let maxHeight = -Infinity;
      for (let i = 1; i < positions.length; i += 3) {
        const y = positions[i];
        if (y < minHeight) minHeight = y;
        if (y > maxHeight) maxHeight = y;
      }
      
      updateTerrainProceduralMaterial(this.terrainMesh.material as THREE.ShaderMaterial | THREE.RawShaderMaterial, {
        minHeight: minHeight,
        maxHeight: maxHeight,
        snowRange: controls.SnowRange || 0.0,
        forestRange: controls.ForestRange || 0.0,
        terrainPalette: controls.TerrainPlatte !== undefined ? controls.TerrainPlatte : 1,
      });
    }
  }

  /**
   * Renders the scene
   */
  public render(): void {
    const renderer = this.runtime.getRenderer();
    const scene = this.runtime.getScene();
    const camera = this.runtime.getCamera();
    
    // Don't render if terrain mesh hasn't been created yet
    if (!this.terrainMesh) {
      console.warn('Render called but terrain mesh not created yet');
      return;
    }
    
    // Ensure material uniforms are valid before rendering
    if (this.terrainMesh.material instanceof THREE.RawShaderMaterial || this.terrainMesh.material instanceof THREE.ShaderMaterial) {
      const material = this.terrainMesh.material;
      if (!material.uniforms) {
        console.warn('Terrain material has no uniforms, skipping render');
        return;
      }
      
      // Check that all required uniforms exist and have valid values
      const requiredUniforms = ['u_MinHeight', 'u_MaxHeight', 'u_SnowRange', 'u_ForestRange', 'u_TerrainPalette'];
      for (const uniformName of requiredUniforms) {
        const uniform = material.uniforms[uniformName];
        if (!uniform) {
          console.warn(`Terrain material missing uniform: ${uniformName}, skipping render`);
          return;
        }
        // Ensure uniform has a value property
        if (uniform.value === undefined) {
          console.warn(`Terrain material uniform ${uniformName} has no value, skipping render`);
          return;
        }
      }
    }
    
    renderer.setRenderTarget(null);
    
    // CRITICAL FIX: Reset viewport to match renderer size
    // GPGPU passes set viewport to simres (1024x1024), but we need full canvas size for scene rendering
    const rendererSize = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, rendererSize.x, rendererSize.y);
    
    renderer.clear();
    
    // Log scene contents for debugging (only first frame and every 5 seconds)
    this.renderFrameCount++;
    if (this.renderFrameCount === 1 || this.renderFrameCount % 300 === 0) {
      console.log('Render frame', this.renderFrameCount, '- Scene children:', scene.children.length, 'Terrain mesh in scene:', scene.children.includes(this.terrainMesh!));
      if (this.terrainMesh) {
        console.log('Terrain mesh - visible:', this.terrainMesh.visible, 'position:', this.terrainMesh.position, 'scale:', this.terrainMesh.scale, 'geometry vertices:', this.terrainMesh.geometry.attributes.position.count);
      }
    }
    
    try {
      // Update custom Camera (handles OrbitControls + WASD movement)
      // This must be called every frame, just like in the original tick() function
      if (this.camera && this.controlsConfig) {
        this.camera.update(this.controlsConfig.camera);
        // Use the Camera's Three.js camera for rendering
        renderer.render(scene, this.camera.threeCamera);
      } else {
        // Fallback to runtime camera if Camera wrapper not available
        renderer.render(scene, camera);
      }
    } catch (error) {
      console.error('Error during render:', error);
      // Don't throw - just log the error
    }
  }

  /**
   * Updates simulation resolution
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
    if (this.passManager) {
      this.passManager.setSimRes(simres);
    }
  }

  /**
   * Gets the Three.js renderer
   */
  public getRenderer(): THREE.WebGLRenderer {
    return this.runtime.getRenderer();
  }

  /**
   * Gets the main scene
   */
  public getScene(): THREE.Scene {
    return this.runtime.getScene();
  }


  /**
   * Gets the current terrain geometry for export utilities
   */
  public getTerrainGeometry(): THREE.BufferGeometry | null {
    return this.terrainGeometry;
  }

  /**
   * Starts the animation loop
   */
  public start(): void {
    this.runtime.start();
  }

  /**
   * Stops the animation loop
   */
  public stop(): void {
    this.runtime.stop();
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    this.camera = null;
    if (this.passManager) {
      this.passManager.dispose();
    }
    this.runtime.dispose();
    this.terrainMesh?.geometry.dispose();
    (this.terrainMesh?.material as THREE.Material)?.dispose();
  }
}

