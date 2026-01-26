import * as THREE from 'three';
import { extractHeightmapFromGeometry, uploadHeightmap } from '../../utils/terrain-heightmap-converter';
import { HeightmapSource } from '../../utils/HeightmapSource';
import { ensureTerrainLibrary, getEasing } from '../../terrain/THREE.Terrain';
import { PingPongTarget } from '../../gpgpu/PingPongTarget';
import { SimulationParams } from '../../../app/dto/SimulationParams';
import { getTerrainTypeRegistry } from '../../terrain/terrain-type-registry';
import { TerrainGenerationOptions } from '../../terrain/TerrainGenerationOptions';
import { MaskApplicator } from '../../terrain/mask-applicator';
import { HeightmapReadbackUtil } from '../../utils/heightmap-readback';
import { ensureRenderTargetFloat } from '../../utils/textureFormatVTF';

/**
 * Service responsible for terrain mesh generation and heightmap readback
 * Extracted from SimulationPassManager to separate terrain generation concerns
 */
export class TerrainReadbackService {
  private initialHeightmap: Float32Array | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private heightmapSource: HeightmapSource | null = null;
  private cachedHeightmapImage: CanvasImageSource | null = null; // Cache for imported heightmaps

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
   * Maps smoothing string to THREE.Terrain smoothing function
   */
  private getSmoothingFunction(smoothingName: string): ((vertices: THREE.Vector3[], options: any) => void) | null {
    const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
    const Terrain = globalTHREE?.Terrain;
    if (!Terrain) {
      return null;
    }

    if (smoothingName === 'None') {
      return null;
    }

    // Map smoothing names to THREE.Terrain functions
    const smoothingMap: Record<string, string> = {
      'Conservative 0.5': 'Conservative',
      'Conservative 1': 'Conservative',
      'Conservative 10': 'Conservative',
      'Gaussian 0.5,7': 'Gaussian',
      'Gaussian 1.0,7': 'Gaussian',
      'Gaussian 1.5,7': 'Gaussian',
      'Gaussian 1.0,5': 'Gaussian',
      'Gaussian 1.0,11': 'Gaussian',
      'GaussianBox': 'GaussianBox',
      'Mean 0': 'Mean',
      'Mean 1': 'Mean',
      'Mean 8': 'Mean',
      'Median': 'Median',
    };

    const methodName = smoothingMap[smoothingName];
    if (!methodName || !Terrain[methodName]) {
      console.warn(`[Terrain Generation] Unknown smoothing function: ${smoothingName}, skipping smoothing`);
      return null;
    }

    return Terrain[methodName];
  }

  /**
   * Creates edge application function based on edge parameters
   */
  private createEdgeFunction(
    edgeType: 'Box' | 'Radial',
    edgeDirection: 'Normal' | 'Up' | 'Down',
    edgeCurve: 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut',
    edgeDistance: number
  ): ((vertices: THREE.Vector3[], options: any) => void) | null {
    if (edgeDistance <= 0) {
      return null; // No edge application
    }

    const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
    const Terrain = globalTHREE?.Terrain;
    if (!Terrain) {
      return null;
    }

    // Get edge easing function
    const edgeEasing = getEasing(edgeCurve);
    if (typeof edgeEasing !== 'function') {
      console.warn(`[Terrain Generation] Invalid edge curve: ${edgeCurve}, using Linear`);
      return null;
    }

    // THREE.Terrain.Edges and RadialEdges signatures:
    // Edges(vertices, distance, direction, easing)
    // RadialEdges(vertices, distance, direction, easing)
    // direction: 'Normal' | 'Up' | 'Down'
    if (edgeType === 'Radial') {
      if (Terrain.RadialEdges) {
        return (vertices: THREE.Vector3[], options: any) => {
          Terrain.RadialEdges(vertices, edgeDistance, edgeDirection, edgeEasing);
        };
      }
    } else {
      if (Terrain.Edges) {
        return (vertices: THREE.Vector3[], options: any) => {
          Terrain.Edges(vertices, edgeDistance, edgeDirection, edgeEasing);
        };
      }
    }

    console.warn(`[Terrain Generation] Edge function not available for type: ${edgeType}`);
    return null;
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
      
      // Compute segments from controls or fallback to simres - 1
      let segments = controls.TerrainSegments ?? (this.simres - 1);
      // Validate segments/simres lock: segments + 1 must equal simres
      if (segments + 1 !== this.simres) {
        console.warn(`[Terrain Generation] Segments/simres mismatch: segments=${segments}, simres=${this.simres}. Setting segments = simres - 1`);
        segments = this.simres - 1;
      }
      
      // Get new THREE.Terrain parameters
      const terrainSize = controls.TerrainSize ?? 1024;
      const terrainWidthLengthRatio = controls.TerrainWidthLengthRatio ?? 1.0;
      const terrainSteps = controls.TerrainSteps ?? 1;
      const terrainTurbulent = controls.TerrainTurbulent ?? false;
      const terrainEasingStr = controls.TerrainEasing ?? 'Linear';
      const terrainSmoothing = controls.TerrainSmoothing ?? 'None';
      const terrainEdgeType = controls.TerrainEdgeType ?? 'Box';
      const terrainEdgeDirection = controls.TerrainEdgeDirection ?? 'Normal';
      const terrainEdgeCurve = controls.TerrainEdgeCurve ?? 'Linear';
      const terrainEdgeDistance = controls.TerrainEdgeDistance ?? 256;
      
      // Validate all parameters before proceeding
      if (!Number.isFinite(segments) || segments < 1) {
        throw new Error(`[Terrain Generation] Invalid segments: ${segments}. Must be finite and >= 1`);
      }
      if (!Number.isFinite(terrainSize) || terrainSize <= 0) {
        throw new Error(`[Terrain Generation] Invalid terrainSize: ${terrainSize}. Must be finite and > 0`);
      }
      if (!Number.isFinite(terrainWidthLengthRatio) || terrainWidthLengthRatio <= 0) {
        throw new Error(`[Terrain Generation] Invalid terrainWidthLengthRatio: ${terrainWidthLengthRatio}. Must be finite and > 0`);
      }
      if (!Number.isFinite(terrainSteps) || terrainSteps < 1) {
        throw new Error(`[Terrain Generation] Invalid terrainSteps: ${terrainSteps}. Must be finite and >= 1`);
      }
      
      // Calculate xSize and ySize from TerrainSize and ratio
      const xSize = terrainSize;
      const ySize = terrainSize * terrainWidthLengthRatio;
      
      // Get easing function
      const easing = getEasing(terrainEasingStr);
      if (typeof easing !== 'function') {
        throw new Error(`[Terrain Generation] Invalid easing function for '${terrainEasingStr}'. getEasing returned: ${typeof easing}`);
      }
      
      // Match demo EXACTLY: maxHeight: that.maxHeight - 100, minHeight: -100
      // Demo uses maxHeight: 200 - 100 = 100, minHeight: -100, so terrain spans -100 to 100
      // We use terrainHeight * 120.0 as the base, then subtract 100 for maxHeight
      const baseMaxHeight = terrainHeight * 120.0;
      const maxHeight = baseMaxHeight - 100; // Match demo: that.maxHeight - 100
      const minHeight = -100; // Match demo: -100
      
      // Build standardized TerrainGenerationOptions with all new parameters
      const generationOptions: TerrainGenerationOptions = {
        xSegments: segments,
        ySegments: segments,
        xSize: xSize,
        ySize: ySize,
        terrainScale,
        terrainHeight,
        terrainMask,
        terrainSteps: terrainSteps,
        terrainTurbulent: terrainTurbulent,
        timer,
        frequency: undefined, // TODO: Add UI control for frequency
        easing: easing,
        after: undefined, // Optional post-processing callback (will be set for edges/smoothing)
        terrainRandom,
        // New THREE.Terrain advanced parameters
        terrainEasing: terrainEasingStr,
        terrainSize: terrainSize,
        terrainWidthLengthRatio: terrainWidthLengthRatio,
        terrainSmoothing: terrainSmoothing,
        terrainEdgeType: terrainEdgeType,
        terrainEdgeDirection: terrainEdgeDirection,
        terrainEdgeCurve: terrainEdgeCurve,
        terrainEdgeDistance: terrainEdgeDistance,
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
      
      // Handle heightmap source (for imported heightmaps) - use cached or provided
      let finalHeightmap: any;
      const useCachedHeightmap = this.cachedHeightmapImage && (terrainBaseType === 'heightmap' || controls.TerrainBaseType === 'heightmap');
      
      if (useCachedHeightmap && this.cachedHeightmapImage) {
        // Use cached heightmap
        console.log('[Terrain Generation] Using cached heightmap image');
        finalHeightmap = this.cachedHeightmapImage;
      } else if (heightmapSource && typeof heightmapSource !== 'function') {
        // CanvasImageSource - use directly, cache it, and force base type to 'heightmap'
        console.log('[Terrain Generation] Using provided heightmap image, caching it');
        this.cachedHeightmapImage = heightmapSource;
        // Note: TerrainBaseType should be set to 'heightmap' by the caller (GUI or import handler)
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
      
      // Build after callback for edges and smoothing
      const edgeFunction = this.createEdgeFunction(terrainEdgeType, terrainEdgeDirection, terrainEdgeCurve, terrainEdgeDistance);
      const smoothingFunction = terrainSmoothing !== 'None' ? this.getSmoothingFunction(terrainSmoothing) : null;

      const afterCallback = (vertices: THREE.Vector3[], options: any) => {
        // Apply edges first (if enabled)
        if (edgeFunction) {
          try {
            edgeFunction(vertices, options);
          } catch (error) {
            console.error(`[Terrain Generation] Edge application failed:`, error);
            throw new Error(`Edge application failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // Apply smoothing (if enabled)
        if (smoothingFunction) {
          try {
            smoothingFunction(vertices, options);
            // Validate smoothing didn't produce NaN/Inf
            for (let i = 0; i < vertices.length; i++) {
              if (!Number.isFinite(vertices[i].z)) {
                throw new Error(`Smoothing '${terrainSmoothing}' produced NaN/Inf at vertex ${i}`);
              }
            }
          } catch (error) {
            console.error(`[Terrain Generation] Smoothing '${terrainSmoothing}' failed:`, error);
            throw new Error(`Smoothing '${terrainSmoothing}' failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      };

      // Log all parameters before THREE.Terrain call for debugging NaN issue
      const threeTerrainParams = {
        easing: easing,
        heightmap: typeof finalHeightmap === 'function' ? '[function]' : finalHeightmap,
        maxHeight: maxHeight,
        minHeight: minHeight,
        xSize: xSize,
        ySize: ySize,
        xSegments: segments,
        ySegments: segments,
        steps: terrainSteps,
        turbulent: terrainTurbulent,
        stretch: true,
        frequency: generationOptions.frequency,
        after: edgeFunction || smoothingFunction ? afterCallback : undefined,
      };

      console.log('[Terrain Generation] THREE.Terrain() parameters:', {
        ...threeTerrainParams,
        heightmap: typeof finalHeightmap === 'function' ? '[heightmap function]' : '[CanvasImageSource]',
        easing: typeof easing === 'function' ? '[function]' : easing,
        after: threeTerrainParams.after ? '[function]' : undefined,
        // Validate parameter types
        paramTypes: {
          easing: typeof easing,
          xSize: typeof xSize,
          ySize: typeof ySize,
          xSegments: typeof segments,
          ySegments: typeof segments,
          steps: typeof terrainSteps,
          turbulent: typeof terrainTurbulent,
          maxHeight: typeof maxHeight,
          minHeight: typeof minHeight,
        },
        paramValues: {
          xSize,
          ySize,
          segments,
          terrainSteps,
          terrainTurbulent,
          maxHeight,
          minHeight,
        }
      });

      // Validate all parameters are finite before calling THREE.Terrain
      const paramChecks = {
        easing: typeof easing === 'function',
        xSize: Number.isFinite(xSize) && xSize > 0,
        ySize: Number.isFinite(ySize) && ySize > 0,
        segments: Number.isFinite(segments) && segments > 0,
        steps: Number.isFinite(terrainSteps) && terrainSteps >= 1,
        maxHeight: Number.isFinite(maxHeight),
        minHeight: Number.isFinite(minHeight),
      };

      const invalidParams = Object.entries(paramChecks).filter(([_, valid]) => !valid);
      if (invalidParams.length > 0) {
        throw new Error(`[Terrain Generation] Invalid parameters before THREE.Terrain call: ${invalidParams.map(([name]) => name).join(', ')}. Values: ${JSON.stringify(threeTerrainParams.paramValues)}`);
      }
      
      // Log terrain generation start
      console.log('[Terrain Generation] Starting terrain generation:', {
        terrainBaseType: terrainBaseType,
        terrainType: terrainType!.getName(),
        terrainScale: terrainScale,
        terrainHeight: terrainHeight,
        terrainMask: terrainMask,
        segments: segments,
        simres: this.simres,
        expectedVertices: (segments + 1) * (segments + 1),
        xSize,
        ySize,
        terrainSteps,
        terrainTurbulent,
        terrainEasing: terrainEasingStr,
        terrainSmoothing,
        terrainEdgeType,
        terrainEdgeDistance,
      });
      
      const terrainScene = globalTHREE.Terrain({
        easing: easing,
        heightmap: finalHeightmap,
        maxHeight: maxHeight,
        minHeight: minHeight,
        xSize: xSize,
        ySize: ySize,
        xSegments: segments,
        ySegments: segments,
        material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Will be replaced later
        steps: terrainSteps,
        turbulent: terrainTurbulent,
        stretch: true,
        frequency: generationOptions.frequency,
        after: edgeFunction || smoothingFunction ? afterCallback : undefined,
      });
      
      // Extract the mesh from the scene (THREE.Terrain returns Scene with mesh as first child)
      const terrainMesh = terrainScene.children[0] as THREE.Mesh;
      if (!terrainMesh || !terrainMesh.geometry) {
        throw new Error('THREE.Terrain did not generate a valid mesh');
      }

      // Validate geometry position attributes for NaN after THREE.Terrain call
      const positions = terrainMesh.geometry.attributes.position.array as Float32Array;
      let nanCount = 0;
      let infCount = 0;
      for (let i = 0; i < positions.length; i++) {
        if (!Number.isFinite(positions[i])) {
          if (Number.isNaN(positions[i])) {
            nanCount++;
          } else {
            infCount++;
          }
        }
      }
      if (nanCount > 0 || infCount > 0) {
        console.error(`[Terrain Generation] Geometry validation failed: ${nanCount} NaN values, ${infCount} Inf values in position attributes`);
        console.error('[Terrain Generation] First 20 position values:', Array.from(positions.slice(0, 20)));
        throw new Error(`[Terrain Generation] THREE.Terrain generated invalid geometry: ${nanCount} NaN, ${infCount} Inf values. baseType=${terrainBaseType}, type=${terrainType!.getName()}`);
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
        const writeTarget = this.terrainPP.getWriteTarget();
        
        // Log source data for debugging
        const sourceData = this.heightmapSource.textureData;
        const sourceSampleIndices = [0, Math.floor(sourceData.length / 8), Math.floor(sourceData.length / 2), Math.floor(sourceData.length * 3 / 4), sourceData.length - 4];
        const sourceSamples = sourceSampleIndices.map(idx => sourceData[idx]);
        console.log('[Terrain Generation] Uploading heightmap - source samples (stored heights):', {
          minHeight: this.heightmapSource.minHeight,
          maxHeight: this.heightmapSource.maxHeight,
          expectedStoredMin: this.heightmapSource.minHeight * this.simres,
          expectedStoredMax: this.heightmapSource.maxHeight * this.simres,
          sampleIndices: sourceSampleIndices,
          sampleValues: sourceSamples
        });
        
        // Ensure the render target texture is configured for float format
        ensureRenderTargetFloat(writeTarget, this.renderer);
        
        // Force Three.js to initialize the texture in the renderer's properties
        // by calling initTexture (which creates the WebGL texture without rendering)
        const properties = (this.renderer as any).properties;
        if (properties) {
          const textureProperties = properties.get(writeTarget.texture);
          if (!textureProperties?.__webglTexture) {
            // Texture doesn't exist yet - initialize it by setting it as render target briefly
            // This will create the texture in the renderer's properties
            this.renderer.setRenderTarget(writeTarget);
            // Don't render anything - just the act of setting the render target initializes the texture
            this.renderer.setRenderTarget(null);
            // Re-ensure format after initialization
            ensureRenderTargetFloat(writeTarget, this.renderer);
          }
        }
        
        // Now upload the heightmap data (will throw if it fails)
        try {
          uploadHeightmap(
            this.renderer,
            this.heightmapSource,
            writeTarget
          );
          
          // Verify upload by checking texture properties
          const properties = (this.renderer as any).properties;
          const textureProperties = properties?.get(writeTarget.texture);
          console.log('[Terrain Generation] Upload verification:', {
            hasWebGLTexture: !!textureProperties?.__webglTexture,
            textureInit: textureProperties?.__webglInit,
            internalFormat: (textureProperties as any)?.__webglTextureInternalFormat,
            width: writeTarget.width,
            height: writeTarget.height,
            sourceDataLength: this.heightmapSource.textureData.length
          });
        } catch (uploadError) {
          throw new Error(`[Terrain Generation] Failed to upload heightmap: ${uploadError}`);
        }
        
        console.log('[Terrain Generation] Heightmap uploaded to render target');
        
        // Wait for GPU to finish upload before reading back
        await new Promise((resolve) => requestAnimationFrame(resolve));
        
        // CRITICAL: Verify upload by reading back immediately
        // This will tell us if the data was actually written correctly
        try {
          const immediateReadback = await HeightmapReadbackUtil.readHeightmapMinMax(
            this.renderer,
            writeTarget,
            this.simres,
            8 // Read larger patch for better verification
          );
          
          const { min, max, range, stats } = immediateReadback;
          console.log('[Terrain Generation] Immediate post-upload readback:', {
            min,
            max,
            range,
            expectedMin: this.heightmapSource.minHeight,
            expectedMax: this.heightmapSource.maxHeight,
            expectedRange: this.heightmapSource.maxHeight - this.heightmapSource.minHeight,
            stats
          });
          
          // Check if readback matches expected range (within tolerance)
          const expectedRange = this.heightmapSource.maxHeight - this.heightmapSource.minHeight;
          if (range < expectedRange * 0.1) {
            console.error(`[Terrain Generation] Upload verification FAILED: readback range (${range}) is much smaller than expected (${expectedRange})`);
            console.error(`[Terrain Generation] This suggests the upload did not write the data correctly`);
          } else {
            console.log(`[Terrain Generation] Upload verification PASSED: readback range matches expected range`);
          }
        } catch (readbackError) {
          console.error('[Terrain Generation] Immediate readback failed:', readbackError);
        }
      }
      
      // Swap ping-pong so initial terrain is in read position
      this.terrainPP.swap();
      
      // Health check: read back a small patch and verify min/max are finite
      // After swap, the uploaded terrain is now in the read target
      try {
        const readbackResult = await HeightmapReadbackUtil.readHeightmapMinMax(
          this.renderer,
          this.terrainPP.getReadTarget(),
          this.simres,
          4 // 4x4 patch
        );
        
        const { min, max, range, stats } = readbackResult;
        
        console.log('[Terrain Generation] Health check readback stats:', stats);
        
        // Validate: min/max must be finite and range must be > threshold
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          throw new Error(`[Terrain Generation] Health check failed: min=${min}, max=${max} (non-finite)`);
        }
        
        if (range < 1e-5) {
          throw new Error(`[Terrain Generation] Health check failed: range too small (${range} < 1e-5) - terrain is flat`);
        }
        
        console.log('[Terrain Generation] Health check passed:', { min, max, range });
      } catch (readbackError) {
        console.error('[Terrain Generation] Health check failed:', readbackError);
        // Don't throw here - let the existing validation catch it
        // But log the readback error for debugging
      }
      
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

  /**
   * Gets the cached heightmap image (if any)
   */
  public getCachedHeightmap(): CanvasImageSource | null {
    return this.cachedHeightmapImage;
  }

  /**
   * Clears the cached heightmap image
   */
  public clearHeightmapCache(): void {
    this.cachedHeightmapImage = null;
    console.log('[Terrain Generation] Heightmap cache cleared');
  }
}
