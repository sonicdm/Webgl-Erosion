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
import { getWaterSourceCount, waterSources as waterSourcesList, MAX_WATER_SOURCES } from '../utils/water-sources';
import { getLavaSourceCount, lavaSources as lavaSourcesList, MAX_LAVA_SOURCES } from '../utils/lava-sources';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { setTerrainGeometry, setTerrainBVH, setTerrainBVHBuildInProgress, terrainBVHBuildInProgress, terrainBVH, terrainGeometry } from '../simulation/simulation-state';
import { rayCastBVH } from '../utils/bvh-raycast';
import { rayCast } from '../utils/raycast';
// CPU-side terraforming removed - now using GPU-based VTF displacement
// import { applyTerraforming, TerraformParams } from './utils/cpu-terraforming';

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
  private heightMapInitialized: boolean = false;
  private controls: any = null; // Store controls for material updates
  private renderFrameCount: number = 0; // Track render calls for debugging
  private camera: Camera | null = null; // Custom camera with WASD movement
  private controlsConfig: ControlsConfig | null = null; // Camera configuration
  private _textureDebugLogged: boolean = false; // Track if texture debug info has been logged
  // terraformingActive flag removed - terraforming is now GPU-based (rain shader)

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
   * @param controls - Simulation controls/parameters
   * @param timer - Time value for shaders (optional, defaults to 0)
   * @param brushState - Brush state (mouse world pos/dir, brush pos) (optional)
   */
  public executeSimulationStep(
    controls: any,
    timer: number = 0,
    brushState?: {
      mouseWorldPos?: [number, number, number, number];
      mouseWorldDir?: [number, number, number];
      brushPos?: [number, number];
    }
  ): void {
    if (!this.passManager) {
      this.initializeSimulation();
    }
    
    // Removed debug logging - was causing performance issues
    
    // Build water source arrays
    const waterSourceCount = getWaterSourceCount();
    const waterSourcePositions = new Float32Array(MAX_WATER_SOURCES * 2);
    const waterSourceSizes = new Float32Array(MAX_WATER_SOURCES);
    const waterSourceStrengths = new Float32Array(MAX_WATER_SOURCES);
    
    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
      if (i < waterSourceCount) {
        waterSourcePositions[i * 2] = waterSourcesList[i].position[0];
        waterSourcePositions[i * 2 + 1] = waterSourcesList[i].position[1];
        waterSourceSizes[i] = waterSourcesList[i].size;
        waterSourceStrengths[i] = waterSourcesList[i].strength;
      } else {
        waterSourcePositions[i * 2] = 0.0;
        waterSourcePositions[i * 2 + 1] = 0.0;
        waterSourceSizes[i] = 0.0;
        waterSourceStrengths[i] = 0.0;
      }
    }
    
    // Build lava source arrays
    const lavaSourceCount = getLavaSourceCount();
    const lavaSourcePositions = new Float32Array(MAX_LAVA_SOURCES * 2);
    const lavaSourceSizes = new Float32Array(MAX_LAVA_SOURCES);
    const lavaSourceStrengths = new Float32Array(MAX_LAVA_SOURCES);
    
    for (let i = 0; i < MAX_LAVA_SOURCES; i++) {
      if (i < lavaSourceCount) {
        lavaSourcePositions[i * 2] = lavaSourcesList[i].position[0];
        lavaSourcePositions[i * 2 + 1] = lavaSourcesList[i].position[1];
        lavaSourceSizes[i] = lavaSourcesList[i].size;
        lavaSourceStrengths[i] = lavaSourcesList[i].strength;
      } else {
        lavaSourcePositions[i * 2] = 0.0;
        lavaSourcePositions[i * 2 + 1] = 0.0;
        lavaSourceSizes[i] = 0.0;
        lavaSourceStrengths[i] = 0.0;
      }
    }
    
    // Build brush state from controls if not provided
    // Only use controls.posTemp if it's valid (not [-10, -10])
    let finalBrushState = brushState;
    if (!finalBrushState && controls.posTemp) {
      const [posTempX, posTempY] = controls.posTemp;
      if (posTempX >= 0 && posTempX <= 1 && posTempY >= 0 && posTempY <= 1) {
        finalBrushState = {
          brushPos: [posTempX, posTempY]
        };
      }
    }
    // If still no valid brushState, don't pass one (rain pass will handle invalid brushPos)
    if (!finalBrushState) {
      finalBrushState = undefined;
    }
    
    this.passManager!.executeStep(
      controls,
      timer,
      finalBrushState,
      {
        count: waterSourceCount,
        positions: waterSourcePositions,
        sizes: waterSourceSizes,
        strengths: waterSourceStrengths
      },
      {
        count: lavaSourceCount,
        positions: lavaSourcePositions,
        sizes: lavaSourceSizes,
        strengths: lavaSourceStrengths
      }
    );
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

    // CRITICAL PERFORMANCE: This function is extremely expensive (2+ seconds per call)
    // GPU readback with FLOAT type is not working - returns normalized values
    // For now, just return the initial heightmap immediately without attempting readback
    // This avoids the 2+ second stall that's killing framerate
    const initialHeightmap = this.passManager.getInitialHeightmap();
    if (initialHeightmap) {
      const size = this.simres * this.simres;
      const buffer = new Float32Array(size * 4);
      buffer.set(initialHeightmap);
      this.heightMapCpuBuffer.set(buffer);
      this.heightMapInitialized = true;
      return buffer;
    }
    
    // If no initial heightmap, return zeros (shouldn't happen)
    const size = this.simres * this.simres;
    const buffer = new Float32Array(size * 4);
    this.heightMapCpuBuffer.set(buffer);
    return buffer;
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
        const newMaterial = createTerrainProceduralMaterial({
          minHeight: minHeight,
          maxHeight: maxHeight,
          snowRange: this.controls?.SnowRange || 0.0,
          forestRange: this.controls?.ForestRange || 0.0,
          terrainPalette: this.controls?.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
        });
        
        // Check for shader compilation errors early
        const renderer = this.runtime.getRenderer();
        const gl = renderer.getContext() as WebGL2RenderingContext;
        
        // Check VTF support (query MAX_VERTEX_TEXTURE_IMAGE_UNITS)
        const maxVertexTextureUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
        console.log('[Terrain Material] VTF support check:', {
          maxVertexTextureImageUnits: maxVertexTextureUnits,
          supported: maxVertexTextureUnits > 0
        });
        
        if (maxVertexTextureUnits === 0) {
          console.warn('[Terrain Material] VTF not supported - MAX_VERTEX_TEXTURE_IMAGE_UNITS is 0');
          console.warn('[Terrain Material] Falling back to CPU-side geometry updates');
          // Fall through to use material anyway - might work on some drivers
        }
        
        // Force shader compilation by creating a test program
        const testProgram = gl.createProgram();
        const vs = gl.createShader(gl.VERTEX_SHADER);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        
        if (vs && fs) {
          const vertexSource = newMaterial.vertexShader;
          const fragmentSource = newMaterial.fragmentShader;
          
          // Log shader source info for debugging
          console.log('[Terrain Material] Compiling shaders...');
          console.log('[Terrain Material] Vertex shader length:', vertexSource.length);
          console.log('[Terrain Material] Vertex shader starts with:', vertexSource.substring(0, 20));
          console.log('[Terrain Material] Fragment shader length:', fragmentSource.length);
          console.log('[Terrain Material] Fragment shader starts with:', fragmentSource.substring(0, 20));
          
          // When manually testing shader compilation, we need to add #version 300 es
          // because Three.js hasn't added it yet (it adds it when actually using the material)
          // But we can't add it to the shader files because Three.js would then have a duplicate
          const testVertexSource = '#version 300 es\n' + vertexSource;
          const testFragmentSource = '#version 300 es\n' + fragmentSource;
          
          gl.shaderSource(vs, testVertexSource);
          gl.shaderSource(fs, testFragmentSource);
          gl.compileShader(vs);
          gl.compileShader(fs);
          
          if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(vs);
            console.error('[Terrain Material] Vertex shader compilation error:', error);
            console.error('[Terrain Material] Vertex shader source (first 200 chars):', vertexSource.substring(0, 200));
            console.error('[Terrain Material] Vertex shader source (last 200 chars):', vertexSource.substring(Math.max(0, vertexSource.length - 200)));
            throw new Error(`Vertex shader compilation failed: ${error}`);
          }
          
          if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fs);
            console.error('[Terrain Material] Fragment shader compilation error:', error);
            throw new Error(`Fragment shader compilation failed: ${error}`);
          }
          
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          gl.deleteProgram(testProgram);
          
          console.log('[Terrain Material] Shaders compiled successfully');
        }
        
        this.terrainMesh.material = newMaterial;
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
      
      // Store geometry in simulation-state for BVH raycasting
      setTerrainGeometry(this.terrainGeometry);
      
      // Build BVH for raycasting (async, non-blocking)
      this.buildBVHForRaycasting(this.terrainGeometry);
      
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
        
        // Store geometry in simulation-state for BVH raycasting
        setTerrainGeometry(this.terrainGeometry);
        
        // Build BVH for raycasting (async, non-blocking)
        this.buildBVHForRaycasting(this.terrainGeometry);
        
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
      // CRITICAL PERFORMANCE: Only compute normals if they don't exist
      // Don't recompute every frame - it's expensive (184ms per call)
      // Normals will be updated automatically by Three.js when needed
      if (!this.terrainMesh.geometry.attributes.normal) {
        // Only compute once if normals don't exist
        this.terrainMesh.geometry.computeVertexNormals();
      } else {
        // Just mark as needing update - Three.js will handle it efficiently
        this.terrainMesh.geometry.attributes.normal.needsUpdate = true;
      }
      
      // Update geometry in simulation-state (for BVH raycasting)
      setTerrainGeometry(this.terrainGeometry);
      
      // Rebuild BVH periodically (throttled to avoid performance issues)
      // Only rebuild if geometry actually changed significantly
      // This is handled by the caller (main.ts) based on geometryUpdateCounter
      
      // Update material height range if using procedural material
      if ((this.terrainMesh.material instanceof THREE.RawShaderMaterial || this.terrainMesh.material instanceof THREE.ShaderMaterial) && this.controls) {
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
          // CRITICAL PERFORMANCE: Only compute normals if they don't exist
          // Don't recompute every frame - it's expensive (184ms per call)
          if (!this.terrainMesh.geometry.attributes.normal) {
            // Only compute once if normals don't exist
            this.terrainMesh.geometry.computeVertexNormals();
          } else {
            // Just mark as needing update - Three.js will handle it efficiently
            this.terrainMesh.geometry.attributes.normal.needsUpdate = true;
          }
        }
      }
    }
  }
  
  // CPU-side terraforming methods removed - terraforming is now GPU-based
  // The rain shader (rain-frag.glsl) handles terraforming by modifying the heightmap texture
  // The vertex shader uses VTF to displace vertices from the heightmap texture
  
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
    
    if (this.terrainMesh && (this.terrainMesh.material instanceof THREE.RawShaderMaterial || this.terrainMesh.material instanceof THREE.ShaderMaterial) && this.terrainGeometry) {
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
   * Calculates brush state (mouse world position, direction, and brush UV position) from mouse coordinates
   * Similar to the WebGL tick() function's raycasting logic
   * @param mouseX - Mouse X in client coordinates
   * @param mouseY - Mouse Y in client coordinates
   * @param canvas - Canvas element for coordinate conversion
   * @returns Brush state with mouse world pos/dir and brush UV position, or null if calculation fails
   */
  public calculateBrushState(mouseX: number, mouseY: number, canvas: HTMLCanvasElement): {
    mouseWorldPos: [number, number, number, number];
    mouseWorldDir: [number, number, number];
    brushPos: [number, number];
  } | null {
    if (!this.camera) {
      return null;
    }
    
    // Ensure heightmap buffer is initialized before raycasting
    if (!this.heightMapInitialized && this.passManager) {
      const initialHeightmap = this.passManager.getInitialHeightmap();
      if (initialHeightmap) {
        const size = this.simres * this.simres;
        const buffer = new Float32Array(size * 4);
        buffer.set(initialHeightmap);
        this.heightMapCpuBuffer.set(buffer);
        this.heightMapInitialized = true;
        console.log('[Raycast] Heightmap buffer initialized, size:', size * 4);
      } else {
        console.warn('[Raycast] No initial heightmap available for raycasting');
      }
    }
    
    // Verify buffer has data (not all zeros)
    if (this.heightMapInitialized) {
      const hasData = this.heightMapCpuBuffer.some(val => val !== 0);
      if (!hasData) {
        console.warn('[Raycast] Heightmap buffer appears to be all zeros');
      }
    }
    
    // Update camera to ensure matrices are current
    if (this.controlsConfig) {
      this.camera.update(this.controlsConfig.camera);
    }
    
    // Use Three.js Raycaster for proper mouse-to-world unprojection
    const raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    
    // Convert mouse coordinates to normalized device coordinates (NDC) [-1, 1]
    const mouseNDC = new THREE.Vector2();
    mouseNDC.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((mouseY - rect.top) / rect.height) * 2 + 1; // Flip Y axis
    
    // Set raycaster to use the camera and mouse position
    const threeCamera = this.camera.threeCamera;
    raycaster.setFromCamera(mouseNDC, threeCamera);
    
    // Get ray origin and direction from raycaster
    const rayOrigin = new THREE.Vector3();
    rayOrigin.copy(raycaster.ray.origin);
    const rayDir = new THREE.Vector3();
    rayDir.copy(raycaster.ray.direction);
    
    const brushPos: [number, number] = [-10.0, -10.0]; // Invalid default
    
    // Convert to gl-matrix vec3 for raycast functions
    const rayOriginVec3 = vec3.fromValues(rayOrigin.x, rayOrigin.y, rayOrigin.z);
    const rayDirVec3 = vec3.fromValues(rayDir.x, rayDir.y, rayDir.z);
    
    // Try BVH raycast first if available and enabled, otherwise use heightmap raycast
    // Heightmap raycast is fast and works with initial terrain data
    // BVH is more accurate but expensive (39% CPU time when used every frame)
    if (this.controlsConfig?.raycast?.method === 'bvh' && terrainBVH && terrainGeometry) {
      // Use BVH raycast (expensive but accurate)
      const hit = rayCastBVH(
        rayOriginVec3,
        rayDirVec3,
        terrainBVH,
        terrainGeometry,
        brushPos
      );
      
      if (!hit) {
        // Fallback to heightmap raycast if BVH misses
        const heightmapPos: [number, number] = [-10.0, -10.0];
        rayCast(
          rayOriginVec3,
          rayDirVec3,
          this.simres,
          this.heightMapCpuBuffer,
          heightmapPos
        );
        brushPos[0] = heightmapPos[0];
        brushPos[1] = heightmapPos[1];
      }
    } else {
      // Use heightmap raycast (fast, works with initial terrain data)
      // Note: heightMapCpuBuffer contains initial terrain data (GPU readback disabled for performance)
      // For terraforming to work with raycasting, we'd need CPU-side tracking or a copy pass
      rayCast(
        rayOriginVec3,
        rayDirVec3,
        this.simres,
        this.heightMapCpuBuffer,
        brushPos
      );
    }
    
    // Return brush state
    return {
      mouseWorldPos: [rayOrigin.x, rayOrigin.y, rayOrigin.z, 1.0],
      mouseWorldDir: [rayDir.x, rayDir.y, rayDir.z],
      brushPos: brushPos
    };
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
      // Material type is correct - continue
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
      
      // Update heightmap textures for VTF displacement (GPU-based terraforming)
      if (this.passManager) {
        const terrainTexture = this.passManager.getTerrainTexture();
        const sedimentTexture = this.passManager.getSedimentTexture();
        
        // Debug: Log texture info on first render
        if (!this._textureDebugLogged) {
          console.log('[Terrain Render] Texture check:', {
            hasTerrainTexture: !!terrainTexture,
            hasSedimentTexture: !!sedimentTexture,
            terrainTextureType: terrainTexture?.type,
            terrainTextureFormat: terrainTexture?.format,
            terrainTextureWidth: terrainTexture?.image?.width,
            terrainTextureHeight: terrainTexture?.image?.height,
            hasHeightmapUniform: !!material.uniforms.u_Heightmap,
            hasSedimentUniform: !!material.uniforms.u_Sediment,
            simres: this.simres
          });
          this._textureDebugLogged = true;
        }
        
        if (terrainTexture && material.uniforms.u_Heightmap) {
          // Only update if texture changed to avoid unnecessary updates
          if (material.uniforms.u_Heightmap.value !== terrainTexture) {
            material.uniforms.u_Heightmap.value = terrainTexture;
            // Ensure texture is marked for update
            terrainTexture.needsUpdate = true;
          }
        } else if (!terrainTexture) {
          console.warn('[Terrain Render] Terrain texture not available from passManager');
        }
        
        if (sedimentTexture && material.uniforms.u_Sediment) {
          // Only update if texture changed to avoid unnecessary updates
          if (material.uniforms.u_Sediment.value !== sedimentTexture) {
            material.uniforms.u_Sediment.value = sedimentTexture;
            // Ensure texture is marked for update
            sedimentTexture.needsUpdate = true;
          }
        } else if (!sedimentTexture) {
          console.warn('[Terrain Render] Sediment texture not available from passManager');
        }
        
        if (material.uniforms.u_SimRes) {
          material.uniforms.u_SimRes.value = this.simres;
        }
        if (material.uniforms.u_TerrainSize) {
          // Calculate terrain size from controls (terrainScale * 320.0)
          const terrainScale = this.controls?.TerrainScale || 3.2;
          const terrainSize = terrainScale * 320.0;
          material.uniforms.u_TerrainSize.value = terrainSize;
        }
      }
      
      // Update brush uniforms for visualization (if they exist)
      if (this.controls) {
        if (material.uniforms.u_BrushType) {
          material.uniforms.u_BrushType.value = this.controls.brushType || 0;
        }
        if (material.uniforms.u_BrushSize) {
          material.uniforms.u_BrushSize.value = this.controls.brushSize || 0.0;
        }
        if (material.uniforms.u_BrushPos && this.controls.posTemp) {
          const brushPosX = this.controls.posTemp[0];
          const brushPosY = this.controls.posTemp[1];
          material.uniforms.u_BrushPos.value.set(brushPosX, brushPosY);
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
    
    this.renderFrameCount++;
    
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
        
        // Render scene
        renderer.render(scene, threeCamera);
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
   * Builds BVH from terrain geometry for raycasting (async, non-blocking)
   * Stores the BVH in simulation-state for brush system access
   */
  private buildBVHForRaycasting(geometry: THREE.BufferGeometry): void {
    // Don't build if already in progress
    if (terrainBVHBuildInProgress) {
      console.log('[BVH] Build already in progress, skipping');
      return;
    }
    
    if (!geometry) {
      console.warn('[BVH] No geometry provided for BVH build');
      return;
    }
    
    // Mark as in progress
    setTerrainBVHBuildInProgress(true);
    console.log('[BVH] Starting BVH build from terrain geometry');
    
    // Build BVH asynchronously to avoid blocking
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const bvhStartTime = performance.now();
          
          // Build BVH with optimized settings
          const bvh = new MeshBVH(geometry, {
            strategy: SAH, // Surface Area Heuristic for best performance
            maxDepth: 30,   // Reduced from 40 for faster builds (still very accurate)
            indirect: false  // Direct indexed geometry
          });
          
          const bvhDuration = performance.now() - bvhStartTime;
          console.log(`[BVH] BVH construction complete in ${bvhDuration.toFixed(2)}ms`);
          
          // Store in simulation-state for brush system access
          setTerrainBVH(bvh); // This will clear terrainBVHBuildInProgress flag
          console.log('[BVH] BVH stored in simulation-state for brush raycasting');
        } catch (error) {
          console.error('[BVH] Failed to build BVH:', error);
          setTerrainBVHBuildInProgress(false); // Clear flag on error
        }
      });
    });
  }

  /**
   * Rebuilds BVH when terrain geometry changes (for periodic updates during erosion)
   * Only rebuilds if geometry actually changed and BVH is not already building
   */
  public rebuildBVHIfNeeded(): void {
    if (!this.terrainGeometry) {
      return;
    }
    
    // Don't rebuild if already in progress
    if (terrainBVHBuildInProgress) {
      return;
    }
    
    // Rebuild BVH from updated geometry
    this.buildBVHForRaycasting(this.terrainGeometry);
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
