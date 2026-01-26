import * as THREE from 'three';
import { extractHeightmapFromGeometry, uploadHeightmap } from '../../utils/terrain-heightmap-converter';
import { HeightmapSource } from '../../utils/HeightmapSource';
import { ensureTerrainLibrary, getEasing } from '../../terrain/THREE.Terrain';
import { PingPongTarget } from '../../gpgpu/PingPongTarget';
import { SimulationParams } from '../../../app/dto/SimulationParams';
import { getTerrainTypeRegistry } from '../../terrain/terrain-type-registry';
import { TerrainGenerationOptions } from '../../terrain/TerrainGenerationOptions';
import { MaskApplicator } from '../../terrain/mask-applicator';

/**
 * Service responsible for terrain mesh generation and heightmap readback
 * Extracted from SimulationPassManager to separate terrain generation concerns
 */
export class TerrainReadbackService {
  private initialHeightmap: Float32Array | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private heightmapSource: HeightmapSource | null = null;

  constructor(
    private simres: number,
    private renderer: THREE.WebGLRenderer,
    private terrainPP: PingPongTarget
  ) {}

  /**
   * Ensures THREE.Terrain library is available
   */
  private async ensureTerrainAvailable(): Promise<void> {
    try {
      await ensureTerrainLibrary();
    } catch (error) {
      console.warn('Failed to load THREE.Terrain, falling back to procedural generation:', error);
    }
  }

  /**
   * Maps TerrainBaseType (number or string) to a THREE.Terrain generation function.
   * Handles both string method names (direct THREE.Terrain methods) and legacy numeric IDs.
   * Fallback to DiamondSquare.
   */
  private getTerrainGenerationMethod(baseType: number | string): any {
    const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
    const Terrain = globalTHREE?.Terrain;
    if (!Terrain) {
      console.warn('[Terrain Method] THREE.Terrain not available');
      return null;
    }

    // If caller passed a string that matches exactly, use it directly
    if (typeof baseType === 'string') {
      if (Terrain[baseType]) {
        console.log('[Terrain Method] Using string method name:', baseType);
        return Terrain[baseType];
      }
      // If numeric string, parse and fall through to numeric handling
      const parsed = Number(baseType);
      if (!Number.isNaN(parsed)) {
        baseType = parsed;
      } else {
        console.warn('[Terrain Method] Unknown string method:', baseType, 'falling back to DiamondSquare');
        return Terrain.DiamondSquare;
      }
    }

    // Legacy numeric IDs mapped to THREE.Terrain methods
    const methodMap: Record<number, string> = {
      0: 'CosineLayers',   // Ordinary FBM - use CosineLayers (multi-octave noise)
      1: 'Perlin',          // Domain Warp - use Perlin
      2: 'DiamondSquare',   // Terrace - use DiamondSquare (post-processed)
      3: 'Worley',          // Voronoi - use Worley
      4: 'PerlinDiamond',   // Ridge Noise - use PerlinDiamond
      5: 'SimplexLayers',   // Billow Noise - use SimplexLayers
      6: 'PerlinLayers',    // Turbulence - use PerlinLayers
      7: 'Hill',            // Craters - use Hill
      8: 'DiamondSquare',   // Dunes - use DiamondSquare
      9: 'Fault',           // Canyons - use Fault
      10: 'HillIsland',     // Mountains - use HillIsland
      11: 'Simplex',        // Billowy Ridges - use Simplex
    };

    if (typeof baseType === 'number' && Number.isFinite(baseType)) {
      const methodName = methodMap[baseType] || 'DiamondSquare';
      console.log('[Terrain Method] Mapped legacy ID', baseType, 'to method:', methodName);
      
      if (Terrain[methodName]) {
        return Terrain[methodName];
      } else {
        console.warn('[Terrain Method] Method', methodName, 'not found, falling back to DiamondSquare');
        return Terrain.DiamondSquare;
      }
    }

    console.warn('[Terrain Method] Invalid baseType:', baseType, 'falling back to DiamondSquare');
    return Terrain.DiamondSquare;
  }

  /**
   * Generates terrain mesh and initializes heightmap
   * Uses new BaseTerrainType architecture with standardized options
   */
  public async generateTerrain(
    controls: SimulationParams | any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): Promise<void> {
    await this.ensureTerrainAvailable();

    try {
      console.log('[Terrain Generation] Starting terrain generation with new architecture...');
      await this.ensureTerrainAvailable();
      
      const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
      if (!globalTHREE || !globalTHREE.Terrain) {
        throw new Error('THREE.Terrain not available');
      }
      
      // Handle both string method names (THREE.Terrain methods) and numeric IDs (shader types 0-11)
      const terrainBaseType = controls.TerrainBaseType;
      
      const terrainScale = controls.TerrainScale || 3.2;
      const terrainHeight = controls.TerrainHeight || 2.0;
      const terrainMask = controls.TerrainMask || 0;
      
      // Match demo EXACTLY: maxHeight: that.maxHeight - 100, minHeight: -100
      // Demo uses maxHeight: 200 - 100 = 100, minHeight: -100, so terrain spans -100 to 100
      // We use terrainHeight * 120.0 as the base, then subtract 100 for maxHeight
      const baseMaxHeight = terrainHeight * 120.0;
      const maxHeight = baseMaxHeight - 100; // Match demo: that.maxHeight - 100
      const minHeight = -100; // Match demo: -100
      
      // Calculate terrain size and segments
      const terrainSize = terrainScale * 320.0; // Match demo: scale 3.2 = 1024 units
      const segments = this.simres - 1; // Creates exactly simres x simres vertices
      
      // Build standardized TerrainGenerationOptions
      const generationOptions: TerrainGenerationOptions = {
        xSegments: segments,
        ySegments: segments,
        xSize: terrainSize,
        ySize: terrainSize,
        terrainScale,
        terrainHeight,
        terrainMask,
        terrainSteps: controls.TerrainSteps || 1,
        terrainTurbulent: controls.TerrainTurbulent || false,
        timer,
        frequency: undefined, // TODO: Add UI control for frequency
        easing: getEasing('Linear'),
        after: undefined, // Optional post-processing callback
        terrainRandom,
      };
      
      // Get terrain type from registry
      const registry = getTerrainTypeRegistry();
      let terrainType = registry.get(terrainBaseType);
      
      if (!terrainType) {
        console.warn(`[Terrain Generation] Terrain type '${terrainBaseType}' not found, using default (OrdinaryFBM)`);
        terrainType = registry.getById(0);
        if (!terrainType) {
          throw new Error('Default terrain type (OrdinaryFBM) not available');
        }
      }
      
      // Handle heightmap source (for imported heightmaps) - use directly if provided
      let finalHeightmap: any;
      if (heightmapSource && typeof heightmapSource !== 'function') {
        // CanvasImageSource - use directly, skip terrain type generation
        finalHeightmap = heightmapSource;
      } else {
        // Create heightmap function wrapper that uses terrain type
        finalHeightmap = (zs: Float32Array | number[], options: any) => {
          // Map THREE.Terrain options to our standardized options
          const standardizedOptions: TerrainGenerationOptions = {
            ...generationOptions,
            xSegments: options.xSegments || segments,
            ySegments: options.ySegments || segments,
            xSize: options.xSize || terrainSize,
            ySize: options.ySize || terrainSize,
          };
          // Generate base terrain (no masks - masks applied in post-process)
          terrainType!.generateHeightmap(zs, standardizedOptions);
        };
      }
      
      const easing = generationOptions.easing || globalTHREE.Terrain.Linear || ((t: number) => t);
      
      
      // Log terrain generation start
      console.log('[Terrain Generation] Starting terrain generation:', {
        terrainBaseType: terrainBaseType,
        terrainType: terrainType!.getName(),
        terrainScale: terrainScale,
        terrainHeight: terrainHeight,
        terrainMask: terrainMask,
        segments: segments,
        simres: this.simres,
        expectedVertices: (segments + 1) * (segments + 1)
      });
      
      const terrainScene = globalTHREE.Terrain({
        easing: easing,
        heightmap: finalHeightmap,
        maxHeight: maxHeight,
        minHeight: minHeight,
        xSize: terrainSize,
        ySize: terrainSize,
        xSegments: segments,
        ySegments: segments,
        material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Will be replaced later
        steps: generationOptions.terrainSteps,
        turbulent: generationOptions.terrainTurbulent,
        stretch: true,
        frequency: generationOptions.frequency,
        after: generationOptions.after,
      });
      
      // Extract the mesh from the scene (THREE.Terrain returns Scene with mesh as first child)
      const terrainMesh = terrainScene.children[0] as THREE.Mesh;
      if (!terrainMesh || !terrainMesh.geometry) {
        throw new Error('THREE.Terrain did not generate a valid mesh');
      }
      
      // Apply mask as post-process if needed (for ALL terrain types, not just custom)
      if (terrainMask > 0) {
        console.log('[Terrain Generation] Applying mask', terrainMask, 'as post-process');
        // Extract height values from geometry (before rotation)
        // THREE.Terrain creates terrain in XY plane, so Z is height
        const positions = terrainMesh.geometry.attributes.position.array as Float32Array;
        const heightmapArray = new Float32Array((segments + 1) * (segments + 1));
        for (let i = 2; i < positions.length; i += 3) {
          // Z is height before rotation (THREE.Terrain creates in XY plane)
          heightmapArray[(i - 2) / 3] = positions[i];
        }
        // Apply mask
        MaskApplicator.applyMask(heightmapArray, terrainMask, generationOptions);
        // Update geometry with masked heights
        for (let i = 2; i < positions.length; i += 3) {
          positions[i] = heightmapArray[(i - 2) / 3];
        }
        terrainMesh.geometry.attributes.position.needsUpdate = true;
        terrainMesh.geometry.computeVertexNormals();
        console.log('[Terrain Generation] Mask applied successfully');
      }
      
      // Verify UVs match terrain-geometry-builder.ts: u = x / (width - 1) where width = simres
      let uvMin = [Infinity, Infinity];
      let uvMax = [-Infinity, -Infinity];
      if (terrainMesh.geometry.attributes.uv) {
        const uvArray = terrainMesh.geometry.attributes.uv.array as Float32Array;
        for (let i = 0; i < uvArray.length; i += 2) {
          uvMin[0] = Math.min(uvMin[0], uvArray[i]);
          uvMin[1] = Math.min(uvMin[1], uvArray[i + 1]);
          uvMax[0] = Math.max(uvMax[0], uvArray[i]);
          uvMax[1] = Math.max(uvMax[1], uvArray[i + 1]);
        }
      }
      
      console.log('[Terrain Generation] Mesh created:', {
        vertexCount: terrainMesh.geometry.attributes.position.count,
        expectedVertices: (segments + 1) * (segments + 1),
        hasNormals: !!terrainMesh.geometry.attributes.normal,
        hasUVs: !!terrainMesh.geometry.attributes.uv,
        uvRange: terrainMesh.geometry.attributes.uv ? {
          minU: uvMin[0].toFixed(4),
          maxU: uvMax[0].toFixed(4),
          minV: uvMin[1].toFixed(4),
          maxV: uvMax[1].toFixed(4),
          expectedRange: '[0, 1] (matching terrain-geometry-builder.ts)'
        } : 'No UVs'
      });
      
      // THREE.Terrain creates terrain in XY plane (Z is height)
      // Extract heightmap data BEFORE rotating (extractor expects Z to be height)
      this.heightmapSource = extractHeightmapFromGeometry(terrainMesh.geometry, this.simres);
      if (this.heightmapSource) {
        let min = this.heightmapSource.minHeight;
        let max = this.heightmapSource.maxHeight;
        const tex = this.heightmapSource.textureData;
        const firstSample = tex[0];
        const midSample = tex[Math.floor(tex.length / 2)] || NaN;
        const lastSample = tex[tex.length - 4] || NaN;

        console.log('[Terrain Generation] HeightmapSource stats:', {
          simres: this.simres,
          minHeight: min,
          maxHeight: max,
          textureDataLength: tex.length,
          firstSample,
          midSample,
          lastSample
        });

        const invalid =
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          !Number.isFinite(firstSample) ||
          !Number.isFinite(midSample) ||
          !Number.isFinite(lastSample);

        if (invalid) {
          throw new Error(`[Terrain Generation] Invalid heightmap (NaN/Inf). baseType=${terrainBaseType}, type=${terrainType!.getName()}`);
        }
      }
      
      // Now rotate the GEOMETRY to XZ plane (Y is height) for rendering
      // This matches the fallback approach - actually modifies vertex positions
      terrainMesh.geometry.rotateX(-Math.PI / 2);
      terrainMesh.geometry.computeVertexNormals();
      terrainMesh.geometry.computeBoundingBox();
      
      // Store heightmap for initial terrain geometry (avoid GPU readback issues)
      this.initialHeightmap = new Float32Array(this.heightmapSource.textureData);
      
      // Store the terrain mesh for later use (we'll use it for rendering)
      // THREE.Terrain returns a Scene with the mesh as first child - use it directly
      this.terrainMesh = terrainMesh;
      
      // Ensure the mesh is properly configured
      // Geometry was rotated above, so mesh rotation should be identity
      this.terrainMesh.scale.set(1, 1, 1);
      this.terrainMesh.position.set(0, 0, 0);
      this.terrainMesh.rotation.set(0, 0, 0); // No mesh rotation needed - geometry was rotated
      this.terrainMesh.frustumCulled = false;
      this.terrainMesh.updateMatrixWorld(true);
      
      // Log final mesh state for debugging
      const finalBbox = this.terrainMesh.geometry.boundingBox;
      console.log('[Terrain Generation] Final mesh configuration:', {
        rotation: { x: this.terrainMesh.rotation.x.toFixed(4), y: this.terrainMesh.rotation.y.toFixed(4), z: this.terrainMesh.rotation.z.toFixed(4) },
        position: { x: this.terrainMesh.position.x, y: this.terrainMesh.position.y, z: this.terrainMesh.position.z },
        scale: { x: this.terrainMesh.scale.x, y: this.terrainMesh.scale.y, z: this.terrainMesh.scale.z },
        bounds: finalBbox ? {
          x: (finalBbox.max.x - finalBbox.min.x).toFixed(2),
          y: (finalBbox.max.y - finalBbox.min.y).toFixed(2),
          z: (finalBbox.max.z - finalBbox.min.z).toFixed(2),
          center: { x: ((finalBbox.max.x + finalBbox.min.x) / 2).toFixed(2), y: ((finalBbox.max.y + finalBbox.min.y) / 2).toFixed(2), z: ((finalBbox.max.z + finalBbox.min.z) / 2).toFixed(2) }
        } : 'No bounds',
        hasIndices: !!this.terrainMesh.geometry.index,
        indexCount: this.terrainMesh.geometry.index ? this.terrainMesh.geometry.index.count : 0
      });
      
      // Ensure bounding box is computed for frustum culling
      this.terrainMesh.geometry.computeBoundingBox();
      
      // Upload heightmap to terrainPP ping-pong target
      if (this.heightmapSource) {
        uploadHeightmap(
          this.renderer,
          this.heightmapSource,
          this.terrainPP.getWriteTarget()
        );
      }
      
      // Swap ping-pong so initial terrain is in read position
      this.terrainPP.swap();
      console.log('[Terrain Generation] Terrain generation complete');
    } catch (error) {
      console.error('Failed to generate terrain:', error);
      // Do NOT fallback silently; propagate the error so UI can surface it
      throw error;
    }
  }

  /**
   * Gets the THREE.Terrain generated mesh (for rendering)
   */
  public getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMesh;
  }

  /**
   * Gets the initial heightmap data (stored from terrain generation)
   * This avoids GPU readback issues with FloatType textures
   */
  public getInitialHeightmap(): Float32Array | null {
    return this.initialHeightmap;
  }

  /**
   * Gets the HeightmapSource (contains texture data and metadata)
   */
  public getHeightmapSource(): HeightmapSource | null {
    return this.heightmapSource;
  }

  /**
   * Gets the stored height range (world height range)
   * Legacy method for compatibility
   */
  public getStoredHeightRange(): { min: number; max: number } {
    if (this.heightmapSource) {
      return { min: this.heightmapSource.minHeight, max: this.heightmapSource.maxHeight };
    }
    return { min: 0, max: 0 };
  }

  /**
   * Updates simulation resolution (for resizing)
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
  }
}
