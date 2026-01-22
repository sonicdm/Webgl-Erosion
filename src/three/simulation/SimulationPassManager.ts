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
   * Maps TerrainBaseType enum to THREE.Terrain generation method
   */
  private getTerrainGenerationMethod(baseType: number): any {
    // Ensure THREE.Terrain is loaded
    const globalTHREE = typeof window !== 'undefined' ? (window as any).THREE : null;
    if (!globalTHREE || !globalTHREE.Terrain) {
      // Fallback to simple procedural if THREE.Terrain not available
      return (x: number, y: number): number => {
        const scale = 0.1;
        const n1 = Math.sin(x * scale * 2) * Math.cos(y * scale * 2);
        const n2 = Math.sin(x * scale * 4) * Math.cos(y * scale * 4) * 0.5;
        const n3 = Math.sin(x * scale * 8) * Math.cos(y * scale * 8) * 0.25;
        return (n1 + n2 + n3) * 0.5 + 0.5;
      };
    }
    
    // Map TerrainBaseType to THREE.Terrain methods
    const methodMap: { [key: number]: string } = {
      0: 'DiamondSquare',  // ordinaryFBM
      1: 'Simplex',        // domainWarp
      2: 'Value',          // terrace
      3: 'Worley',         // voroni
      4: 'Perlin',         // ridgenoise
      5: 'Simplex',        // billowNoise
      6: 'Perlin',         // turbulence
      7: 'Feature',       // craters
      8: 'Simplex',        // dunes
      9: 'Fault',          // canyons
      10: 'DiamondSquare', // mountains
      11: 'Simplex',       // billowyRidges
    };
    
    const methodName = methodMap[baseType] || 'DiamondSquare';
    return globalTHREE.Terrain[methodName] || globalTHREE.Terrain.DiamondSquare;
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
    const terrainBaseType = typeof controls.TerrainBaseType === 'number' 
      ? controls.TerrainBaseType 
      : (typeof controls.TerrainBaseType === 'string' ? parseInt(controls.TerrainBaseType) || 0 : 0);
    
    const terrainScale = controls.TerrainScale || 3.2;
    const terrainHeight = controls.TerrainHeight || 2.0;
    const frequency = terrainScale; // Map scale to frequency
    
    // Calculate height range
    // Original shader uses: terrain_hight *= u_TerrainHeight*120.0
    const maxHeight = terrainHeight * 120.0;
    const minHeight = 0; // Original starts from 0

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
        const terrainScene = globalTHREE.Terrain({
          easing: easing,
          frequency: frequency,
          heightmap: heightmap,
          material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Temporary material
          maxHeight: maxHeight,
          minHeight: minHeight,
          xSegments: this.simres,
          xSize: this.simres,
          ySegments: this.simres,
          ySize: this.simres,
        });
        
        // Extract geometry from the scene (THREE.Terrain returns a Scene with a mesh)
        const terrainMesh = terrainScene.children[0] as THREE.Mesh;
        if (terrainMesh && terrainMesh.geometry) {
          return terrainMesh.geometry.clone(); // Clone to avoid disposing the original
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
    
    const positions = geometry.attributes.position.array as Float32Array;
    const heightFunction = typeof heightmapSource === 'function'
      ? heightmapSource
      : this.getTerrainGenerationMethod(terrainBaseType);
    
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
      
      const terrainBaseType = typeof controls.TerrainBaseType === 'number' 
        ? controls.TerrainBaseType 
        : (typeof controls.TerrainBaseType === 'string' ? parseInt(controls.TerrainBaseType) || 0 : 0);
      
      const terrainScale = controls.TerrainScale || 3.2;
      const terrainHeight = controls.TerrainHeight || 2.0;
      const frequency = terrainScale;
      const maxHeight = terrainHeight * 120.0;
      const minHeight = 0;
      
      // Get terrain generation method
      const heightmapMethod = this.getTerrainGenerationMethod(terrainBaseType);
      const heightmap = heightmapSource || heightmapMethod;
      const easing = globalTHREE.Terrain.Linear || ((t: number) => t);
      
      // Generate terrain using THREE.Terrain (returns a Scene with mesh)
      const terrainScene = globalTHREE.Terrain({
        easing: easing,
        frequency: frequency,
        heightmap: heightmap,
        material: new THREE.MeshBasicMaterial({ color: 0x888888 }), // Will be replaced later
        maxHeight: maxHeight,
        minHeight: minHeight,
        xSegments: this.simres,
        xSize: this.simres,
        ySegments: this.simres,
        ySize: this.simres,
      });
      
      // Extract the mesh from the scene (THREE.Terrain returns Scene with mesh as first child)
      const terrainMesh = terrainScene.children[0] as THREE.Mesh;
      if (!terrainMesh || !terrainMesh.geometry) {
        throw new Error('THREE.Terrain did not generate a valid mesh');
      }
      
      console.log('Terrain generated, vertices:', terrainMesh.geometry.attributes.position.count);
      
      // Extract heightmap data from geometry for GPU simulation
      const heightmapData = extractHeightmapFromGeometry(terrainMesh.geometry, this.simres);
      console.log('Heightmap extracted, size:', heightmapData.length, 'first few values:', Array.from(heightmapData.slice(0, 16)));
      
      // Store heightmap for initial terrain geometry (avoid GPU readback issues)
      this.initialHeightmap = new Float32Array(heightmapData);
      
      // Store the terrain mesh for later use (we'll use it for rendering)
      // THREE.Terrain returns a Scene with the mesh as first child - use it directly
      this.terrainMesh = terrainMesh;
      
      // Ensure the mesh is properly configured
      this.terrainMesh.scale.set(1, 1, 1); // THREE.Terrain handles its own scaling
      this.terrainMesh.position.set(0, 0, 0);
      this.terrainMesh.frustumCulled = false;
      
      // Upload heightmap to terrainPP ping-pong target
      uploadHeightmapToRenderTarget(
        this.renderer,
        heightmapData,
        this.terrainPP.getWriteTarget(),
        this.fullscreenQuad,
        this.camera
      );
      console.log('Heightmap uploaded to GPU');
      
      // Swap ping-pong so initial terrain is in read position
      this.terrainPP.swap();
      console.log('Initial terrain generation complete');
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

