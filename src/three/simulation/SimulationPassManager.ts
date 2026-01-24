import * as THREE from 'three';
import { GpgpuPass } from '../gpgpu/GpgpuPass';
import { PingPongTarget } from '../gpgpu/PingPongTarget';
import { MRTRenderTarget } from '../gpgpu/MRTRenderTarget';
import { PassRunner } from '../gpgpu/PassRunner';
import { RenderTargets } from './targets/RenderTargets';
import { WaterPasses } from './passes/water/WaterPasses';
import { SedimentPasses } from './passes/sediment/SedimentPasses';
import { ThermalPasses } from './passes/thermal/ThermalPasses';
import { LavaPasses } from './passes/lava/LavaPasses';
import { PostPasses } from './passes/post/PostPasses';
import { TerrainReadbackService } from './io/TerrainReadbackService';

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
  private rainPassDebugCounter: number = 0; // Counter for throttled debug logging
  private heightmapSource: HeightmapSource | null = null; // Heightmap data and metadata
  private renderTargets: RenderTargets;
  private waterPasses: WaterPasses;
  private sedimentPasses: SedimentPasses;
  private thermalPasses: ThermalPasses;
  private lavaPasses: LavaPasses;
  private postPasses: PostPasses;

  // Passes are now managed by domain pass classes (WaterPasses, SedimentPasses, etc.)

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

    // Initialize render targets
    this.renderTargets = new RenderTargets(simres);

    // Create domain pass classes
    this.waterPasses = new WaterPasses(
      this.renderTargets,
      this.passRunner,
      this.fullscreenQuad,
      this.simres,
      this.renderer
    );
    this.sedimentPasses = new SedimentPasses(
      this.renderTargets,
      this.passRunner,
      this.fullscreenQuad,
      this.simres
    );
    this.thermalPasses = new ThermalPasses(
      this.renderTargets,
      this.passRunner,
      this.fullscreenQuad,
      this.simres
    );
    this.lavaPasses = new LavaPasses(
      this.renderTargets,
      this.passRunner,
      this.fullscreenQuad,
      this.simres,
      this.renderer
    );
    this.postPasses = new PostPasses(
      this.renderTargets,
      this.passRunner,
      this.fullscreenQuad
    );

    // Initialize terrain readback service
    this.terrainReadbackService = new TerrainReadbackService(
      simres,
      renderer,
      this.renderTargets.terrainPP
    );
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
    // Clear all ping-pong targets
    this.postPasses.clearAllTargets();

    // Generate initial terrain using TerrainReadbackService
    await this.terrainReadbackService.generateTerrain(controls, timer, heightmapSource, terrainRandom);
  }

  /**
   * Creates a render target with float format
   */

  /**
   * Executes one simulation step (equivalent to SimulatePerStep)
   * @param controls - Simulation controls/parameters
   * @param timer - Time value for shaders (optional, defaults to 0)
   * @param brushState - Brush state (mouse world pos/dir, brush pos, etc.) (optional)
   * @param waterSources - Water source arrays (optional)
   * @param lavaSources - Lava source arrays (optional)
   */
  public executeStep(
    controls: any,
    timer: number = 0,
    brushState?: {
      mouseWorldPos?: [number, number, number, number];
      mouseWorldDir?: [number, number, number];
      brushPos?: [number, number];
    },
    waterSources?: {
      count: number;
      positions: Float32Array;
      sizes: Float32Array;
      strengths: Float32Array;
    },
    lavaSources?: {
      count: number;
      positions: Float32Array;
      sizes: Float32Array;
      strengths: Float32Array;
    }
  ): void {
    // 0. Rain precipitation
    this.waterPasses.executeRain(controls, timer, brushState, waterSources);
    
    // 1. Flow (flux)
    this.waterPasses.executeFlow(controls);
    
    // 2. Water height/velocity
    this.waterPasses.executeWaterHeight(controls, timer);
    
    // 3. Sediment
    this.sedimentPasses.executeSediment(controls, timer);
    
    // 4. Sediment advection (conditional)
    if (controls.AdvectionMethod == 1) {
      this.sedimentPasses.executeMacCormackAdvection(controls);
    } else {
      this.sedimentPasses.executeSimpleAdvection(controls);
    }
    
    // 5. Max slippage
    this.thermalPasses.executeMaxSlippage(controls);
    
    // 6. Thermal terrain flux
    this.thermalPasses.executeThermalFlux(controls);
    
    // 7. Thermal apply
    this.thermalPasses.executeThermalApply(controls);
    
    // 8. Evaporation
    this.waterPasses.executeEvaporation(controls);
    
    // 9. Lava flow
    this.lavaPasses.executeLavaFlow(controls, timer, lavaSources);
    
    // 10. Lava update
    this.lavaPasses.executeLavaUpdate(controls, timer, brushState, lavaSources);
    
    // 11. Lava-terrain interaction
    this.lavaPasses.executeLavaTerrain(controls, lavaSources);
    
    // 12. Average smoothing
    this.sedimentPasses.executeAverage(controls);
  }

  // Old pass execution methods removed - now handled by domain pass classes
  // (WaterPasses, SedimentPasses, ThermalPasses, LavaPasses, PostPasses)
  
  /**
   * Gets texture accessors for external use (e.g., rendering, readback)
   */
  public getTerrainTexture(): THREE.Texture {
    return this.renderTargets.terrainPP.getReadTexture();
  }

  private executeFlowPass(controls: any): void {
    this.flowPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.flowPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
    this.flowPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.flowPass.setUniform('u_SimRes', this.simres);
    this.flowPass.setUniform('u_PipeLen', controls.pipelen);
    this.flowPass.setUniform('u_timestep', controls.timestep);
    this.flowPass.setUniform('u_PipeArea', controls.pipeAra);
    this.passRunner.executePingPongPass(this.flowPass, this.renderTargets.fluxPP);
  }

  private executeWaterHeightPass(controls: any, timer: number): void {
    // This is an MRT pass (2 outputs)
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 2);
    mrtTarget.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    
    this.waterHeightPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readVel', this.velocityPP.getReadTexture());
    this.waterHeightPass.setUniform('u_SimRes', this.simres);
    this.waterHeightPass.setUniform('u_PipeLen', controls.pipelen);
    this.waterHeightPass.setUniform('u_timestep', controls.timestep);
    this.waterHeightPass.setUniform('u_PipeArea', controls.pipeAra);
    this.waterHeightPass.setUniform('u_VelMult', controls.VelocityMultiplier || 1.0);
    this.waterHeightPass.setUniform('u_VelAdvMag', controls.VelocityAdvectionMag || 1.0);
    this.waterHeightPass.setUniform('u_Time', timer);
    
    this.passRunner.executeMRTPass(this.waterHeightPass, mrtTarget.getTargets());
    this.terrainPP.swap();
    this.velocityPP.swap();
  }

  private executeSedimentPass(controls: any, timer: number): void {
    // This is a 4-output MRT pass
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 4);
    mrtTarget.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.renderTargets.sedimentPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[2] = this.renderTargets.terrainNor.texture;
    mrtTarget.getTargets().texture[3] = this.velocityPP.getWriteTarget().texture;
    
    this.sedimentPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.sedimentPass.setInputTexture('readVelocity', this.velocityPP.getReadTexture());
    this.sedimentPass.setInputTexture('readSediment', this.renderTargets.sedimentPP.getReadTexture());
    this.sedimentPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
    this.sedimentPass.setUniform('u_SimRes', this.simres);
    this.sedimentPass.setUniform('u_PipeLen', controls.pipelen);
    this.sedimentPass.setUniform('Kc', controls.Kc);
    this.sedimentPass.setUniform('Ks', controls.Ks);
    this.sedimentPass.setUniform('Kd', controls.Kd);
    this.sedimentPass.setUniform('u_timestep', controls.timestep);
    this.sedimentPass.setUniform('u_Time', timer);
    
    this.passRunner.executeMRTPass(this.sedimentPass, mrtTarget.getTargets());
    this.terrainPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeMacCormackAdvection(controls: any): void {
    // Subpass 1
    const mrt1 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt1.getTargets().texture[0] = this.renderTargets.sedimentAdvectA.texture;
    mrt1.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt1.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt1.getTargets());
    
    // Subpass 2
    const mrt2 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt2.getTargets().texture[0] = this.renderTargets.sedimentAdvectB.texture;
    mrt2.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt2.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentAdvectA.texture);
    this.advectPass.setUniform('unif_advectMultiplier', -1);
    this.passRunner.executeMRTPass(this.advectPass, mrt2.getTargets());
    
    // Subpass 3: MacCormack
    this.macCormackPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.macCormackPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.macCormackPass.setInputTexture('sediadvecta', this.renderTargets.sedimentAdvectA.texture);
    this.macCormackPass.setInputTexture('sediadvectb', this.renderTargets.sedimentAdvectB.texture);
    this.macCormackPass.setUniform('u_SimRes', this.simres);
    this.macCormackPass.setUniform('u_PipeLen', controls.pipelen);
    this.macCormackPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeSinglePass(this.macCormackPass, this.renderTargets.sedimentPP.getWriteTarget());
    
    this.sedimentBlendPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeSimpleAdvection(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt.getTargets().texture[0] = this.renderTargets.sedimentPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.velocityPP.getWriteTarget().texture;
    mrt.getTargets().texture[2] = this.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt.getTargets());
    
    this.sedimentBlendPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.velocityPP.swap();
  }

  private executeMaxSlippagePass(controls: any): void {
    this.maxslippagePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.maxslippagePass.setUniform('u_SimRes', this.simres);
    this.maxslippagePass.setUniform('u_PipeLen', controls.pipelen);
    this.maxslippagePass.setUniform('u_timestep', controls.timestep);
    this.maxslippagePass.setUniform('u_PipeArea', controls.pipeAra);
    this.maxslippagePass.setUniform('unif_TalusScale', controls.thermalTalusAngleScale || 1.0);
    this.maxslippagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executePingPongPass(this.maxslippagePass, this.renderTargets.maxslippagePP);
  }

  private executeThermalFluxPass(controls: any): void {
    this.thermalFluxPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.thermalFluxPass.setInputTexture('readMaxSlippage', this.renderTargets.maxslippagePP.getReadTexture());
    this.thermalFluxPass.setUniform('u_SimRes', this.simres);
    this.thermalFluxPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalFluxPass.setUniform('u_timestep', controls.timestep);
    this.thermalFluxPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalFluxPass.setUniform('unif_thermalRate', controls.thermalRate || 0.5);
    this.passRunner.executePingPongPass(this.thermalFluxPass, this.renderTargets.terrainFluxPP);
  }

  private executeThermalApplyPass(controls: any): void {
    this.thermalApplyPass.setInputTexture('readTerrainFlux', this.renderTargets.terrainFluxPP.getReadTexture());
    this.thermalApplyPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.thermalApplyPass.setUniform('u_SimRes', this.simres);
    this.thermalApplyPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalApplyPass.setUniform('u_timestep', controls.timestep);
    this.thermalApplyPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalApplyPass.setUniform('unif_thermalErosionScale', controls.thermalErosionScale || 1.0);
    this.passRunner.executePingPongPass(this.thermalApplyPass, this.terrainPP);
  }

  private executeEvaporationPass(controls: any): void {
    this.evaporationPass.setInputTexture('terrain', this.terrainPP.getReadTexture());
    this.evaporationPass.setUniform('evapod', controls.EvaporationConstant);
    this.passRunner.executePingPongPass(this.evaporationPass, this.terrainPP);
  }

  private executeLavaFlowPass(controls: any, timer: number, lavaSources?: {
    count: number;
    positions: Float32Array;
    sizes: Float32Array;
    strengths: Float32Array;
  }): void {
    // Unbind textures to avoid feedback loops
    this.renderer.setRenderTarget(null);
    
    this.lavaFlowPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaFlowPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
    this.lavaFlowPass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
    this.lavaFlowPass.setUniform('u_SimRes', this.simres);
    this.lavaFlowPass.setUniform('u_PipeLen', controls.pipelen);
    this.lavaFlowPass.setUniform('u_timestep', controls.timestep);
    this.lavaFlowPass.setUniform('u_PipeArea', controls.pipeAra);
    this.lavaFlowPass.setUniform('u_Time', timer);
    
    // Lava physics constants
    this.lavaFlowPass.setUniform('u_LavaViscosityPreExp', controls.LavaViscosityPreExp || 1.0);
    this.lavaFlowPass.setUniform('u_LavaActivationEnergy', controls.LavaActivationEnergy || 1.0);
    this.lavaFlowPass.setUniform('u_LavaDensity', controls.LavaDensity || 2700.0);
    this.lavaFlowPass.setUniform('u_LavaGasConstant', 8.314); // Gas constant R = 8.314 J/(mol·K)
    this.lavaFlowPass.setUniform('u_LavaSolidificationTemp', controls.LavaSolidificationTemp || 800.0);
    this.lavaFlowPass.setUniform('u_LavaInitialTemp', controls.LavaInitialTemp || 1200.0);
    
    // Lava source arrays
    if (lavaSources) {
      this.lavaFlowPass.setUniform('u_LavaSourceCount', lavaSources.count);
      const maxSources = Math.min(lavaSources.count, 16);
      const positions = new Float32Array(maxSources * 2);
      const sizes = new Float32Array(maxSources);
      for (let i = 0; i < maxSources; i++) {
        positions[i * 2] = lavaSources.positions[i * 2] || 0;
        positions[i * 2 + 1] = lavaSources.positions[i * 2 + 1] || 0;
        sizes[i] = lavaSources.sizes[i] || 0;
      }
      this.lavaFlowPass.setUniform('u_LavaSourcePositions', positions);
      this.lavaFlowPass.setUniform('u_LavaSourceSizes', sizes);
    } else {
      this.lavaFlowPass.setUniform('u_LavaSourceCount', 0);
      this.lavaFlowPass.setUniform('u_LavaSourcePositions', new Float32Array(32));
      this.lavaFlowPass.setUniform('u_LavaSourceSizes', new Float32Array(16));
    }
    
    this.passRunner.executePingPongPass(this.lavaFlowPass, this.renderTargets.lavaFluxPP);
  }

  private executeLavaUpdatePass(
    controls: any,
    timer: number,
    brushState?: {
      mouseWorldPos?: [number, number, number, number];
      mouseWorldDir?: [number, number, number];
      brushPos?: [number, number];
    },
    lavaSources?: {
      count: number;
      positions: Float32Array;
      sizes: Float32Array;
      strengths: Float32Array;
    }
  ): void {
    this.lavaUpdatePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaUpdatePass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
    this.lavaUpdatePass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
    
    // Standard simulation uniforms
    this.lavaUpdatePass.setUniform('u_SimRes', this.simres);
    this.lavaUpdatePass.setUniform('u_PipeLen', controls.pipelen);
    this.lavaUpdatePass.setUniform('u_timestep', controls.timestep);
    this.lavaUpdatePass.setUniform('u_PipeArea', controls.pipeAra);
    this.lavaUpdatePass.setUniform('u_Time', timer);
    
    // Heat transfer constants
    this.lavaUpdatePass.setUniform('u_LavaAirHeatTransfer', controls.LavaAirHeatTransfer || 200.0);
    this.lavaUpdatePass.setUniform('u_LavaWaterHeatTransfer', controls.LavaWaterHeatTransfer || 2000.0);
    this.lavaUpdatePass.setUniform('u_LavaAmbientTemp', controls.LavaAmbientTemp || 20.0);
    this.lavaUpdatePass.setUniform('u_LavaWaterTemp', controls.LavaWaterTemp || 10.0);
    this.lavaUpdatePass.setUniform('u_LavaDensity', controls.LavaDensity || 2700.0);
    this.lavaUpdatePass.setUniform('u_LavaSpecificHeat', controls.LavaSpecificHeat || 1200.0);
    this.lavaUpdatePass.setUniform('u_LavaInitialTemp', controls.LavaInitialTemp || 1200.0);
    this.lavaUpdatePass.setUniform('u_LavaSolidificationTemp', controls.LavaSolidificationTemp || 800.0);
    
    // Lava source arrays
    if (lavaSources) {
      this.lavaUpdatePass.setUniform('u_LavaSourceCount', lavaSources.count);
      const maxSources = Math.min(lavaSources.count, 16);
      const positions = new Float32Array(maxSources * 2);
      const sizes = new Float32Array(maxSources);
      const strengths = new Float32Array(maxSources);
      for (let i = 0; i < maxSources; i++) {
        positions[i * 2] = lavaSources.positions[i * 2] || 0;
        positions[i * 2 + 1] = lavaSources.positions[i * 2 + 1] || 0;
        sizes[i] = lavaSources.sizes[i] || 0;
        strengths[i] = lavaSources.strengths[i] || 0;
      }
      this.lavaUpdatePass.setUniform('u_LavaSourcePositions', positions);
      this.lavaUpdatePass.setUniform('u_LavaSourceSizes', sizes);
      this.lavaUpdatePass.setUniform('u_LavaSourceStrengths', strengths);
    } else {
      this.lavaUpdatePass.setUniform('u_LavaSourceCount', 0);
      this.lavaUpdatePass.setUniform('u_LavaSourcePositions', new Float32Array(32));
      this.lavaUpdatePass.setUniform('u_LavaSourceSizes', new Float32Array(16));
      this.lavaUpdatePass.setUniform('u_LavaSourceStrengths', new Float32Array(16));
    }
    
    // Lava brush uniforms (brush type 7)
    if (brushState) {
      if (brushState.mouseWorldPos) {
        this.lavaUpdatePass.setUniform('u_MouseWorldPos', new THREE.Vector4(...brushState.mouseWorldPos));
      }
      if (brushState.mouseWorldDir) {
        this.lavaUpdatePass.setUniform('u_MouseWorldDir', new THREE.Vector3(...brushState.mouseWorldDir));
      }
      if (brushState.brushPos) {
        this.lavaUpdatePass.setUniform('u_BrushPos', new THREE.Vector2(...brushState.brushPos));
      }
    }
    this.lavaUpdatePass.setUniform('u_BrushSize', controls.brushSize || 0);
    this.lavaUpdatePass.setUniform('u_BrushStrength', controls.brushStrenth || 0);
    this.lavaUpdatePass.setUniform('u_BrushType', controls.brushType || 0);
    this.lavaUpdatePass.setUniform('u_BrushPressed', controls.brushPressed || 0);
    this.lavaUpdatePass.setUniform('u_BrushOperation', controls.brushOperation || 0);
    
    this.passRunner.executePingPongPass(this.lavaUpdatePass, this.renderTargets.lavaPP);
  }

  private executeLavaTerrainPass(controls: any, lavaSources?: {
    count: number;
    positions: Float32Array;
    sizes: Float32Array;
    strengths: Float32Array;
  }): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.renderTargets.lavaPP.getWriteTarget().texture;
    
    this.lavaTerrainPass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.lavaTerrainPass.setInputTexture('readLava', this.renderTargets.lavaPP.getReadTexture());
    this.lavaTerrainPass.setInputTexture('readLavaFlux', this.renderTargets.lavaFluxPP.getReadTexture());
    
    // Standard simulation uniforms
    this.lavaTerrainPass.setUniform('u_SimRes', this.simres);
    this.lavaTerrainPass.setUniform('u_timestep', controls.timestep);
    
    // Thermal erosion and solidification constants
    this.lavaTerrainPass.setUniform('u_LavaContactHeatTransfer', controls.LavaContactHeatTransfer || 200.0);
    this.lavaTerrainPass.setUniform('u_LavaMeltThreshold', controls.LavaMeltThreshold || 1000.0);
    this.lavaTerrainPass.setUniform('u_LavaLatentHeatFusion', controls.LavaLatentHeatFusion || 400000.0);
    this.lavaTerrainPass.setUniform('u_LavaSolidificationTemp', controls.LavaSolidificationTemp || 800.0);
    this.lavaTerrainPass.setUniform('u_LavaInitialTemp', controls.LavaInitialTemp || 1200.0);
    this.lavaTerrainPass.setUniform('u_LavaDensity', controls.LavaDensity || 2700.0);
    this.lavaTerrainPass.setUniform('u_LavaWaterTemp', controls.LavaWaterTemp || 10.0);
    
    // Lava source arrays
    if (lavaSources) {
      this.lavaTerrainPass.setUniform('u_LavaSourceCount', lavaSources.count);
      const maxSources = Math.min(lavaSources.count, 16);
      const positions = new Float32Array(maxSources * 2);
      const sizes = new Float32Array(maxSources);
      for (let i = 0; i < maxSources; i++) {
        positions[i * 2] = lavaSources.positions[i * 2] || 0;
        positions[i * 2 + 1] = lavaSources.positions[i * 2 + 1] || 0;
        sizes[i] = lavaSources.sizes[i] || 0;
      }
      this.lavaTerrainPass.setUniform('u_LavaSourcePositions', positions);
      this.lavaTerrainPass.setUniform('u_LavaSourceSizes', sizes);
    } else {
      this.lavaTerrainPass.setUniform('u_LavaSourceCount', 0);
      this.lavaTerrainPass.setUniform('u_LavaSourcePositions', new Float32Array(32));
      this.lavaTerrainPass.setUniform('u_LavaSourceSizes', new Float32Array(16));
    }
    
    this.passRunner.executeMRTPass(this.lavaTerrainPass, mrt.getTargets());
    this.terrainPP.swap();
    this.renderTargets.lavaPP.swap();
  }

  private executeAveragePass(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.renderTargets.terrainNor.texture;
    
    this.averagePass.setInputTexture('readTerrain', this.terrainPP.getReadTexture());
    this.averagePass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.averagePass.setUniform('u_SimRes', this.simres);
    this.averagePass.setUniform('unif_ErosionMode', controls.ErosionMode);
    this.averagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executeMRTPass(this.averagePass, mrt.getTargets());
    this.renderTargets.terrainPP.swap();
  }
  
  public getSimRes(): number {
    return this.simres;
  }

  public getLavaTexture(): THREE.Texture {
    return this.renderTargets.lavaPP.getReadTexture();
  }

  /**
   * Gets render target accessors for CPU readback
   */
  public getTerrainRenderTarget(): THREE.WebGLRenderTarget {
    return this.terrainPP.getReadTarget();
  }

  public getLavaRenderTarget(): THREE.WebGLRenderTarget {
    return this.renderTargets.lavaPP.getReadTarget();
  }

  /**
   * Gets the initial heightmap data (stored from terrain generation)
   * This avoids GPU readback issues with FloatType textures
   */
  public getInitialHeightmap(): Float32Array | null {
    return this.terrainReadbackService.getInitialHeightmap();
  }
  
  /**
   * Gets the THREE.Terrain generated mesh (for rendering)
   */
  public getTerrainMesh(): THREE.Mesh | null {
    return this.terrainReadbackService.getTerrainMesh();
  }
  
  public getHeightmapSource(): HeightmapSource | null {
    return this.terrainReadbackService.getHeightmapSource();
  }
  
  public getStoredHeightRange(): { min: number; max: number } {
    return this.terrainReadbackService.getStoredHeightRange();
  }

  public getSedimentTexture(): THREE.Texture {
    return this.renderTargets.sedimentPP.getReadTexture();
  }

  /**
   * Resizes all targets when simulation resolution changes
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
    this.passRunner.setSimRes(simres);
    
    // Resize all ping-pong targets
    this.renderTargets.terrainPP.setSize(simres, simres);
    this.renderTargets.fluxPP.setSize(simres, simres);
    this.renderTargets.velocityPP.setSize(simres, simres);
    this.renderTargets.sedimentPP.setSize(simres, simres);
    this.renderTargets.sedimentBlendPP.setSize(simres, simres);
    this.renderTargets.maxslippagePP.setSize(simres, simres);
    this.renderTargets.terrainFluxPP.setSize(simres, simres);
    this.renderTargets.lavaPP.setSize(simres, simres);
    this.renderTargets.lavaFluxPP.setSize(simres, simres);
    
    // Resize non-ping-pong targets
    this.renderTargets.terrainNor.setSize(simres, simres);
    this.renderTargets.sedimentAdvectA.setSize(simres, simres);
    this.renderTargets.sedimentAdvectB.setSize(simres, simres);
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    // Dispose all render targets (RenderTargets handles all targets)
    this.renderTargets.dispose();
    
    // Note: Domain pass classes (WaterPasses, SedimentPasses, etc.) manage their own pass disposal
    // If needed, add dispose methods to domain pass classes
  }
}
