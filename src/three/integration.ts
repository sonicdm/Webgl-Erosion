/**
 * Integration layer between Three.js runtime and existing WebGL pipeline.
 * This allows switching between runtimes and sharing state.
 */

import { ThreeJSRuntime } from './main';
import { SimulationPassManager } from './simulation/SimulationPassManager';
import { readCombinedHeight } from './utils/combined-height-readback';
import * as THREE from 'three';
import { vec2, vec3 } from 'gl-matrix';
import Camera from '../Camera';
import { ControlsConfig } from '../controls-config';
import { CameraService } from './camera/CameraService';
import { createTerrainGeometry, updateTerrainGeometry } from '../utils/terrain-geometry-builder';
import { createTerrainProceduralMaterial, updateTerrainProceduralMaterial } from './materials/terrain-procedural-material';
import { getWaterSourceCount, waterSources as waterSourcesList, MAX_WATER_SOURCES } from '../utils/water-sources';
import { getLavaSourceCount, lavaSources as lavaSourcesList, MAX_LAVA_SOURCES } from '../utils/lava-sources';
import { SimulationParams, createSimulationParams } from '../app/dto/SimulationParams';
import { BrushInput } from '../app/dto/BrushInput';
import { createHeightmapTexture } from './utils/terrain-heightmap-converter';
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
  private cpuHeightmapTexture: THREE.Texture | null = null; // stored CPU DataTexture
  private renderDebugCounter = 0;
  private heightMapInitialized: boolean = false;
  private controls: any = null; // Store controls for material updates
  private cameraService: CameraService; // Camera service for camera management
  private controlsConfig: ControlsConfig | null = null; // Camera configuration (stored for reference)
  // terraformingActive flag removed - terraforming is now GPU-based (rain shader)

  constructor(canvas: HTMLCanvasElement, glContext: WebGL2RenderingContext, simres: number) {
    this.runtime = new ThreeJSRuntime(canvas, glContext);
    this.simres = simres;
    this.heightMapCpuBuffer = new Float32Array(simres * simres * 4);
    this.cameraService = new CameraService(this.runtime);
  }
  
  /**
   * Sets the camera configuration (called from main.ts after controlsConfig is loaded)
   */
  public setControlsConfig(controlsConfig: ControlsConfig, brushUsesLeftClick: boolean): void {
    this.controlsConfig = controlsConfig;
    this.cameraService.setControlsConfig(controlsConfig, brushUsesLeftClick);
  }
  
  /**
   * Gets the Three.js camera for rendering (from Camera wrapper)
   */
  public getThreeJSCamera(): THREE.Camera {
    return this.cameraService.getThreeJSCamera();
  }
  
  /**
   * Gets the custom Camera instance (for event handlers)
   */
  public getCamera(): Camera | null {
    return this.cameraService.getCamera();
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
   * @param controls - Simulation controls/parameters (can be SimulationParams or legacy controls object)
   * @param timer - Time value for shaders (optional, defaults to 0)
   * @param brushState - Brush state (mouse world pos/dir, brush pos) (optional)
   */
  public executeSimulationStep(
    controls: SimulationParams | any,
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
    
    // Convert controls to SimulationParams if needed (backward compatibility)
    const simParams: SimulationParams = controls.simres !== undefined 
      ? controls as SimulationParams 
      : createSimulationParams(controls, this.simres);
    
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
    
    // If THREE.Terrain mesh is available, use it (even if fallback mesh exists)
    if (terrainMesh) {
      // Check if we need to set up the mesh (first time or if it changed)
      const needsSetup = !this.terrainMesh || this.terrainMesh !== terrainMesh;
      
      // Remove fallback mesh if it exists (created before THREE.Terrain was ready)
      if (this.terrainMesh && this.terrainMesh !== terrainMesh) {
        console.log('[Terrain Update] Removing fallback mesh, replacing with THREE.Terrain mesh');
        const scene = this.runtime.getScene();
        scene.remove(this.terrainMesh);
        if (this.terrainMesh.geometry) {
          this.terrainMesh.geometry.dispose();
        }
        if (this.terrainMesh.material instanceof THREE.Material) {
          this.terrainMesh.material.dispose();
        }
      }
      
      if (needsSetup) {
        console.log('[Terrain Update] Using THREE.Terrain generated mesh for rendering');
        this.terrainMesh = terrainMesh;
        this.terrainGeometry = terrainMesh.geometry;
      }
      
      // Only set up the flat plane geometry and material if we just assigned the mesh
      // (to avoid redoing this work every frame)
      if (needsSetup) {
        // CRITICAL: For VTF-based procedural material, we need a FLAT plane geometry
        // The vertex shader will read from heightmap texture and displace vertices
        // THREE.Terrain mesh has heights already baked in, so we need to replace the geometry
        // with a flat plane that matches the terrain size
        if (!this.controls) {
          console.error('[Terrain Update] ERROR: this.controls is null! Cannot create terrain geometry.');
          return;
        }
        const terrainScale = this.controls.TerrainScale || 3.2;
        const terrainSize = terrainScale * 320.0;
        const segments = this.simres - 1; // Creates exactly simres x simres vertices
      
        console.log('[Terrain Update] Creating flat plane geometry:', {
          terrainScale,
          terrainSize,
          segments,
          simres: this.simres,
          expectedVertices: (segments + 1) * (segments + 1)
        });
        
        // Calculate height range from original geometry BEFORE replacing it
        if (!this.terrainMesh || !this.terrainMesh.geometry) {
          console.error('[Terrain Update] ERROR: terrainMesh or geometry is null!');
          return;
        }
        const originalPositions = this.terrainMesh.geometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < originalPositions.length; i += 3) { // y is at index 1 (after rotation)
          const y = originalPositions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }
        
        // Create flat plane geometry (Y = 0 for all vertices)
        // Vertex shader will displace based on heightmap texture
        const flatGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        flatGeometry.rotateX(-Math.PI / 2); // Rotate to XZ plane (Y up)
        
        // Flatten all Y positions to 0 (vertex shader will displace from texture)
        const flatPositions = flatGeometry.attributes.position.array as Float32Array;
        for (let i = 1; i < flatPositions.length; i += 3) {
          flatPositions[i] = 0.0; // Set Y to 0
        }
        flatGeometry.attributes.position.needsUpdate = true;
        
        
        flatGeometry.computeVertexNormals();
        flatGeometry.computeBoundingBox();
        
        // Replace geometry with flat plane for VTF displacement
        const oldGeometry = this.terrainMesh.geometry;
        this.terrainMesh.geometry = flatGeometry;
        oldGeometry.dispose(); // Dispose old geometry
        
        console.log('[Terrain Update] Replaced THREE.Terrain geometry with flat plane for VTF displacement');
        console.log('[Terrain Update] Height range from original geometry:', { minHeight, maxHeight });
        
        // Replace material with procedural terrain material
        const oldMaterial = this.terrainMesh.material;
        
        try {
          // Get textures from simulation pass manager
          const terrainTexture = this.passManager?.getTerrainTexture();
          const sedimentTexture = this.passManager?.getSedimentTexture();
          
          // Create procedural terrain material with VTF support
          const newMaterial = createTerrainProceduralMaterial({
            minHeight: minHeight || 0.0,
            maxHeight: maxHeight || 240.0,
            snowRange: this.controls?.SnowRange || 0.0,
            forestRange: this.controls?.ForestRange || 0.0,
            terrainPalette: this.controls?.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
            // Debug defaults: show UVs (2) to verify VTF and geometry mapping quickly
            debugMode: 2,
            debugScale: Math.max((maxHeight || 240.0) - (minHeight || 0.0), 1.0),
          });
          
          // Set uniforms from HeightmapSource uniformBlock
          const heightmapSource = this.passManager?.getHeightmapSource();
          const simres = this.simres;
          let usedCpuHeightmap = false;
          
          if (heightmapSource) {
            const uniformBlock = heightmapSource.getUniformBlock();
            // One-time detailed log about CPU heightmap
            console.log('[Terrain Update] CPU Heightmap info:', {
              simres: this.simres,
              minHeight: heightmapSource.minHeight,
              maxHeight: heightmapSource.maxHeight,
              storedMin: uniformBlock.u_StoredHeightMin.value,
              storedMax: uniformBlock.u_StoredHeightMax.value,
              width: heightmapSource.width,
              height: heightmapSource.height,
              cpuTextureBytes: heightmapSource.textureData.byteLength
            });
            
            // Apply uniform block to material (only u_SimRes needed for raw contract)
            if (newMaterial.uniforms.u_SimRes) {
              newMaterial.uniforms.u_SimRes.value = uniformBlock.u_SimRes.value;
              // needsUpdate is not a property of IUniform; no need to set it
            }

            // Bind a CPU-built DataTexture for the heightmap to guarantee VTF has data on first render
            if (newMaterial.uniforms.u_Heightmap) {
              const cpuTexture = createHeightmapTexture(
                heightmapSource.textureData,
                heightmapSource.width,
                heightmapSource.height
              );
              cpuTexture.needsUpdate = true;
              this.configureTextureForVTF(cpuTexture);
              newMaterial.uniforms.u_Heightmap.value = cpuTexture;
              this.cpuHeightmapTexture = cpuTexture;
              usedCpuHeightmap = true;

              console.log('[Terrain Update] Bound CPU heightmap texture for initial render:', {
                width: heightmapSource.width,
                height: heightmapSource.height,
                type: cpuTexture.type,
                format: cpuTexture.format
              });
            }
          } else {
            // Fallback: use simres from runtime
            if (newMaterial.uniforms.u_SimRes) {
              newMaterial.uniforms.u_SimRes.value = simres;
              // needsUpdate is not a property of IUniform; no need to set it
            }
            console.warn('[Terrain Update] Using fallback simres - HeightmapSource not available');
          }
          
          // Set TerrainSize uniform
          if (newMaterial.uniforms.u_TerrainSize) {
            const terrainSize = (this.controls?.TerrainScale || 3.2) * 320.0;
            newMaterial.uniforms.u_TerrainSize.value = terrainSize;
            // needsUpdate is not a property of IUniform; no need to set it
          }
          // Set height decode scale for CPU heightmap (RAW encoding = worldHeight * simres)
          if (newMaterial.uniforms.u_HeightDecodeScale) {
            newMaterial.uniforms.u_HeightDecodeScale.value = 1.0 / this.simres;
            // needsUpdate is not a property of IUniform; no need to set it
          }
          
          // Configure and assign textures for VTF
          // Three.js will automatically handle texture binding when uniforms are set
          if (!usedCpuHeightmap && terrainTexture && newMaterial.uniforms.u_Heightmap) {
            // Configure texture properties for VTF (set once, not every frame)
            this.configureTextureForVTF(terrainTexture);
            newMaterial.uniforms.u_Heightmap.value = terrainTexture;
            // Simulation textures store world units directly -> decode scale = 1
            if (newMaterial.uniforms.u_HeightDecodeScale) {
              newMaterial.uniforms.u_HeightDecodeScale.value = 1.0;
              // needsUpdate is not a property of IUniform; no need to set it
            }
            
            // Debug: Log texture info
            const texAny = terrainTexture as any;
            console.log('[Terrain Update] Heightmap texture assigned:', {
              hasTexture: !!terrainTexture,
              textureType: terrainTexture.type,
              textureFormat: terrainTexture.format,
              textureWidth: texAny?.image?.width || texAny?.source?.data?.width || 'N/A',
              textureHeight: texAny?.image?.height || texAny?.source?.data?.height || 'N/A',
              isRenderTarget: !!texAny.isRenderTargetTexture
            });
          }
          
          if (sedimentTexture && newMaterial.uniforms.u_Sediment) {
            this.configureTextureForVTF(sedimentTexture);
            newMaterial.uniforms.u_Sediment.value = sedimentTexture;
          }
          
          // Verify VTF support
          const renderer = this.runtime.getRenderer();
          const gl = renderer.getContext() as WebGL2RenderingContext;
          const maxVertexTextureUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
          if (maxVertexTextureUnits === 0) {
            console.error('[Terrain Material] VTF not supported - MAX_VERTEX_TEXTURE_IMAGE_UNITS is 0');
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
        if (!this.terrainMesh) {
          console.error('[Terrain Update] ERROR: terrainMesh is null after setup!');
          return;
        }
        const scene = this.runtime.getScene();
        scene.add(this.terrainMesh);
        
        
        // Store geometry in simulation-state for BVH raycasting
        if (this.terrainGeometry) {
          setTerrainGeometry(this.terrainGeometry);
          
          // Build BVH for raycasting (async, non-blocking)
          this.buildBVHForRaycasting(this.terrainGeometry);
        }
        
        console.log('[Terrain Update] THREE.Terrain mesh added to scene');
        console.log('[Terrain Update] Mesh details:', {
          visible: this.terrainMesh.visible,
          position: this.terrainMesh.position,
          scale: this.terrainMesh.scale,
          rotation: this.terrainMesh.rotation,
          geometryVertices: this.terrainMesh.geometry.attributes.position.count
        });
      } // End of if (needsSetup)
      return;
    } // End of if (terrainMesh)
    
    // Fallback: Create geometry from heightmap if THREE.Terrain mesh not available
    if (!this.terrainMesh && !this.terrainGeometry) {
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
          material: Array.isArray(this.terrainMesh.material) 
            ? this.terrainMesh.material.map(m => m.type).join(', ')
            : this.terrainMesh.material.type,
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
    const mesh = this.terrainMesh;
    const geometry = this.terrainGeometry;
    if (mesh && geometry) {
      // Update existing geometry from height data
      updateTerrainGeometry(geometry, this.simres, heightData, 1.0);
      mesh.geometry.attributes.position.needsUpdate = true;
      // CRITICAL PERFORMANCE: Only compute normals if they don't exist
      // Don't recompute every frame - it's expensive (184ms per call)
      // Normals will be updated automatically by Three.js when needed
      if (!mesh.geometry.attributes.normal) {
        // Only compute once if normals don't exist
        mesh.geometry.computeVertexNormals();
      } else {
        // Just mark as needing update - Three.js will handle it efficiently
        mesh.geometry.attributes.normal.needsUpdate = true;
      }
      
      // Update geometry in simulation-state (for BVH raycasting)
      setTerrainGeometry(geometry);
      
      // Rebuild BVH periodically (throttled to avoid performance issues)
      // Only rebuild if geometry actually changed significantly
      // This is handled by the caller (main.ts) based on geometryUpdateCounter
      
      // Update material height range if using procedural material
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if ((material instanceof THREE.RawShaderMaterial || material instanceof THREE.ShaderMaterial) && this.controls) {
        const positions = geometry.attributes.position.array as Float32Array;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
          const y = positions[i];
          if (y < minHeight) minHeight = y;
          if (y > maxHeight) maxHeight = y;
        }
        
        updateTerrainProceduralMaterial(material, {
          minHeight: minHeight,
          maxHeight: maxHeight,
          snowRange: this.controls.SnowRange || 0.0,
          forestRange: this.controls.ForestRange || 0.0,
          terrainPalette: this.controls.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
          debugScale: Math.max(maxHeight - minHeight, 1.0),
          debugMode: (this.controls as any).DebugMode ?? 0,
          // Decode scale stays 1/simres for CPU heightmap; render() will override when using sim heightmap
        });
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
        debugScale: Math.max(maxHeight - minHeight, 1.0),
        debugMode: (controlsToUse as any).DebugMode ?? 0,
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
    if (!this.cameraService.getCamera()) {
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
      this.cameraService.update(this.controlsConfig.camera);
    }
    
    // Use Three.js Raycaster for proper mouse-to-world unprojection
    const raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    
    // Convert mouse coordinates to normalized device coordinates (NDC) [-1, 1]
    const mouseNDC = new THREE.Vector2();
    mouseNDC.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((mouseY - rect.top) / rect.height) * 2 + 1; // Flip Y axis
    
    // Set raycaster to use the camera and mouse position
    const threeCamera = this.cameraService.getThreeJSCamera();
    raycaster.setFromCamera(mouseNDC, threeCamera);
    
    // Get ray origin and direction from raycaster
    const rayOrigin = new THREE.Vector3();
    rayOrigin.copy(raycaster.ray.origin);
    const rayDir = new THREE.Vector3();
    rayDir.copy(raycaster.ray.direction);
    
    // Convert to gl-matrix vec2 for raycast output
    const brushPos = vec2.fromValues(-10.0, -10.0); // Invalid default
    
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
        const heightmapPos = vec2.fromValues(-10.0, -10.0);
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
    
    // Return brush state (convert vec2 back to tuple)
    return {
      mouseWorldPos: [rayOrigin.x, rayOrigin.y, rayOrigin.z, 1.0],
      mouseWorldDir: [rayDir.x, rayDir.y, rayDir.z],
      brushPos: [brushPos[0], brushPos[1]] as [number, number]
    };
  }

  /**
   * Configures a texture for Vertex Texture Fetch (VTF) usage
   * Sets properties once - these should not be changed every frame
   */
  private configureTextureForVTF(texture: THREE.Texture): void {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    
    // CRITICAL: Ensure texture type and format are explicitly set for FloatType
    // This prevents Three.js from normalizing the texture when binding for VTF
    texture.type = THREE.FloatType;
    texture.format = THREE.RGBAFormat;
    texture.needsUpdate = true;
    
    // CRITICAL: Force Three.js internal state to recognize FloatType
    // This ensures the texture is bound with RGBA32F internal format, not normalized
    const renderer = this.runtime.getRenderer();
    const properties = (renderer as any).properties;
    if (properties) {
      const textureProperties = properties.get(texture);
      if (textureProperties) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        // Ensure internal format is RGBA32F (not normalized)
        (textureProperties as any).__webglTextureType = gl.FLOAT;
        (textureProperties as any).__webglTextureFormat = gl.RGBA;
        (textureProperties as any).__webglTextureInternalFormat = gl.RGBA32F || 0x8814;
      }
    }
  }

  /**
   * Renders the scene
   */
  public render(): void {
    const renderer = this.runtime.getRenderer();
    const scene = this.runtime.getScene();
    const camera = this.runtime.getCamera();
    
    if (!this.terrainMesh) {
      return;
    }
    
    // Update material uniforms with current simulation state (for real-time terraforming)
    if (this.terrainMesh.material instanceof THREE.RawShaderMaterial || 
        this.terrainMesh.material instanceof THREE.ShaderMaterial) {
      const material = this.terrainMesh.material;
      
      if (!material.uniforms) {
        return;
      }
      
      // Update textures from simulation or CPU heightmap (for real-time terraforming)
      const useSimHeightmap = (this.controls as any)?.UseSimHeightmap;
      const terrainTexture = this.passManager?.getTerrainTexture();
      const sedimentTexture = this.passManager?.getSedimentTexture();
      const targetHeightmap = useSimHeightmap ? terrainTexture : this.cpuHeightmapTexture;

      if (targetHeightmap && material.uniforms.u_Heightmap) {
        const currentTexture = material.uniforms.u_Heightmap.value as THREE.Texture;
        const currentWidth = (currentTexture as any)?.image?.width || (currentTexture as any)?.source?.data?.width || 0;
        const isDummy = currentWidth === 1;
        const referenceChanged = currentTexture !== targetHeightmap;
        if (referenceChanged || isDummy) {
          this.configureTextureForVTF(targetHeightmap);
          material.uniforms.u_Heightmap.value = targetHeightmap;
          targetHeightmap.needsUpdate = true;
          material.needsUpdate = true;

          if (this.renderDebugCounter % 120 === 0) {
            console.log('[Render] Heightmap switch:', {
              useSimHeightmap,
              targetWidth: (targetHeightmap as any)?.image?.width || (targetHeightmap as any)?.source?.data?.width || 'N/A',
              targetHeight: (targetHeightmap as any)?.image?.height || (targetHeightmap as any)?.source?.data?.height || 'N/A',
              decodeScale: material.uniforms.u_HeightDecodeScale?.value
            });
          }
        }
      }

      if (sedimentTexture && material.uniforms.u_Sediment) {
        const currentSed = material.uniforms.u_Sediment.value as THREE.Texture;
        if (currentSed !== sedimentTexture) {
          this.configureTextureForVTF(sedimentTexture);
          material.uniforms.u_Sediment.value = sedimentTexture;
          sedimentTexture.needsUpdate = true;
        }
      }

      // Update simulation parameters
      if (material.uniforms.u_SimRes) {
        material.uniforms.u_SimRes.value = this.simres;
      }
      if (material.uniforms.u_TerrainSize) {
        const terrainScale = this.controls?.TerrainScale || 3.2;
        material.uniforms.u_TerrainSize.value = terrainScale * 320.0;
      }
      if (material.uniforms.u_DebugScale && material.uniforms.u_MaxHeight && material.uniforms.u_MinHeight) {
        const dbgScale = (material.uniforms.u_MaxHeight.value || 0) - (material.uniforms.u_MinHeight.value || 0);
        material.uniforms.u_DebugScale.value = Math.max(dbgScale, 1.0);
      }
      // Height decode scale: CPU heightmap is RAW (worldHeight * simres), sim heightmap is world units
      if (material.uniforms.u_HeightDecodeScale) {
        material.uniforms.u_HeightDecodeScale.value = useSimHeightmap ? 1.0 : 1.0 / this.simres;
      }
      // Allow live debug mode override from controls.DebugMode (optional)
      if (this.controls && typeof (this.controls as any).DebugMode === 'number' && material.uniforms.u_DebugMode) {
        material.uniforms.u_DebugMode.value = (this.controls as any).DebugMode;
      }
      
      // Update brush uniforms for visualization
      if (this.controls) {
        if (material.uniforms.u_BrushType) {
          material.uniforms.u_BrushType.value = this.controls.brushType || 0;
        }
        if (material.uniforms.u_BrushSize) {
          material.uniforms.u_BrushSize.value = this.controls.brushSize || 0.0;
        }
        if (material.uniforms.u_BrushPos && this.controls.posTemp) {
          material.uniforms.u_BrushPos.value.set(
            this.controls.posTemp[0],
            this.controls.posTemp[1]
          );
        }
      }

      // Throttled debug log for live sim heightmap path
      this.renderDebugCounter++;
      if (this.renderDebugCounter % 240 === 0 && (this.controls as any)?.UseSimHeightmap) {
        const hm = material.uniforms.u_Heightmap?.value as THREE.Texture;
        console.log('[Render] Live sim heightmap stats:', {
          frame: this.renderDebugCounter,
          hmWidth: (hm as any)?.image?.width || (hm as any)?.source?.data?.width || 'N/A',
          hmHeight: (hm as any)?.image?.height || (hm as any)?.source?.data?.height || 'N/A',
          decodeScale: material.uniforms.u_HeightDecodeScale?.value,
          simres: this.simres
        });
      }
    }
    
    // Reset render state (GPGPU passes may have modified viewport/render target)
    renderer.setRenderTarget(null);
    renderer.state.reset();
    const rendererSize = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, rendererSize.x, rendererSize.y);
    
    // Clear and render
    renderer.setClearColor(0x87CEEB, 1.0);
    renderer.clear(true, true, true);
    
    try {
      // Update camera (handles OrbitControls + WASD movement)
      const cameraInstance = this.cameraService.getCamera();
      if (cameraInstance && this.controlsConfig) {
        const threeCamera = this.cameraService.getThreeJSCamera();
        const aspect = rendererSize.x / rendererSize.y;
        if (threeCamera instanceof THREE.PerspectiveCamera && threeCamera.aspect !== aspect) {
          threeCamera.aspect = aspect;
          threeCamera.updateProjectionMatrix();
        }
        this.cameraService.update(this.controlsConfig.camera);
        renderer.render(scene, threeCamera);
      } else {
        renderer.render(scene, camera);
      }
    } catch (error) {
      console.error('Error during render:', error);
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
   * Gets the pass manager for debugging (e.g., checking render targets)
   */
  public getPassManager(): SimulationPassManager | null {
    return this.passManager;
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
    // Camera service will be disposed with the service
    if (this.passManager) {
      this.passManager.dispose();
    }
    this.runtime.dispose();
    this.terrainMesh?.geometry.dispose();
    (this.terrainMesh?.material as THREE.Material)?.dispose();
  }
}
