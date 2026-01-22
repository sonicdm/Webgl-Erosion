import * as THREE from 'three';
import { GpgpuPass } from '../gpgpu/GpgpuPass';
import { PingPongTarget } from '../gpgpu/PingPongTarget';
import { MRTRenderTarget } from '../gpgpu/MRTRenderTarget';
import { PassRunner } from '../gpgpu/PassRunner';
import quadVert from '../../shaders/quad-vert.glsl?raw';
// import { generateTerrain, getTerrainMethod, getEasing, TerrainOptions } from '../terrain/THREE.Terrain'; // Skipped for now - using simple procedural
import { extractHeightmapFromGeometry, uploadHeightmapToRenderTarget } from '../utils/terrain-heightmap-converter';
import { ensureTerrainLibrary } from '../terrain/THREE.Terrain';

// Import all shader sources
import rainFrag from '../../shaders/rain-frag.glsl?raw';
import flowFrag from '../../shaders/flow-frag.glsl?raw';
import alterwaterhightFrag from '../../shaders/alterwaterhight-frag.glsl?raw';
import sedimentFrag from '../../shaders/sediment-frag.glsl?raw';
import sediadvectFrag from '../../shaders/sediadvect-frag.glsl?raw';
import maccormackFrag from '../../shaders/maccormack-frag.glsl?raw';
import maxslippageheightFrag from '../../shaders/maxslippageheight-frag.glsl?raw';
import thermalterrainfluxFrag from '../../shaders/thermalterrainflux-frag.glsl?raw';
import thermalapplyFrag from '../../shaders/thermalapply-frag.glsl?raw';
import evaFrag from '../../shaders/eva-frag.glsl?raw';
import averageFrag from '../../shaders/average-frag.glsl?raw';
import lavaFlowFrag from '../../shaders/lava-flow-frag.glsl?raw';
import lavaUpdateFrag from '../../shaders/lava-update-frag.glsl?raw';
import lavaTerrainFrag from '../../shaders/lava-terrain-frag.glsl?raw';
import initialFrag from '../../shaders/initial-frag.glsl?raw';
import cleanFrag from '../../shaders/clean-frag.glsl?raw';

/**
 * Manages all simulation passes and their execution order.
 * This is the Three.js equivalent of SimulatePerStep in main.ts
 */
export class SimulationPassManager {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.OrthographicCamera;
  private fullscreenQuad: THREE.BufferGeometry;
  private passRunner: PassRunner;
  private simres: number;
  private initialHeightmap: Float32Array | null = null; // Store initial heightmap for readback
  private terrainMesh: THREE.Mesh | null = null; // Store generated mesh for rendering

  // Ping-pong targets
  private terrainPP: PingPongTarget;
  private fluxPP: PingPongTarget;
  private velocityPP: PingPongTarget;
  private sedimentPP: PingPongTarget;
  private sedimentBlendPP: PingPongTarget;
  private maxslippagePP: PingPongTarget;
  private terrainFluxPP: PingPongTarget;
  private lavaPP: PingPongTarget;
  private lavaFluxPP: PingPongTarget;

  // Non-ping-pong textures
  private terrainNor: THREE.WebGLRenderTarget;
  private sedimentAdvectA: THREE.WebGLRenderTarget;
  private sedimentAdvectB: THREE.WebGLRenderTarget;

  // Passes
  // private initialTerrainPass: GpgpuPass; // Replaced with THREE.Terrain CPU generation
  private cleanPass: GpgpuPass;
  private rainPass: GpgpuPass;
  private flowPass: GpgpuPass;
  private waterHeightPass: GpgpuPass;
  private sedimentPass: GpgpuPass;
  private advectPass: GpgpuPass;
  private macCormackPass: GpgpuPass;
  private maxslippagePass: GpgpuPass;
  private thermalFluxPass: GpgpuPass;
  private thermalApplyPass: GpgpuPass;
  private evaporationPass: GpgpuPass;
  private averagePass: GpgpuPass;
  private lavaFlowPass: GpgpuPass;
  private lavaUpdatePass: GpgpuPass;
  private lavaTerrainPass: GpgpuPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.OrthographicCamera,
    fullscreenQuad: THREE.BufferGeometry,
    simres: number
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.fullscreenQuad = fullscreenQuad;
    this.simres = simres;
    this.passRunner = new PassRunner(renderer, camera, simres);

    // Initialize ping-pong targets
    this.terrainPP = new PingPongTarget(simres, simres);
    this.fluxPP = new PingPongTarget(simres, simres);
    this.velocityPP = new PingPongTarget(simres, simres);
    this.sedimentPP = new PingPongTarget(simres, simres);
    this.sedimentBlendPP = new PingPongTarget(simres, simres);
    this.maxslippagePP = new PingPongTarget(simres, simres);
    this.terrainFluxPP = new PingPongTarget(simres, simres);
    this.lavaPP = new PingPongTarget(simres, simres);
    this.lavaFluxPP = new PingPongTarget(simres, simres);

    // Initialize non-ping-pong textures
    this.terrainNor = this.createRenderTarget(simres, simres);
    this.sedimentAdvectA = this.createRenderTarget(simres, simres);
    this.sedimentAdvectB = this.createRenderTarget(simres, simres);

    // Create all passes
    // this.initialTerrainPass = new GpgpuPass(quadVert, initialFrag, fullscreenQuad); // Replaced with THREE.Terrain
    this.cleanPass = new GpgpuPass(quadVert, cleanFrag, fullscreenQuad);
    this.rainPass = new GpgpuPass(quadVert, rainFrag, fullscreenQuad);
    this.flowPass = new GpgpuPass(quadVert, flowFrag, fullscreenQuad);
    this.waterHeightPass = new GpgpuPass(quadVert, alterwaterhightFrag, fullscreenQuad);
    this.sedimentPass = new GpgpuPass(quadVert, sedimentFrag, fullscreenQuad);
    this.advectPass = new GpgpuPass(quadVert, sediadvectFrag, fullscreenQuad);
    this.macCormackPass = new GpgpuPass(quadVert, maccormackFrag, fullscreenQuad);
    this.maxslippagePass = new GpgpuPass(quadVert, maxslippageheightFrag, fullscreenQuad);
    this.thermalFluxPass = new GpgpuPass(quadVert, thermalterrainfluxFrag, fullscreenQuad);
    this.thermalApplyPass = new GpgpuPass(quadVert, thermalapplyFrag, fullscreenQuad);
    this.evaporationPass = new GpgpuPass(quadVert, evaFrag, fullscreenQuad);
    this.averagePass = new GpgpuPass(quadVert, averageFrag, fullscreenQuad);
    this.lavaFlowPass = new GpgpuPass(quadVert, lavaFlowFrag, fullscreenQuad);
    this.lavaUpdatePass = new GpgpuPass(quadVert, lavaUpdateFrag, fullscreenQuad);
    this.lavaTerrainPass = new GpgpuPass(quadVert, lavaTerrainFrag, fullscreenQuad);
  }

  private async ensureTerrainAvailable(): Promise<void> {
    try {
      await ensureTerrainLibrary();
    } catch (error) {
      console.warn('Failed to load THREE.Terrain, falling back to procedural generation:', error);
    }
  }

  /**
   * Maps TerrainBaseType (number or string) to a THREE.Terrain generation function.
   * Fallback to DiamondSquare.
   */
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
   * Generates initial terrain using THREE.Terrain on CPU
   */
  private generateInitialTerrain(
    controls: any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): THREE.BufferGeometry {
    // Handle both string method names (new) and numeric IDs (legacy)
    const terrainBaseType = controls.TerrainBaseType;
    
    const terrainScale = controls.TerrainScale || 3.2;
    const terrainHeight = controls.TerrainHeight || 2.0;
    
    // Match demo EXACTLY: maxHeight: that.maxHeight - 100, minHeight: -100
    const baseMaxHeight = terrainHeight * 120.0;
    const maxHeight = baseMaxHeight - 100; // Match demo: that.maxHeight - 100
    const minHeight = -100; // Match demo: -100

    // Try to use THREE.Terrain if available
    const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
    if (globalTHREE && globalTHREE.Terrain) {
      try {
        // Get the terrain generation method
        const heightmapMethod = this.getTerrainGenerationMethod(terrainBaseType);
        const heightmap = heightmapSource || heightmapMethod;
        
        // Get easing function (default to Linear)
        const easing = globalTHREE.Terrain.Linear || ((t: number) => t);
        
        // Generate terrain using THREE.Terrain (returns a Scene)
        // THREE.Terrain creates (segments + 1) x (segments + 1) vertices
        // For a simres x simres heightmap, we need exactly simres x simres height values
        // To avoid edge artifacts, we should create exactly simres x simres vertices
        // So: segments + 1 = simres, therefore segments = simres - 1
        const terrainSize = terrainScale * 320.0; // Match demo: scale 3.2 = 1024 units
        const segments = this.simres - 1; // Creates exactly simres x simres vertices (no extra edge row/column)
        
        const terrainScene = globalTHREE.Terrain({
          easing: easing,
          heightmap: heightmap,
          maxHeight: maxHeight - 100, // Match demo: that.maxHeight - 100
          minHeight: -100, // Match demo: -100
          xSize: terrainSize,
          ySize: terrainSize,
          xSegments: segments,
          ySegments: segments,
          material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Temporary material
          steps: controls.TerrainSteps || 1,
          turbulent: controls.TerrainTurbulent || false,
          stretch: true,
        });
        
        // Extract geometry from the scene (THREE.Terrain returns a Scene with a mesh)
        const terrainMesh = terrainScene.children[0] as THREE.Mesh;
        if (terrainMesh && terrainMesh.geometry) {
          const geom = terrainMesh.geometry.clone();
          // Orient to XZ plane (Y up) to match renderer and heightmap extractor expectations
          geom.rotateX(-Math.PI / 2);
          geom.computeVertexNormals();
          geom.computeBoundingBox();
          return geom; // Clone to avoid disposing the original
        }
      } catch (error) {
        console.warn('Failed to use THREE.Terrain, falling back to simple procedural:', error);
      }
    }
    
    // Fallback: Generate terrain geometry procedurally on CPU
    const geometry = new THREE.PlaneGeometry(
      this.simres,
      this.simres,
      this.simres,
      this.simres
    );
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ
    
    const positions = geometry.attributes.position.array as Float32Array;
    const heightFunction = typeof heightmapSource === 'function'
      ? heightmapSource
      : this.getTerrainGenerationMethod(terrainBaseType, terrainRandom);
    
    // Modify vertex heights procedurally
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      let height: number;
      if (heightmapSource && typeof heightmapSource !== 'function') {
        // TODO: Sample from heightmap image if THREE.Terrain is unavailable
        height = 0.5;
      } else if (heightFunction && typeof heightFunction === 'function') {
        // Normalize x, z to [0, 1] range for height function
        const u = (x / this.simres) + 0.5;
        const v = (z / this.simres) + 0.5;
        const normalizedHeight = heightFunction(u, v);
        height = minHeight + normalizedHeight * (maxHeight - minHeight);
      } else {
        height = 0;
      }
      
      positions[i + 1] = height; // Set Y (height)
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Initializes all textures by clearing them and generating initial terrain
   */
  public async initializeTextures(
    controls: any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): Promise<void> {
    await this.ensureTerrainAvailable();

    // Clear all textures first
    this.cleanPass.setUniform('dummy', 0); // Clean pass has no inputs
    
    // Clear all ping-pong targets
    this.passRunner.executeSinglePass(this.cleanPass, this.terrainPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.terrainPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.fluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.fluxPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.velocityPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.velocityPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentBlendPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentBlendPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.maxslippagePP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.maxslippagePP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.terrainFluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.terrainFluxPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.lavaPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.lavaPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.lavaFluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.lavaFluxPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.terrainNor);
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentAdvectA);
    this.passRunner.executeSinglePass(this.cleanPass, this.sedimentAdvectB);

    // Generate initial terrain using THREE.Terrain (as per official usage)
    try {
      console.log('Generating initial terrain with THREE.Terrain...');
      await this.ensureTerrainAvailable();
      
      const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
      if (!globalTHREE || !globalTHREE.Terrain) {
        throw new Error('THREE.Terrain not available');
      }
      
      // Handle both string method names (new) and numeric IDs (legacy)
      const terrainBaseType = controls.TerrainBaseType;
      
      const terrainScale = controls.TerrainScale || 3.2;
      const terrainHeight = controls.TerrainHeight || 2.0;
      
      // Match demo EXACTLY: maxHeight: that.maxHeight - 100, minHeight: -100
      // Demo uses maxHeight: 200 - 100 = 100, minHeight: -100, so terrain spans -100 to 100
      // We use terrainHeight * 120.0 as the base, then subtract 100 for maxHeight
      const baseMaxHeight = terrainHeight * 120.0;
      const maxHeight = baseMaxHeight - 100; // Match demo: that.maxHeight - 100
      const minHeight = -100; // Match demo: -100
      
      // Get terrain generation method
      const heightmapMethod = this.getTerrainGenerationMethod(terrainBaseType);
      const heightmap = heightmapSource || heightmapMethod;
      const easing = globalTHREE.Terrain.Linear || ((t: number) => t);
      
      // Generate terrain using THREE.Terrain (returns a Scene with mesh)
      // THREE.Terrain creates (segments + 1) x (segments + 1) vertices
      // For a simres x simres heightmap, we need exactly simres x simres height values
      // To avoid edge artifacts, we should create exactly simres x simres vertices
      // So: segments + 1 = simres, therefore segments = simres - 1
      const terrainSize = terrainScale * 320.0; // Match demo: scale 3.2 = 1024 units
      const segments = this.simres - 1; // Creates exactly simres x simres vertices (no extra edge row/column)
      
      console.log('[Terrain Generation] ===== START TERRAIN GENERATION (initializeTextures) =====');
      console.log('[Terrain Generation] Parameters:', {
        terrainBaseType: terrainBaseType,
        terrainScale: terrainScale,
        terrainHeight: terrainHeight,
        terrainSize: terrainSize,
        segments: segments,
        simres: this.simres,
        expectedVertices: (segments + 1) * (segments + 1),
        maxHeight: maxHeight - 100,
        minHeight: -100,
        heightmapType: typeof heightmap,
        easingType: typeof easing
      });
      
      const terrainScene = globalTHREE.Terrain({
        easing: easing,
        heightmap: heightmap,
        maxHeight: maxHeight - 100, // Match demo: that.maxHeight - 100
        minHeight: -100, // Match demo: -100
        xSize: terrainSize,
        ySize: terrainSize,
        xSegments: segments,
        ySegments: segments,
        material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Will be replaced later
        steps: controls.TerrainSteps || 1,
        turbulent: controls.TerrainTurbulent || false,
        stretch: true,
      });
      
      // Extract the mesh from the scene (THREE.Terrain returns Scene with mesh as first child)
      const terrainMesh = terrainScene.children[0] as THREE.Mesh;
      if (!terrainMesh || !terrainMesh.geometry) {
        throw new Error('THREE.Terrain did not generate a valid mesh');
      }
      
      console.log('[Terrain Generation] Mesh created:', {
        vertexCount: terrainMesh.geometry.attributes.position.count,
        expectedVertices: (segments + 1) * (segments + 1),
        hasNormals: !!terrainMesh.geometry.attributes.normal,
        hasUVs: !!terrainMesh.geometry.attributes.uv
      });
      
      // Check bounds BEFORE rotation
      terrainMesh.geometry.computeBoundingBox();
      const bboxBefore = terrainMesh.geometry.boundingBox;
      if (bboxBefore) {
        console.log('[Terrain Generation] Bounds BEFORE rotation:', {
          min: { x: bboxBefore.min.x.toFixed(2), y: bboxBefore.min.y.toFixed(2), z: bboxBefore.min.z.toFixed(2) },
          max: { x: bboxBefore.max.x.toFixed(2), y: bboxBefore.max.y.toFixed(2), z: bboxBefore.max.z.toFixed(2) },
          size: {
            x: (bboxBefore.max.x - bboxBefore.min.x).toFixed(2),
            y: (bboxBefore.max.y - bboxBefore.min.y).toFixed(2),
            z: (bboxBefore.max.z - bboxBefore.min.z).toFixed(2)
          }
        });
      }
      
      // Sample a few vertices before rotation
      const posArrayBefore = terrainMesh.geometry.attributes.position.array as Float32Array;
      console.log('[Terrain Generation] Sample vertices BEFORE rotation:', {
        vertex0: { x: posArrayBefore[0].toFixed(2), y: posArrayBefore[1].toFixed(2), z: posArrayBefore[2].toFixed(2) },
        vertexCenter: {
          idx: Math.floor(terrainMesh.geometry.attributes.position.count / 2) * 3,
          x: posArrayBefore[Math.floor(terrainMesh.geometry.attributes.position.count / 2) * 3].toFixed(2),
          y: posArrayBefore[Math.floor(terrainMesh.geometry.attributes.position.count / 2) * 3 + 1].toFixed(2),
          z: posArrayBefore[Math.floor(terrainMesh.geometry.attributes.position.count / 2) * 3 + 2].toFixed(2)
        },
        vertexLast: {
          idx: (terrainMesh.geometry.attributes.position.count - 1) * 3,
          x: posArrayBefore[(terrainMesh.geometry.attributes.position.count - 1) * 3].toFixed(2),
          y: posArrayBefore[(terrainMesh.geometry.attributes.position.count - 1) * 3 + 1].toFixed(2),
          z: posArrayBefore[(terrainMesh.geometry.attributes.position.count - 1) * 3 + 2].toFixed(2)
        }
      });
      
      // Orient geometry to XZ plane (Y up) to match renderer and extraction expectations
      terrainMesh.geometry = terrainMesh.geometry.clone(); // avoid mutating original
      terrainMesh.geometry.rotateX(-Math.PI / 2);
      terrainMesh.geometry.computeVertexNormals();
      terrainMesh.geometry.computeBoundingBox();
      terrainMesh.updateMatrixWorld(true);
      
      // Check bounds AFTER rotation
      const bboxAfter = terrainMesh.geometry.boundingBox;
      if (bboxAfter) {
        console.log('[Terrain Generation] Bounds AFTER rotation:', {
          min: { x: bboxAfter.min.x.toFixed(2), y: bboxAfter.min.y.toFixed(2), z: bboxAfter.min.z.toFixed(2) },
          max: { x: bboxAfter.max.x.toFixed(2), y: bboxAfter.max.y.toFixed(2), z: bboxAfter.max.z.toFixed(2) },
          size: {
            x: (bboxAfter.max.x - bboxAfter.min.x).toFixed(2),
            y: (bboxAfter.max.y - bboxAfter.min.y).toFixed(2),
            z: (bboxAfter.max.z - bboxAfter.min.z).toFixed(2)
          }
        });
      }
      
      // Sample vertices after rotation
      const posArrayAfter = terrainMesh.geometry.attributes.position.array as Float32Array;
      
      // Sample more vertices to check height distribution
      const sampleIndices = [
        0, // First vertex
        Math.floor(terrainMesh.geometry.attributes.position.count / 4) * 3, // 25%
        Math.floor(terrainMesh.geometry.attributes.position.count / 2) * 3, // 50% (center)
        Math.floor(terrainMesh.geometry.attributes.position.count * 3 / 4) * 3, // 75%
        (terrainMesh.geometry.attributes.position.count - 1) * 3 // Last vertex
      ];
      
      const sampleVertices: any = {};
      let heightSum = 0;
      let heightCount = 0;
      for (let i = 0; i < sampleIndices.length; i++) {
        const idx = sampleIndices[i];
        if (idx + 2 < posArrayAfter.length) {
          const x = posArrayAfter[idx];
          const y = posArrayAfter[idx + 1]; // Height
          const z = posArrayAfter[idx + 2];
          sampleVertices[`vertex_${i}`] = { 
            idx: idx / 3, 
            x: x.toFixed(2), 
            y: y.toFixed(2), 
            z: z.toFixed(2) 
          };
          heightSum += y;
          heightCount++;
        }
      }
      
      // Check height distribution across all vertices
      let allHeightsMin = Infinity;
      let allHeightsMax = -Infinity;
      let negativeCount = 0;
      let positiveCount = 0;
      for (let i = 1; i < posArrayAfter.length; i += 3) { // Y is at index 1, then every 3rd
        const y = posArrayAfter[i];
        if (y < allHeightsMin) allHeightsMin = y;
        if (y > allHeightsMax) allHeightsMax = y;
        if (y < 0) negativeCount++;
        else positiveCount++;
      }
      
      console.log('[Terrain Generation] Sample vertices AFTER rotation:', sampleVertices);
      console.log('[Terrain Generation] Height distribution:', {
        min: allHeightsMin.toFixed(2),
        max: allHeightsMax.toFixed(2),
        range: (allHeightsMax - allHeightsMin).toFixed(2),
        negativeCount: negativeCount,
        positiveCount: positiveCount,
        expectedRange: `[${minHeight}, ${maxHeight - 100}]`,
        averageHeight: (heightSum / heightCount).toFixed(2)
      });
      
      // Extract heightmap data from geometry for GPU simulation
      console.log('[Terrain Generation] Extracting heightmap from geometry...');
      console.log('[Terrain Generation] Geometry info for extraction:', {
        vertexCount: terrainMesh.geometry.attributes.position.count,
        simres: this.simres,
        expectedVertices: (this.simres + 1) * (this.simres + 1),
        expectedHeightmapSize: this.simres * this.simres * 4
      });
      
      const heightmapData = extractHeightmapFromGeometry(terrainMesh.geometry, this.simres);
      
      console.log('[Terrain Generation] Heightmap extracted:', {
        dataLength: heightmapData.length,
        expectedLength: this.simres * this.simres * 4,
        heightValues: this.simres * this.simres,
        first16Values: Array.from(heightmapData.slice(0, 16)).map(v => v.toFixed(2)),
        sampleIndices: {
          topLeft: heightmapData[0].toFixed(2),
          topRight: heightmapData[(this.simres - 1) * 4].toFixed(2),
          center: heightmapData[Math.floor(this.simres * this.simres / 2) * 4].toFixed(2),
          bottomLeft: heightmapData[(this.simres - 1) * this.simres * 4].toFixed(2),
          bottomRight: heightmapData[(this.simres * this.simres - 1) * 4].toFixed(2)
        }
      });
      
      // Store heightmap for initial terrain geometry (avoid GPU readback issues)
      this.initialHeightmap = new Float32Array(heightmapData);
      console.log('[Terrain Generation] Stored initial heightmap:', {
        length: this.initialHeightmap.length,
        sampleValues: Array.from(this.initialHeightmap.slice(0, 8)).map(v => v.toFixed(2))
      });
      
      // Store the terrain mesh for later use (we'll use it for rendering)
      // THREE.Terrain returns a Scene with the mesh as first child - use it directly
      this.terrainMesh = terrainMesh;
      
      // Ensure the mesh is properly configured
      this.terrainMesh.scale.set(1, 1, 1); // THREE.Terrain handles its own scaling
      this.terrainMesh.position.set(0, 0, 0);
      this.terrainMesh.frustumCulled = false;
      
      console.log('[Terrain Generation] Mesh stored and configured:', {
        scale: { x: this.terrainMesh.scale.x, y: this.terrainMesh.scale.y, z: this.terrainMesh.scale.z },
        position: { x: this.terrainMesh.position.x, y: this.terrainMesh.position.y, z: this.terrainMesh.position.z },
        rotation: { x: this.terrainMesh.rotation.x, y: this.terrainMesh.rotation.y, z: this.terrainMesh.rotation.z },
        frustumCulled: this.terrainMesh.frustumCulled
      });
      
      // Upload heightmap to terrainPP ping-pong target
      console.log('[Terrain Generation] Uploading heightmap to GPU...');
      uploadHeightmapToRenderTarget(
        this.renderer,
        heightmapData,
        this.terrainPP.getWriteTarget(),
        this.fullscreenQuad,
        this.camera
      );
      console.log('[Terrain Generation] Heightmap uploaded to GPU');
      
      // Swap ping-pong so initial terrain is in read position
      this.terrainPP.swap();
      console.log('[Terrain Generation] ===== TERRAIN GENERATION COMPLETE =====');
    } catch (error) {
      console.error('Failed to generate terrain:', error);
      throw error;
    }
  }

  /**
   * Creates a render target with float format
   */
  private createRenderTarget(width: number, height: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: false,
    });
  }

  /**
   * Executes one simulation step (equivalent to SimulatePerStep)
   */
  public executeStep(controls: any): void {
    // 0. Rain precipitation
    this.executeRainPass(controls);
    
    // 1. Flow (flux)
    this.executeFlowPass(controls);
    
    // 2. Water height/velocity
    this.executeWaterHeightPass(controls);
    
    // 3. Sediment
    this.executeSedimentPass(controls);
    
    // 4. Sediment advection (conditional)
    if (controls.AdvectionMethod == 1) {
      this.executeMacCormackAdvection(controls);
    } else {
      this.executeSimpleAdvection(controls);
    }
    
    // 5. Max slippage
    this.executeMaxSlippagePass(controls);
    
    // 6. Thermal terrain flux
    this.executeThermalFluxPass(controls);
    
    // 7. Thermal apply
    this.executeThermalApplyPass(controls);
    
    // 8. Evaporation
    this.executeEvaporationPass(controls);
    
    // 9. Lava flow
    this.executeLavaFlowPass(controls);
    
    // 10. Lava update
    this.executeLavaUpdatePass(controls);
    
    // 11. Lava-terrain interaction
    this.executeLavaTerrainPass(controls);
    
    // 12. Average smoothing
    this.executeAveragePass(controls);
  }

  // Individual pass execution methods (to be implemented with proper uniform setting)
  private executeRainPass(controls: any): void {
    this.rainPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.rainPass.setUniform('raindeg', controls.RainDegree);
    this.rainPass.setUniform('u_SimRes', this.simres);
    // ... set other uniforms as needed
    this.passRunner.executePingPongPass(this.rainPass, this.terrainPP);
  }

  private executeFlowPass(controls: any): void {
    this.flowPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.flowPass.setInputTexture('readFlux', this.fluxPP.getReadTexture());
    this.flowPass.setInputTexture('readSedi', this.sedimentPP.getReadTexture());
    this.flowPass.setUniform('u_SimRes', this.simres);
    this.flowPass.setUniform('u_PipeLen', controls.pipelen);
    this.flowPass.setUniform('u_timestep', controls.timestep);
    this.flowPass.setUniform('u_PipeArea', controls.pipeAra);
    this.passRunner.executePingPongPass(this.flowPass, this.fluxPP);
  }

  private executeWaterHeightPass(controls: any): void {
    // This is an MRT pass (2 outputs)
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 2);
    mrtTarget.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    
    this.waterHeightPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readFlux', this.fluxPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readSedi', this.sedimentPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readVel', this.velocityPP.getReadTexture());
    this.waterHeightPass.setUniform('u_SimRes', this.simres);
    this.waterHeightPass.setUniform('u_PipeLen', controls.pipelen);
    this.waterHeightPass.setUniform('u_timestep', controls.timestep);
    this.waterHeightPass.setUniform('u_PipeArea', controls.pipeAra);
    this.waterHeightPass.setUniform('u_VelMult', controls.VelocityMultiplier);
    this.waterHeightPass.setUniform('u_VelAdvMag', controls.VelocityAdvectionMag);
    
    this.passRunner.executeMRTPass(this.waterHeightPass, mrtTarget.getTargets());
    this.terrainPP.swap();
    this.velocityPP.swap();
  }

  private executeSedimentPass(controls: any): void {
    // This is a 4-output MRT pass
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 4);
    mrtTarget.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.sedimentPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[2] = this.terrainNor.texture;
    mrtTarget.getTargets().texture[3] = this.velocityPP.getWriteTarget().texture;
    
    this.sedimentPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.sedimentPass.setInputTexture('readVelocity', this.velocityPP.getReadTexture());
    this.sedimentPass.setInputTexture('readSediment', this.sedimentPP.getReadTexture());
    this.sedimentPass.setInputTexture('readLava', this.lavaPP.getReadTexture());
    this.sedimentPass.setUniform('u_SimRes', this.simres);
    this.sedimentPass.setUniform('u_PipeLen', controls.pipelen);
    this.sedimentPass.setUniform('Kc', controls.Kc);
    this.sedimentPass.setUniform('Ks', controls.Ks);
    this.sedimentPass.setUniform('Kd', controls.Kd);
    this.sedimentPass.setUniform('u_timestep', controls.timestep);
    
    this.passRunner.executeMRTPass(this.sedimentPass, mrtTarget.getTargets());
    this.terrainPP.swap();
    this.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeMacCormackAdvection(controls: any): void {
    // Subpass 1
    const mrt1 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt1.getTargets().texture[0] = this.sedimentAdvectA.texture;
    mrt1.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt1.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt1.getTargets());
    
    // Subpass 2
    const mrt2 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt2.getTargets().texture[0] = this.sedimentAdvectB.texture;
    mrt2.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt2.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('sedi', this.sedimentAdvectA.texture);
    this.advectPass.setUniform('unif_advectMultiplier', -1);
    this.passRunner.executeMRTPass(this.advectPass, mrt2.getTargets());
    
    // Subpass 3: MacCormack
    this.macCormackPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.macCormackPass.setInputTexture('sedi', this.sedimentPP.getReadTexture());
    this.macCormackPass.setInputTexture('sediadvecta', this.sedimentAdvectA.texture);
    this.macCormackPass.setInputTexture('sediadvectb', this.sedimentAdvectB.texture);
    this.macCormackPass.setUniform('u_SimRes', this.simres);
    this.macCormackPass.setUniform('u_PipeLen', controls.pipelen);
    this.macCormackPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeSinglePass(this.macCormackPass, this.sedimentPP.getWriteTarget());
    
    this.sedimentBlendPP.swap();
    this.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeSimpleAdvection(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt.getTargets().texture[0] = this.sedimentPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt.getTargets());
    
    this.sedimentBlendPP.swap();
    this.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeMaxSlippagePass(controls: any): void {
    this.maxslippagePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.maxslippagePass.setUniform('u_SimRes', this.simres);
    this.maxslippagePass.setUniform('u_PipeLen', controls.pipelen);
    this.maxslippagePass.setUniform('u_timestep', controls.timestep);
    this.maxslippagePass.setUniform('u_PipeArea', controls.pipeAra);
    this.maxslippagePass.setUniform('unif_TalusScale', controls.thermalTalusAngleScale);
    this.maxslippagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executePingPongPass(this.maxslippagePass, this.maxslippagePP);
  }

  private executeThermalFluxPass(controls: any): void {
    this.thermalFluxPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.thermalFluxPass.setInputTexture('readMaxSlippage', this.maxslippagePP.getReadTexture());
    this.thermalFluxPass.setUniform('u_SimRes', this.simres);
    this.thermalFluxPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalFluxPass.setUniform('u_timestep', controls.timestep);
    this.thermalFluxPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalFluxPass.setUniform('unif_thermalRate', controls.thermalRate);
    this.passRunner.executePingPongPass(this.thermalFluxPass, this.terrainFluxPP);
  }

  private executeThermalApplyPass(controls: any): void {
    this.thermalApplyPass.setInputTexture('readTerrainFlux', this.terrainFluxPP.getReadTexture());
    this.thermalApplyPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.thermalApplyPass.setUniform('u_SimRes', this.simres);
    this.thermalApplyPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalApplyPass.setUniform('u_timestep', controls.timestep);
    this.thermalApplyPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalApplyPass.setUniform('unif_thermalErosionScale', controls.thermalErosionScale);
    this.passRunner.executePingPongPass(this.thermalApplyPass, this.terrainPP);
  }

  private executeEvaporationPass(controls: any): void {
    this.evaporationPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.evaporationPass.setUniform('evapod', controls.EvaporationConstant);
    this.passRunner.executePingPongPass(this.evaporationPass, this.terrainPP);
  }

  private executeLavaFlowPass(controls: any): void {
    // Unbind textures to avoid feedback loops
    this.renderer.setRenderTarget(null);
    
    this.lavaFlowPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaFlowPass.setInputTexture('readLava', this.lavaPP.getReadTexture());
    this.lavaFlowPass.setInputTexture('readLavaFlux', this.lavaFluxPP.getReadTexture());
    this.lavaFlowPass.setUniform('u_SimRes', this.simres);
    this.lavaFlowPass.setUniform('u_PipeLen', controls.pipelen);
    this.lavaFlowPass.setUniform('u_timestep', controls.timestep);
    this.lavaFlowPass.setUniform('u_PipeArea', controls.pipeAra);
    // Set lava physics constants...
    this.passRunner.executePingPongPass(this.lavaFlowPass, this.lavaFluxPP);
  }

  private executeLavaUpdatePass(controls: any): void {
    this.lavaUpdatePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaUpdatePass.setInputTexture('readLava', this.lavaPP.getReadTexture());
    this.lavaUpdatePass.setInputTexture('readLavaFlux', this.lavaFluxPP.getReadTexture());
    // Set all lava update uniforms...
    this.passRunner.executePingPongPass(this.lavaUpdatePass, this.lavaPP);
  }

  private executeLavaTerrainPass(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.lavaPP.getWriteTarget().texture;
    
    this.lavaTerrainPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaTerrainPass.setInputTexture('readLava', this.lavaPP.getReadTexture());
    this.lavaTerrainPass.setInputTexture('readLavaFlux', this.lavaFluxPP.getReadTexture());
    // Set lava terrain uniforms...
    this.passRunner.executeMRTPass(this.lavaTerrainPass, mrt.getTargets());
    this.terrainPP.swap();
    this.lavaPP.swap();
  }

  private executeAveragePass(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.terrainNor.texture;
    
    this.averagePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.averagePass.setInputTexture('readSedi', this.sedimentPP.getReadTexture());
    this.averagePass.setUniform('u_SimRes', this.simres);
    this.averagePass.setUniform('unif_ErosionMode', controls.ErosionMode);
    this.averagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executeMRTPass(this.averagePass, mrt.getTargets());
    this.terrainPP.swap();
  }

  /**
   * Gets texture accessors for external use (e.g., rendering, readback)
   */
  public getTerrainTexture(): THREE.Texture {
    return this.terrainPP.getReadTexture();
  }

  public getLavaTexture(): THREE.Texture {
    return this.lavaPP.getReadTexture();
  }

  /**
   * Gets render target accessors for CPU readback
   */
  public getTerrainRenderTarget(): THREE.WebGLRenderTarget {
    return this.terrainPP.getReadTarget();
  }

  public getLavaRenderTarget(): THREE.WebGLRenderTarget {
    return this.lavaPP.getReadTarget();
  }

  /**
   * Gets the initial heightmap data (stored from terrain generation)
   * This avoids GPU readback issues with FloatType textures
   */
  public getInitialHeightmap(): Float32Array | null {
    return this.initialHeightmap;
  }
  
  /**
   * Gets the THREE.Terrain generated mesh (for rendering)
   */
  public getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMesh;
  }

  public getSedimentTexture(): THREE.Texture {
    return this.sedimentPP.getReadTexture();
  }

  /**
   * Resizes all targets when simulation resolution changes
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
    this.passRunner.setSimRes(simres);
    
    // Resize all ping-pong targets
    this.terrainPP.setSize(simres, simres);
    this.fluxPP.setSize(simres, simres);
    this.velocityPP.setSize(simres, simres);
    this.sedimentPP.setSize(simres, simres);
    this.sedimentBlendPP.setSize(simres, simres);
    this.maxslippagePP.setSize(simres, simres);
    this.terrainFluxPP.setSize(simres, simres);
    this.lavaPP.setSize(simres, simres);
    this.lavaFluxPP.setSize(simres, simres);
    
    // Resize non-ping-pong targets
    this.terrainNor.setSize(simres, simres);
    this.sedimentAdvectA.setSize(simres, simres);
    this.sedimentAdvectB.setSize(simres, simres);
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    // Dispose ping-pong targets
    this.terrainPP.dispose();
    this.fluxPP.dispose();
    this.velocityPP.dispose();
    this.sedimentPP.dispose();
    this.sedimentBlendPP.dispose();
    this.maxslippagePP.dispose();
    this.terrainFluxPP.dispose();
    this.lavaPP.dispose();
    this.lavaFluxPP.dispose();
    
    // Dispose non-ping-pong targets
    this.terrainNor.dispose();
    this.sedimentAdvectA.dispose();
    this.sedimentAdvectB.dispose();
    
    // Dispose passes
    this.rainPass.dispose();
    this.flowPass.dispose();
    this.waterHeightPass.dispose();
    this.sedimentPass.dispose();
    this.advectPass.dispose();
    this.macCormackPass.dispose();
    this.maxslippagePass.dispose();
    this.thermalFluxPass.dispose();
    this.thermalApplyPass.dispose();
    this.evaporationPass.dispose();
    this.averagePass.dispose();
    this.lavaFlowPass.dispose();
    this.lavaUpdatePass.dispose();
    this.lavaTerrainPass.dispose();
  }
}

