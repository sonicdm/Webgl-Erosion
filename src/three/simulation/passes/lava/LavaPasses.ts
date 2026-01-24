import * as THREE from 'three';
import { GpgpuPass } from '../../../gpgpu/GpgpuPass';
import { PassRunner } from '../../../gpgpu/PassRunner';
import { MRTRenderTarget } from '../../../gpgpu/MRTRenderTarget';
import { RenderTargets } from '../../targets/RenderTargets';
import quadVert from '../../../../shaders/quad-vert.glsl?raw';
import lavaFlowFrag from '../../../../shaders/lava-flow-frag.glsl?raw';
import lavaUpdateFrag from '../../../../shaders/lava-update-frag.glsl?raw';
import lavaTerrainFrag from '../../../../shaders/lava-terrain-frag.glsl?raw';

/**
 * Lava simulation passes
 * Handles lava-flow, lava-update, and lava-terrain interaction passes
 */
export class LavaPasses {
  private lavaFlowPass: GpgpuPass;
  private lavaUpdatePass: GpgpuPass;
  private lavaTerrainPass: GpgpuPass;

  constructor(
    private renderTargets: RenderTargets,
    private passRunner: PassRunner,
    private fullscreenQuad: THREE.BufferGeometry,
    private simres: number,
    private renderer: THREE.WebGLRenderer
  ) {
    // Create all lava passes
    this.lavaFlowPass = new GpgpuPass(quadVert, lavaFlowFrag, fullscreenQuad);
    this.lavaUpdatePass = new GpgpuPass(quadVert, lavaUpdateFrag, fullscreenQuad);
    this.lavaTerrainPass = new GpgpuPass(quadVert, lavaTerrainFrag, fullscreenQuad);
  }

  /**
   * Executes the lava flow pass
   */
  public executeLavaFlow(
    controls: any,
    timer: number,
    lavaSources?: {
      count: number;
      positions: Float32Array;
      sizes: Float32Array;
      strengths: Float32Array;
    }
  ): void {
    // Unbind textures to avoid feedback loops
    this.renderer.setRenderTarget(null);
    
    this.lavaFlowPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
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

  /**
   * Executes the lava update pass
   */
  public executeLavaUpdate(
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
    this.lavaUpdatePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
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

  /**
   * Executes the lava-terrain interaction pass (2-output MRT)
   */
  public executeLavaTerrain(
    controls: any,
    lavaSources?: {
      count: number;
      positions: Float32Array;
      sizes: Float32Array;
      strengths: Float32Array;
    }
  ): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.renderTargets.lavaPP.getWriteTarget().texture;
    
    this.lavaTerrainPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
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
    this.renderTargets.terrainPP.swap();
    this.renderTargets.lavaPP.swap();
  }
}
