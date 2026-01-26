import { ThreeJSRuntime } from '../main';
import { SimulationPassManager } from '../simulation/SimulationPassManager';
import { SimulationParams } from '../../app/dto/SimulationParams';
import * as THREE from 'three';
import { createTerrainGeometry, updateTerrainGeometry } from '../../utils/terrain-geometry-builder';
import { createTerrainProceduralMaterial, updateTerrainProceduralMaterial } from '../materials/terrain-procedural-material';
import { createHeightmapTexture } from '../utils/terrain-heightmap-converter';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { TerrainStateHolder } from '../../app/state/TerrainStateHolder';

/**
 * Terrain synchronization service
 * Handles terrain geometry creation, BVH building, and material management.
 * All geometry/BVH state is published via TerrainStateHolder (no simulation-state).
 */
export class TerrainSync {
  private terrainMesh: THREE.Mesh | null = null;
  private terrainGeometry: THREE.BufferGeometry | null = null;
  private cpuHeightmapTexture: THREE.Texture | null = null;

  constructor(
    private runtime: ThreeJSRuntime,
    private simres: number,
    private passManager: SimulationPassManager | null,
    private controls: SimulationParams | any,
    private terrainStateHolder: TerrainStateHolder
  ) {}

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
            }
            console.warn('[Terrain Update] Using fallback simres - HeightmapSource not available');
          }
          
          // Set TerrainSize uniform
          if (newMaterial.uniforms.u_TerrainSize) {
            const terrainSize = (this.controls?.TerrainScale || 3.2) * 320.0;
            newMaterial.uniforms.u_TerrainSize.value = terrainSize;
          }
          // Set height decode scale for CPU heightmap (RAW encoding = worldHeight * simres)
          if (newMaterial.uniforms.u_HeightDecodeScale) {
            newMaterial.uniforms.u_HeightDecodeScale.value = 1.0 / this.simres;
          }
          
          // Configure and assign textures for VTF
          // Three.js will automatically handle texture binding when uniforms are set
          if (!usedCpuHeightmap && terrainTexture && newMaterial.uniforms.u_Heightmap) {
            // Configure texture properties for VTF (set once, not every frame)
            this.configureTextureForVTF(terrainTexture);
            newMaterial.uniforms.u_Heightmap.value = terrainTexture;
            // Both CPU and simulation textures use RAW encoding (worldHeight * simres)
            // Both need 1/simres to decode from RAW to world units
            if (newMaterial.uniforms.u_HeightDecodeScale) {
              newMaterial.uniforms.u_HeightDecodeScale.value = 1.0 / this.simres;
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
        
        
        // Store geometry for BVH raycasting
        if (this.terrainGeometry) {
          this.terrainStateHolder.terrainGeometry = this.terrainGeometry;
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
        
        // Store geometry for BVH raycasting
        this.terrainStateHolder.terrainGeometry = this.terrainGeometry;
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
      
      // Update geometry for BVH raycasting
      this.terrainStateHolder.terrainGeometry = geometry;

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

  /**
   * Gets the current terrain geometry for export utilities
   */
  public getTerrainGeometry(): THREE.BufferGeometry | null {
    return this.terrainGeometry;
  }

  /**
   * Gets the terrain mesh
   */
  public getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMesh;
  }

  /**
   * Gets the CPU heightmap texture
   */
  public getCpuHeightmapTexture(): THREE.Texture | null {
    return this.cpuHeightmapTexture;
  }

  /**
   * Sets the CPU heightmap texture
   */
  public setCpuHeightmapTexture(texture: THREE.Texture | null): void {
    this.cpuHeightmapTexture = texture;
  }

  /**
   * Updates the pass manager reference (called when pass manager is initialized)
   */
  public setPassManager(passManager: SimulationPassManager | null): void {
    this.passManager = passManager;
  }

  /**
   * Updates the controls reference (for material updates)
   */
  public setControls(controls: SimulationParams | any): void {
    this.controls = controls;
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
   * Builds BVH from terrain geometry for raycasting (async, non-blocking)
   * Stores the BVH in simulation-state for brush system access
   */
  private buildBVHForRaycasting(geometry: THREE.BufferGeometry): void {
    if (this.terrainStateHolder.terrainBVHBuildInProgress) {
      console.log('[BVH] Build already in progress, skipping');
      return;
    }
    
    if (!geometry) {
      console.warn('[BVH] No geometry provided for BVH build');
      return;
    }
    
    // Mark as in progress
    this.terrainStateHolder.terrainBVHBuildInProgress = true;
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
          
          // Store for brush system access (holder setter clears terrainBVHBuildInProgress)
          this.terrainStateHolder.terrainBVH = bvh;
          console.log('[BVH] BVH stored for brush raycasting');
        } catch (error) {
          console.error('[BVH] Failed to build BVH:', error);
          this.terrainStateHolder.terrainBVHBuildInProgress = false;
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
    if (this.terrainStateHolder.terrainBVHBuildInProgress) {
      return;
    }
    
    // Rebuild BVH from updated geometry
    this.buildBVHForRaycasting(this.terrainGeometry);
  }

  /**
   * Updates material uniforms with current simulation state (for real-time terraforming)
   * Called from render loop to update textures and uniforms
   */
  public updateMaterialUniforms(controls: SimulationParams | any, passManager: SimulationPassManager | null): void {
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
      const useSimHeightmap = (controls as any)?.UseSimHeightmap;
      const terrainTexture = passManager?.getTerrainTexture();
      const sedimentTexture = passManager?.getSedimentTexture();
      const targetHeightmap = useSimHeightmap ? terrainTexture : this.cpuHeightmapTexture;

      if (targetHeightmap && material.uniforms.u_Heightmap) {
        const currentTexture = material.uniforms.u_Heightmap.value as THREE.Texture;
        const currentWidth = (currentTexture as any)?.image?.width || (currentTexture as any)?.source?.data?.width || 0;
        const isDummy = currentWidth === 1;
        const referenceChanged = currentTexture !== targetHeightmap;
        if (referenceChanged || isDummy) {
          // Validate texture before binding
          if (!targetHeightmap) {
            console.error('[TerrainSync] ERROR: targetHeightmap is null when UseSimHeightmap is', useSimHeightmap);
            return;
          }
          
          // Configure texture for VTF
          this.configureTextureForVTF(targetHeightmap);
          material.uniforms.u_Heightmap.value = targetHeightmap;
          targetHeightmap.needsUpdate = true;
          material.needsUpdate = true;
          
          // Log texture switch for debugging
          const texAny = targetHeightmap as any;
          console.log('[TerrainSync] Texture switched:', {
            useSimHeightmap,
            textureType: targetHeightmap.type,
            textureFormat: targetHeightmap.format,
            width: texAny?.image?.width || texAny?.source?.data?.width || 'N/A',
            height: texAny?.image?.height || texAny?.source?.data?.height || 'N/A',
            decodeScale: material.uniforms.u_HeightDecodeScale?.value || 'N/A'
          });
        }
      } else if (useSimHeightmap && !terrainTexture) {
        console.warn('[TerrainSync] WARNING: UseSimHeightmap is true but terrainTexture is null');
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
        const terrainScale = controls?.TerrainScale || 3.2;
        material.uniforms.u_TerrainSize.value = terrainScale * 320.0;
      }
      if (material.uniforms.u_DebugScale && material.uniforms.u_MaxHeight && material.uniforms.u_MinHeight) {
        const dbgScale = (material.uniforms.u_MaxHeight.value || 0) - (material.uniforms.u_MinHeight.value || 0);
        material.uniforms.u_DebugScale.value = Math.max(dbgScale, 1.0);
      }
      // Height decode scale: Both CPU and simulation textures use RAW encoding (worldHeight * simres)
      // Both need 1/simres to decode from RAW to world units
      if (material.uniforms.u_HeightDecodeScale) {
        material.uniforms.u_HeightDecodeScale.value = 1.0 / this.simres;
      }
      // Allow live debug mode override from controls.DebugMode (optional)
      if (controls && typeof (controls as any).DebugMode === 'number' && material.uniforms.u_DebugMode) {
        material.uniforms.u_DebugMode.value = (controls as any).DebugMode;
      }
      
      // Update brush uniforms for visualization and terraforming
      if (controls) {
        const brushPressed = controls.brushPressed || 0;
        const brushType = controls.brushType || 0;
        const brushOperation = controls.brushOperation || 0;
        
        if (material.uniforms.u_BrushType) {
          material.uniforms.u_BrushType.value = brushType;
        }
        if (material.uniforms.u_BrushSize) {
          material.uniforms.u_BrushSize.value = controls.brushSize || 0.0;
        }
        if (material.uniforms.u_BrushPos && controls.posTemp) {
          material.uniforms.u_BrushPos.value.set(
            controls.posTemp[0],
            controls.posTemp[1]
          );
        }
        if (material.uniforms.u_BrushPressed) {
          material.uniforms.u_BrushPressed.value = brushPressed;
        }
        if (material.uniforms.u_BrushOperation) {
          material.uniforms.u_BrushOperation.value = brushOperation;
        }
        
        // Debug logging for terraforming state (throttled)
        if (brushPressed && (this as any).terraformDebugCounter === undefined) {
          (this as any).terraformDebugCounter = 0;
        }
        if ((this as any).terraformDebugCounter !== undefined) {
          (this as any).terraformDebugCounter++;
          if ((this as any).terraformDebugCounter % 60 === 0 && brushPressed) {
            console.log('[TerrainSync] Terraforming active:', {
              brushType,
              brushOperation,
              brushPressed,
              brushSize: controls.brushSize || 0,
              brushStrength: controls.brushStrenth || 0,
              useSimHeightmap,
              textureBound: !!targetHeightmap
            });
          }
          if (!brushPressed && (this as any).terraformDebugCounter > 0) {
            (this as any).terraformDebugCounter = 0;
          }
        }
      }
    }
  }

  /**
   * Updates material parameters from controls
   * Can be called with controls parameter or use stored this.controls
   */
  public updateMaterialFromControls(controls?: SimulationParams | any): void {
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
   * Disposes of terrain resources
   */
  public dispose(): void {
    if (this.terrainMesh) {
      if (this.terrainMesh.geometry) {
        this.terrainMesh.geometry.dispose();
      }
      if (this.terrainMesh.material instanceof THREE.Material) {
        this.terrainMesh.material.dispose();
      }
    }
    this.terrainMesh = null;
    this.terrainGeometry = null;
    this.cpuHeightmapTexture = null;
  }
}
