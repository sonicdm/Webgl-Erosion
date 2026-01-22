/**
 * Integration layer between Three.js runtime and existing WebGL pipeline.
 * This allows switching between runtimes and sharing state.
 */

import { ThreeJSRuntime } from './main';
import { SimulationPassManager } from './simulation/SimulationPassManager';
import { readCombinedHeight } from './utils/combined-height-readback';
import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
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
    // Use initial position that provides a good view of the terrain
    // Terrain will be scaled to ~300 units, so camera should be positioned accordingly
    // Position camera at a reasonable distance to see the terrain clearly
    // Camera constructor expects vec3 from gl-matrix, so create proper vec3 arrays
    const initialPos = vec3.fromValues(150, 200, 150); // Closer position for scaled terrain
    const initialTarget = vec3.fromValues(0, 0, 0); // Look at terrain center
    
    this.camera = new Camera(
      initialPos,
      initialTarget,
      controlsConfig.camera,
      brushUsesLeftClick
    );
    
    // Ensure OrbitControls target is set to look at terrain center
    if (this.camera.threeControls) {
      this.camera.threeControls.target.set(initialTarget[0], initialTarget[1], initialTarget[2]);
      this.camera.threeControls.update();
    }
    
    // Replace the runtime's camera with the Camera's Three.js camera
    // This way the Camera class owns the camera and controls it properly
    this.runtime.setCamera(this.camera.threeCamera);
    
    console.log('Custom Camera initialized with WASD movement support');
    console.log('Camera position:', this.camera.threeCamera.position);
    console.log('Camera target:', this.camera.threeControls?.target);
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
   * Gets the heightmap CPU buffer for brush system access
   * This buffer is kept in sync with GPU state via readCombinedHeight()
   */
  public getHeightMapCpuBuffer(): Float32Array {
    return this.heightMapCpuBuffer;
  }

  /**
   * Gets combined height for raycasting/geometry updates
   * Uses stored initial heightmap if available to avoid GPU readback issues
   * Updates heightMapCpuBuffer to keep it synchronized
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
      
      // Check if we got valid data (throttled logging - only log warnings)
      const hasTerrainData = terrainBuffer.some((val, i) => i % 4 === 0 && Math.abs(val) > 0.001);
      if (!hasTerrainData) {
        // Only log if there's a problem (reduces noise)
        console.warn('[Heightmap Readback] Terrain buffer is all zeros - readback may have failed');
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
    
    // Update internal buffer (synchronized for brush raycasting)
    this.heightMapCpuBuffer.set(combinedBuffer);
    return combinedBuffer;
  }

  /**
   * Updates terrain geometry from height data
   * Uses THREE.Terrain mesh if available, otherwise creates geometry from heightmap
   */
  public updateTerrainGeometry(heightData: Float32Array): void {
    // Use THREE.Terrain mesh directly (already properly configured in SimulationPassManager)
    // The mesh is already rotated and ready to use - don't create new geometry
    const terrainMesh = this.passManager?.getTerrainMesh();
    if (terrainMesh && !this.terrainMesh) {
      console.log('[Terrain Update] Using THREE.Terrain generated mesh for rendering');
      this.terrainMesh = terrainMesh;
      this.terrainGeometry = terrainMesh.geometry;
      
      // Replace material with procedural terrain material
      const oldMaterial = this.terrainMesh.material;
      
      // Calculate height range from geometry for procedural material
      const positions = this.terrainMesh.geometry.attributes.position.array as Float32Array;
      let minHeight = Infinity;
      let maxHeight = -Infinity;
      for (let i = 1; i < positions.length; i += 3) { // y is at index 1 (after rotation)
        const y = positions[i];
        if (y < minHeight) minHeight = y;
        if (y > maxHeight) maxHeight = y;
      }
      
      try {
        this.terrainMesh.material = createTerrainProceduralMaterial({
          minHeight: minHeight,
          maxHeight: maxHeight,
          snowRange: this.controls?.SnowRange || 0.0,
          forestRange: this.controls?.ForestRange || 0.0,
          terrainPalette: this.controls?.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
        });
        console.log('[Terrain Update] Material replaced with procedural terrain material');
      } catch (error) {
        console.warn('[Terrain Update] Failed to create procedural material, using fallback:', error);
        // Fallback to simple material
        this.terrainMesh.material = new THREE.MeshStandardMaterial({
          color: 0x888888,
          wireframe: false,
          side: THREE.DoubleSide,
          flatShading: false
        });
      }
      
      if (oldMaterial instanceof THREE.Material) {
        oldMaterial.dispose();
      }
      
      // Mesh is already configured (position, rotation, scale set in SimulationPassManager)
      // Just add to scene
      const scene = this.runtime.getScene();
      scene.add(this.terrainMesh);
      
      console.log('[Terrain Update] THREE.Terrain mesh added to scene');
      console.log('[Terrain Update] Mesh details:', {
        visible: this.terrainMesh.visible,
        position: this.terrainMesh.position,
        scale: this.terrainMesh.scale,
        rotation: this.terrainMesh.rotation,
        geometryVertices: this.terrainMesh.geometry.attributes.position.count
      });
      return;
    }
    
    // If mesh already exists, don't recreate it - just return
    if (this.terrainMesh) {
      return;
    }
    
    // Fallback: Create geometry from heightmap if THREE.Terrain mesh not available
    if (!this.terrainGeometry) {
      console.log('[Terrain Update] THREE.Terrain mesh not available, creating geometry from heightmap');
      this.terrainGeometry = createTerrainGeometry(this.simres, heightData, 1.0);
      
      // Create terrain mesh from the geometry
      if (!this.terrainMesh) {
        // Calculate height range from geometry for procedural material
        const positions = this.terrainGeometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < positions.length; i += 3) { // y is at index 1
          const y = positions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }
        
        // Create procedural terrain material with height-based coloring
        // TEMPORARY: Use simple material to verify geometry renders correctly
        const useSimpleMaterialForDebugging = true;
        
        let material: THREE.Material;
        if (useSimpleMaterialForDebugging) {
          // Use simple material to verify geometry is visible
          material = new THREE.MeshStandardMaterial({
            color: 0x00ff00, // Bright green for visibility
            wireframe: false,
            side: THREE.DoubleSide,
            flatShading: false
          });
          console.log('[Terrain Update] Using simple green material for debugging');
        } else {
          try {
            material = createTerrainProceduralMaterial({
              minHeight: minHeight,
              maxHeight: maxHeight,
              snowRange: this.controls?.SnowRange || 0.0,
              forestRange: this.controls?.ForestRange || 0.0,
              terrainPalette: this.controls?.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
            });
            console.log('[Terrain Update] Material created with procedural terrain material');
          } catch (error) {
            console.warn('[Terrain Update] Failed to create procedural material, using fallback:', error);
            material = new THREE.MeshStandardMaterial({
              color: 0x888888,
              wireframe: false,
              side: THREE.DoubleSide,
              flatShading: false
            });
          }
        }
        
        // Create mesh from geometry (geometry is already in correct XZ plane orientation)
        this.terrainMesh = new THREE.Mesh(this.terrainGeometry, material);
        this.terrainMesh.position.set(0, 0, 0);
        this.terrainMesh.rotation.set(0, 0, 0); // No rotation needed - geometry is already correct
        this.terrainMesh.scale.set(1, 1, 1);
        this.terrainMesh.frustumCulled = false;
        this.terrainMesh.updateMatrixWorld(true);
        
        // Add to scene
        const scene = this.runtime.getScene();
        scene.add(this.terrainMesh);
        
        console.log('[Terrain Update] Terrain mesh created and added to scene using createTerrainGeometry');
        console.log('[Terrain Update] Mesh details:', {
          visible: this.terrainMesh.visible,
          position: this.terrainMesh.position,
          scale: this.terrainMesh.scale,
          rotation: this.terrainMesh.rotation,
          material: this.terrainMesh.material.type,
          geometryVertices: this.terrainMesh.geometry.attributes.position.count,
          boundingBox: this.terrainGeometry.boundingBox ? {
            min: this.terrainGeometry.boundingBox.min,
            max: this.terrainGeometry.boundingBox.max,
            size: {
              x: (this.terrainGeometry.boundingBox.max.x - this.terrainGeometry.boundingBox.min.x).toFixed(2),
              y: (this.terrainGeometry.boundingBox.max.y - this.terrainGeometry.boundingBox.min.y).toFixed(2),
              z: (this.terrainGeometry.boundingBox.max.z - this.terrainGeometry.boundingBox.min.z).toFixed(2)
            }
          } : 'No bounding box'
        });
        return;
      }
    }
    
    // If mesh already exists, update its geometry from simulation results
    if (this.terrainMesh && this.terrainGeometry) {
      // Update existing geometry from height data
      updateTerrainGeometry(this.terrainGeometry, this.simres, heightData, 1.0);
      this.terrainMesh.geometry.attributes.position.needsUpdate = true;
      if (this.terrainMesh.geometry.attributes.normal) {
        this.terrainMesh.geometry.attributes.normal.needsUpdate = true;
      } else {
        this.terrainMesh.geometry.computeVertexNormals();
      }
      
      // Update material height range if using procedural material
      if ((this.terrainMesh.material instanceof THREE.ShaderMaterial || this.terrainMesh.material instanceof THREE.RawShaderMaterial) && this.controls) {
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
      return;
    }
    
    // Fallback: Create new geometry and mesh if neither exists
    if (!this.terrainMesh) {
      console.log('Creating new terrain geometry and mesh...');
      this.terrainGeometry = createTerrainGeometry(this.simres, heightData, 1.0);
      
      // Calculate height range
      const positions = this.terrainGeometry.attributes.position.array as Float32Array;
      let minHeight = Infinity;
      let maxHeight = -Infinity;
      for (let i = 1; i < positions.length; i += 3) {
        const y = positions[i];
        if (y < minHeight) minHeight = y;
        if (y > maxHeight) maxHeight = y;
      }
      
      // Create material
      const useSimpleMaterial = true;
      const material = useSimpleMaterial 
        ? new THREE.MeshStandardMaterial({ 
            color: 0x888888, 
            wireframe: false,
            side: THREE.DoubleSide,
            flatShading: false
          })
        : createTerrainProceduralMaterial({
            minHeight: minHeight,
            maxHeight: maxHeight,
            snowRange: 0.0,
            forestRange: 0.0,
            terrainPalette: 1,
          });
      
      this.terrainMesh = new THREE.Mesh(this.terrainGeometry, material);
      // Terrain geometry already lies in XZ with Y as height; keep identity rotation.
      this.terrainMesh.rotation.set(0, 0, 0);
      this.terrainMesh.scale.set(1, 1, 1);
      this.terrainMesh.position.set(0, 0, 0);
      this.terrainMesh.frustumCulled = false;
      this.terrainMesh.matrixAutoUpdate = true;
      
      const scene = this.runtime.getScene();
      scene.add(this.terrainMesh);
      console.log('Terrain mesh added to scene');
    } else {
      // Update existing geometry
      if (this.terrainGeometry) {
        updateTerrainGeometry(this.terrainGeometry, this.simres, heightData, 1.0);
        if (this.terrainMesh) {
          this.terrainMesh.geometry.attributes.position.needsUpdate = true;
          if (this.terrainMesh.geometry.attributes.normal) {
            this.terrainMesh.geometry.attributes.normal.needsUpdate = true;
          } else {
            this.terrainMesh.geometry.computeVertexNormals();
          }
        }
      }
    }
  }
  
  /**
   * Updates material parameters from controls
   * Can be called with controls parameter or use stored this.controls
   */
  public updateMaterialFromControls(controls?: any): void {
    // Update stored controls if provided
    if (controls) {
      this.controls = controls;
    }
    
    // Use stored controls if no parameter provided
    const controlsToUse = controls || this.controls;
    if (!controlsToUse) {
      return;
    }
    
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
        snowRange: controlsToUse.SnowRange || 0.0,
        forestRange: controlsToUse.ForestRange || 0.0,
        terrainPalette: controlsToUse.TerrainPlatte !== undefined ? controlsToUse.TerrainPlatte : 1,
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
    renderer.state.reset();
    
    // CRITICAL FIX: Reset viewport to match renderer size
    // GPGPU passes set viewport to simres (1024x1024), but we need full canvas size for scene rendering
    const rendererSize = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, rendererSize.x, rendererSize.y);
    
    // Clear with a visible background color for debugging (can be removed later)
    renderer.setClearColor(0x87CEEB, 1.0); // Sky blue background
    renderer.clear(true, true, true); // Clear color, depth, and stencil
    
    // Log scene contents for debugging (throttled to reduce noise)
    this.renderFrameCount++;
    if (this.renderFrameCount === 1 || this.renderFrameCount % 600 === 0) {
      // Log only first frame and every 10 seconds (600 frames at 60fps)
      console.log('Render frame', this.renderFrameCount, '- Scene children:', scene.children.length, 'Terrain mesh in scene:', scene.children.includes(this.terrainMesh!));
      if (this.terrainMesh) {
        console.log('Terrain mesh - visible:', this.terrainMesh.visible, 'position:', this.terrainMesh.position, 'scale:', this.terrainMesh.scale, 'geometry vertices:', this.terrainMesh.geometry.attributes.position.count);
      }
    }
    
    try {
      // Update custom Camera (handles OrbitControls + WASD movement)
      // This must be called every frame, just like in the original tick() function
      if (this.camera && this.controlsConfig) {
        // Update camera aspect ratio to match renderer size
        const rendererSize = renderer.getSize(new THREE.Vector2());
        const aspect = rendererSize.x / rendererSize.y;
        if (this.camera.threeCamera.aspect !== aspect) {
          this.camera.threeCamera.aspect = aspect;
          this.camera.threeCamera.updateProjectionMatrix();
        }
        
        this.camera.update(this.controlsConfig.camera);
        const threeCamera = this.camera.threeCamera;
        
        // Debug camera position on first frame
        if (this.renderFrameCount === 1) {
          const bbox = this.terrainMesh.geometry.boundingBox;
          const terrainCenter = bbox ? new THREE.Vector3().addVectors(bbox.min, bbox.max).multiplyScalar(0.5) : new THREE.Vector3();
          const terrainSize = bbox ? new THREE.Vector3().subVectors(bbox.max, bbox.min) : new THREE.Vector3();
          const maxDim = Math.max(terrainSize.x, terrainSize.y, terrainSize.z);
          
          console.log('[Render] Camera position:', threeCamera.position);
          console.log('[Render] Camera target (looking at):', threeCamera.position.clone().add(threeCamera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100)));
          console.log('[Render] Camera near/far:', threeCamera.near, threeCamera.far);
          console.log('[Render] Terrain mesh bounds:', bbox ? {
            min: bbox.min,
            max: bbox.max,
            center: terrainCenter,
            size: terrainSize,
            maxDimension: maxDim
          } : 'No bounding box');
          
          // Check if terrain is in view frustum
          if (bbox) {
            const distance = threeCamera.position.distanceTo(terrainCenter);
            const isInFrustum = distance < threeCamera.far && distance > threeCamera.near;
            console.log('[Render] Terrain visibility check:', {
              distanceToCenter: distance.toFixed(2),
              isInFrustum: isInFrustum,
              cameraFar: threeCamera.far,
              terrainMaxDim: maxDim.toFixed(2)
            });
            
            // Suggest camera adjustment if terrain is too far
            if (distance > threeCamera.far * 0.8) {
              console.warn('[Render] WARNING: Terrain may be outside view frustum. Consider adjusting camera position or far plane.');
            }
          }
        }
        
        // Use the Camera's Three.js camera for rendering
        renderer.render(scene, threeCamera);
      } else {
        // Fallback to runtime camera if Camera wrapper not available
        console.warn('[Render] Using fallback camera');
        renderer.render(scene, camera);
      }
    } catch (error) {
      console.error('Error during render:', error);
      // Don't throw - just log the error
    }
  }

  /**
   * Regenerates terrain with new parameters
   */
  public async regenerateTerrain(controls: any, terrainRandom?: any): Promise<void> {
    console.log('[RegenerateTerrain] ===== START REGENERATE ====');
    if (!this.passManager) {
      console.error('[RegenerateTerrain] ERROR: Simulation not initialized');
      return;
    }

    try {
      // Store controls for use in material updates
      this.controls = controls;

      // Reinitialize textures with new parameters (this regenerates THREE.Terrain geometry)
      await this.passManager.initializeTextures(controls, 0, null, terrainRandom);
      console.log('[RegenerateTerrain] initializeTextures completed');

      // Wait a frame for GPU to finish processing
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Get the new mesh from passManager
      const newMesh = this.passManager.getTerrainMesh();
      if (newMesh) {
        // Remove old mesh from scene
        if (this.terrainMesh) {
          const scene = this.runtime.getScene();
          scene.remove(this.terrainMesh);
          if (this.terrainMesh.geometry) {
            this.terrainMesh.geometry.dispose();
          }
          if (this.terrainMesh.material instanceof THREE.Material) {
            this.terrainMesh.material.dispose();
          }
        }

        // Use the new mesh
        this.terrainMesh = newMesh;
        this.terrainGeometry = newMesh.geometry;

        // Replace material with procedural terrain material
        const positions = this.terrainMesh.geometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
          const y = positions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }

        const oldMaterial = this.terrainMesh.material;
        this.terrainMesh.material = createTerrainProceduralMaterial({
          minHeight: minHeight,
          maxHeight: maxHeight,
          snowRange: controls.SnowRange || 0.0,
          forestRange: controls.ForestRange || 0.0,
          terrainPalette: controls.TerrainPlatte !== undefined ? controls.TerrainPlatte : 1,
        });

        if (oldMaterial instanceof THREE.Material) {
          oldMaterial.dispose();
        }

        // Add new mesh to scene
        const scene = this.runtime.getScene();
        scene.add(this.terrainMesh);
        console.log('[RegenerateTerrain] Terrain regenerated successfully');
      } else {
        console.warn('[RegenerateTerrain] WARNING: No mesh from passManager');
      }
    } catch (error) {
      console.error('[RegenerateTerrain] ERROR: Failed to regenerate terrain:', error);
      throw error;
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
