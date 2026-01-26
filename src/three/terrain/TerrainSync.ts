import { ThreeJSRuntime } from '../main';
import { SimulationPassManager } from '../simulation/SimulationPassManager';
import { SimulationParams } from '../../app/dto/SimulationParams';
import * as THREE from 'three';
import { createTerrainGeometry, updateTerrainGeometry } from '../../utils/terrain-geometry-builder';
import { createTerrainProceduralMaterial, updateTerrainProceduralMaterial } from '../materials/terrain-procedural-material';
import { createHeightmapTexture } from '../utils/terrain-heightmap-converter';
import { buildHeightmapUniforms } from '../utils/HeightmapUniforms';
import { assertRawHeightmap } from '../utils/HeightmapContract';
import { configureTextureForVTF } from '../utils/textureFormatVTF';
import { assertNonZeroDisplacement } from '../utils/assertNonZeroDisplacement';
import type { HeightmapSource } from '../utils/HeightmapSource';
import type { TerrainRenderMode } from '../utils/TerrainRenderMode';
import type { HeightmapFreshness } from '../utils/HeightmapFreshness';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { TerrainStateHolder } from '../../app/state/TerrainStateHolder';

const _terrainLog = (...a: unknown[]) => { 
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
  console.log(...a); 
};
const _terrainWarn = (...a: unknown[]) => { 
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
  console.warn(...a); 
};

/**
 * Terrain synchronization service
 * Handles terrain geometry creation, BVH building, and material management.
 * All geometry/BVH state is published via TerrainStateHolder (no simulation-state).
 */
export class TerrainSync {
  private terrainMesh: THREE.Mesh | null = null;
  private terrainGeometry: THREE.BufferGeometry | null = null;
  private cpuHeightmapTexture: THREE.Texture | null = null;
  private heightmapSource: HeightmapSource | null = null;
  private terrainRenderMode: TerrainRenderMode = 'gpu_vtf';
  private heightmapFreshness: HeightmapFreshness | null = null;

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
        _terrainLog('[Terrain Update] Removing fallback mesh, replacing with THREE.Terrain mesh');
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
        _terrainLog('[Terrain Update] Using THREE.Terrain generated mesh for rendering');
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
      
        _terrainLog('[Terrain Update] Creating flat plane geometry:', {
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
        
        _terrainLog('[Terrain Update] Replaced THREE.Terrain geometry with flat plane for VTF displacement');
        _terrainLog('[Terrain Update] Height range from original geometry:', { minHeight, maxHeight });
        
        // Replace material with procedural terrain material
        const oldMaterial = this.terrainMesh.material;
        // Mode separation (H): gpu_vtf requires HeightmapSource; refuse VTF when missing
        if (this.terrainRenderMode === 'gpu_vtf' && !this.heightmapSource) {
          _terrainWarn('[Terrain Update] gpu_vtf mode but HeightmapSource not available; using CPU-style fallback material');
          this.terrainMesh.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            wireframe: false,
            side: THREE.DoubleSide,
            flatShading: false
          });
          if (oldMaterial instanceof THREE.Material) oldMaterial.dispose();
          const scene = this.runtime.getScene();
          scene.add(this.terrainMesh);
          if (this.terrainGeometry) {
            this.terrainStateHolder.terrainGeometry = this.terrainGeometry;
            this.buildBVHForRaycasting(this.terrainGeometry);
          }
          _terrainLog('[Terrain Update] THREE.Terrain mesh added to scene (CPU fallback)');
          _terrainLog('[Terrain Update] Mesh details:', {
            visible: this.terrainMesh.visible,
            position: this.terrainMesh.position,
            scale: this.terrainMesh.scale,
            rotation: this.terrainMesh.rotation,
            geometryVertices: this.terrainMesh.geometry.attributes.position.count
          });
          return;
        }
        
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
          
          // Set uniforms from HeightmapSource via HeightmapUniforms (H7: single source of truth)
          const heightmapSource = this.heightmapSource;
          const simres = this.simres;
          const terrainSize = (this.controls?.TerrainScale || 3.2) * 320.0;
          let usedCpuHeightmap = false;
          
          if (heightmapSource) {
            const block = buildHeightmapUniforms(heightmapSource, { terrainSize });
            _terrainLog('[Terrain Update] CPU Heightmap info:', {
              simres: heightmapSource.simres,
              minHeight: heightmapSource.minHeight,
              maxHeight: heightmapSource.maxHeight,
              storedMin: block.u_StoredHeightMin.value,
              storedMax: block.u_StoredHeightMax.value,
              width: heightmapSource.width,
              height: heightmapSource.height,
              cpuTextureBytes: heightmapSource.textureData.byteLength
            });
            
            if (newMaterial.uniforms.u_SimRes) newMaterial.uniforms.u_SimRes.value = block.u_SimRes.value;
            if (newMaterial.uniforms.u_HeightDecodeScale) newMaterial.uniforms.u_HeightDecodeScale.value = block.u_HeightDecodeScale.value;
            if (block.u_TerrainSize && newMaterial.uniforms.u_TerrainSize) newMaterial.uniforms.u_TerrainSize.value = block.u_TerrainSize.value;

            // Bind a CPU-built DataTexture for the heightmap to guarantee VTF has data on first render
            if (newMaterial.uniforms.u_Heightmap) {
              const cpuTexture = createHeightmapTexture(
                heightmapSource.textureData,
                heightmapSource.width,
                heightmapSource.height
              );
              cpuTexture.needsUpdate = true;
              this._configureAndAssertVTF(cpuTexture);
              newMaterial.uniforms.u_Heightmap.value = cpuTexture;
              this.cpuHeightmapTexture = cpuTexture;
              usedCpuHeightmap = true;
              this.heightmapFreshness?.recordUpload();

              _terrainLog('[Terrain Update] Bound CPU heightmap texture for initial render:', {
                width: heightmapSource.width,
                height: heightmapSource.height,
                type: cpuTexture.type,
                format: cpuTexture.format
              });
            }
          } else {
            if (newMaterial.uniforms.u_SimRes) newMaterial.uniforms.u_SimRes.value = simres;
            if (newMaterial.uniforms.u_TerrainSize) newMaterial.uniforms.u_TerrainSize.value = terrainSize;
            _terrainWarn('[Terrain Update] Using fallback simres - HeightmapSource not available');
          }
          
          // Configure and assign textures for VTF
          if (!usedCpuHeightmap && terrainTexture && newMaterial.uniforms.u_Heightmap) {
            this._configureAndAssertVTF(terrainTexture);
            newMaterial.uniforms.u_Heightmap.value = terrainTexture;
            this.heightmapFreshness?.recordUpload();
            if (newMaterial.uniforms.u_HeightDecodeScale) {
              newMaterial.uniforms.u_HeightDecodeScale.value = heightmapSource
                ? 1.0 / heightmapSource.simres
                : 1.0 / simres;
            }
            
            // Debug: Log texture info
            const texAny = terrainTexture as any;
            _terrainLog('[Terrain Update] Heightmap texture assigned:', {
              hasTexture: !!terrainTexture,
              textureType: terrainTexture.type,
              textureFormat: terrainTexture.format,
              textureWidth: texAny?.image?.width || texAny?.source?.data?.width || 'N/A',
              textureHeight: texAny?.image?.height || texAny?.source?.data?.height || 'N/A',
              isRenderTarget: !!texAny.isRenderTargetTexture
            });
          }
          
          if (sedimentTexture && newMaterial.uniforms.u_Sediment) {
            this._configureAndAssertVTF(sedimentTexture);
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
          _terrainLog('[Terrain Update] Material replaced with procedural terrain material');
          try {
            const cam = this.runtime.getCamera();
            if (cam) assertNonZeroDisplacement(this.runtime.getRenderer(), cam, this.terrainMesh);
          } catch (_) { /* dev-only, non-fatal */ }
        } catch (error) {
          _terrainWarn('[Terrain Update] Failed to create procedural material, using fallback:', error);
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

        _terrainLog('[Terrain Update] THREE.Terrain mesh added to scene');
        _terrainLog('[Terrain Update] Mesh details:', {
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
      _terrainLog('[Terrain Update] THREE.Terrain mesh not available, creating geometry from heightmap');
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
        
        // Create terrain material with biome-based texturing
        // Use MeshStandardMaterial for Phase 1 (normal/roughness maps deferred to Phase 2)
        let material: THREE.Material;
        try {
          // Try procedural material first (uses VTF textures)
          material = createTerrainProceduralMaterial({
            minHeight: minHeight,
            maxHeight: maxHeight,
            snowRange: this.controls?.SnowRange || 0.0,
            forestRange: this.controls?.ForestRange || 0.0,
            terrainPalette: this.controls?.TerrainPlatte !== undefined ? this.controls.TerrainPlatte : 1,
          });
          _terrainLog('[Terrain Update] Material created with procedural terrain material');
        } catch (error) {
          _terrainWarn('[Terrain Update] Failed to create procedural material, using fallback:', error);
          // Fallback to standard material with height-based color
          material = new THREE.MeshStandardMaterial({
            color: 0x8B7355, // Brown base color
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide,
            flatShading: false
          });
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

        _terrainLog('[Terrain Update] Terrain mesh created and added to scene using createTerrainGeometry');
        _terrainLog('[Terrain Update] Mesh details:', {
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
   * Sets the HeightmapSource from the single call site (orchestrator).
   * Replaces passManager?.getHeightmapSource() from TerrainSync.
   */
  public setHeightmapSource(source: HeightmapSource | null): void {
    this.heightmapSource = source;
  }

  /** Mode separation (H): cpu vs gpu_vtf; gpu_vtf requires HeightmapSource. */
  public setTerrainRenderMode(mode: TerrainRenderMode): void {
    this.terrainRenderMode = mode;
  }

  /** Wire HeightmapFreshness for recordUpload (optional). */
  public setHeightmapFreshness(f: HeightmapFreshness | null): void {
    this.heightmapFreshness = f;
  }

  /**
   * Updates the controls reference (for material updates)
   */
  public setControls(controls: SimulationParams | any): void {
    this.controls = controls;
  }

  /** Configures texture for VTF and asserts RAW format (dev). */
  private _configureAndAssertVTF(texture: THREE.Texture): void {
    const r = this.runtime.getRenderer();
    configureTextureForVTF(texture, r);
    assertRawHeightmap({ texture, internalFormat: 0x8814, renderer: r });
  }

  /**
   * Builds BVH from terrain geometry for raycasting (async, non-blocking)
   * Stores the BVH in simulation-state for brush system access
   */
  private buildBVHForRaycasting(geometry: THREE.BufferGeometry): void {
    if (this.terrainStateHolder.terrainBVHBuildInProgress) {
      _terrainLog('[BVH] Build already in progress, skipping');
      return;
    }
    
    if (!geometry) {
      _terrainWarn('[BVH] No geometry provided for BVH build');
      return;
    }
    
    this.terrainStateHolder.terrainBVHBuildInProgress = true;
    _terrainLog('[BVH] Starting BVH build from terrain geometry');

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
          _terrainLog(`[BVH] BVH construction complete in ${bvhDuration.toFixed(2)}ms`);

          this.terrainStateHolder.terrainBVH = bvh;
          _terrainLog('[BVH] BVH stored for brush raycasting');
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
  /**
   * Updates simulation resolution and recreates geometry if needed
   * Ensures plane geometry segments = simres - 1
   */
  public setSimRes(newSimres: number): void {
    if (this.simres === newSimres) {
      return; // No change needed
    }

    const oldSimres = this.simres;
    this.simres = newSimres;

    _terrainLog('[TerrainSync] Simres changed:', { oldSimres, newSimres });

    // If terrain mesh exists, recreate geometry with new segments
    if (this.terrainMesh && this.terrainMesh.geometry) {
      const terrainScale = this.controls?.TerrainScale || 3.2;
      const terrainSize = terrainScale * 320.0;
      const newSegments = newSimres - 1; // Lock: segments = simres - 1

      // Recreate plane geometry with new segments
      const newGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, newSegments, newSegments);
      newGeometry.rotateX(-Math.PI / 2); // Rotate to XZ plane (Y up)

      // Flatten all Y positions to 0 (vertex shader will displace from texture)
      const flatPositions = newGeometry.attributes.position.array as Float32Array;
      for (let i = 1; i < flatPositions.length; i += 3) {
        flatPositions[i] = 0.0; // Set Y to 0
      }
      newGeometry.attributes.position.needsUpdate = true;
      newGeometry.computeVertexNormals();
      newGeometry.computeBoundingBox();

      // Replace geometry
      const oldGeometry = this.terrainMesh.geometry;
      this.terrainMesh.geometry = newGeometry;
      oldGeometry.dispose();

      // Update terrainStateHolder
      this.terrainGeometry = newGeometry;
      this.terrainStateHolder.terrainGeometry = newGeometry;

      // Rebuild BVH with new geometry
      this.buildBVHForRaycasting(newGeometry);

      _terrainLog('[TerrainSync] Geometry recreated for new simres:', {
        oldSimres,
        newSimres,
        oldSegments: oldSimres - 1,
        newSegments,
        vertexCount: newGeometry.attributes.position.count
      });
    }

    // Update material uniforms with new simres (u_HeightDecodeScale = 1/simres)
    if (this.terrainMesh && this.terrainMesh.material) {
      this.updateMaterialUniforms(this.controls, this.passManager);
    }
  }

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
      // CRITICAL: Always bind to current write textures from pass manager (freshest texture each frame)
      const useSimHeightmap = (controls as any)?.UseSimHeightmap;
      const terrainTexture = passManager?.getTerrainTexture(); // Returns current write target
      const sedimentTexture = passManager?.getSedimentTexture(); // Returns current write target
      const targetHeightmap = useSimHeightmap ? terrainTexture : this.cpuHeightmapTexture;

      // Rebind u_Heightmap every frame to ensure we're using the freshest texture
      if (targetHeightmap && material.uniforms.u_Heightmap) {
        // Always rebind to ensure we're using the current write target (freshest texture)
        const currentTexture = material.uniforms.u_Heightmap.value as THREE.Texture;
        const currentWidth = (currentTexture as any)?.image?.width || (currentTexture as any)?.source?.data?.width || 0;
        const isDummy = currentWidth === 1;
        const referenceChanged = currentTexture !== targetHeightmap;
        if (referenceChanged || isDummy) {
          this._configureAndAssertVTF(targetHeightmap);
          material.uniforms.u_Heightmap.value = targetHeightmap;
          targetHeightmap.needsUpdate = true;
          material.needsUpdate = true;
          this.heightmapFreshness?.recordUpload();
        }
      } else if (useSimHeightmap && !terrainTexture) {
        console.warn('[TerrainSync] WARNING: UseSimHeightmap is true but terrainTexture is null - do NOT fall back to CPU texture');
        // Do NOT fall back to CPU texture when UseSimHeightmap=true and sim texture exists
      }

      // Rebind u_Sediment every frame to ensure we're using the freshest texture
      if (sedimentTexture && material.uniforms.u_Sediment) {
        const currentSed = material.uniforms.u_Sediment.value as THREE.Texture;
        // Always rebind to ensure we're using the current write target
        if (currentSed !== sedimentTexture) {
          this._configureAndAssertVTF(sedimentTexture);
          material.uniforms.u_Sediment.value = sedimentTexture;
          sedimentTexture.needsUpdate = true;
        }
      }

      // Update simulation parameters (H7: from HeightmapSource when available)
      const simresForUniforms = this.heightmapSource ? this.heightmapSource.simres : this.simres;
      if (material.uniforms.u_SimRes) {
        material.uniforms.u_SimRes.value = simresForUniforms;
      }
      if (material.uniforms.u_TerrainSize) {
        const terrainScale = controls?.TerrainScale || 3.2;
        material.uniforms.u_TerrainSize.value = terrainScale * 320.0;
      }
      if (material.uniforms.u_DebugScale && material.uniforms.u_MaxHeight && material.uniforms.u_MinHeight) {
        const dbgScale = (material.uniforms.u_MaxHeight.value || 0) - (material.uniforms.u_MinHeight.value || 0);
        material.uniforms.u_DebugScale.value = Math.max(dbgScale, 1.0);
      }
      // Decode Contract (explicit):
      // - Stored height = worldHeight * simres (height is stored multiplied by simres)
      // - Shader uses u_HeightDecodeScale = 1/simres to decode back to world height
      // - This contract must be maintained when simres changes
      // - Single source from HeightmapSource when present, otherwise use current simres
      if (material.uniforms.u_HeightDecodeScale) {
        const currentSimres = this.heightmapSource
          ? this.heightmapSource.simres
          : this.simres;
        material.uniforms.u_HeightDecodeScale.value = 1.0 / currentSimres;
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
