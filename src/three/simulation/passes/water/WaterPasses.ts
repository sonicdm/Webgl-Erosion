import * as THREE from 'three';
import { GpgpuPass, PassRunner } from '../../../gpgpu';
import { MRTRenderTarget } from '../../../gpgpu/MRTRenderTarget';
import { RenderTargets } from '../../targets/RenderTargets';
import { shaderManifest } from '../../../../shaders/manifest';
import { SimulationParams } from '../../../../app/dto/SimulationParams';

/**
 * Water simulation passes
 * Handles rain, flow, water-height, and evaporation passes
 */
export class WaterPasses {
  private rainPass: GpgpuPass;
  private flowPass: GpgpuPass;
  private waterHeightPass: GpgpuPass;
  private evaporationPass: GpgpuPass;

  constructor(
    private renderTargets: RenderTargets,
    private passRunner: PassRunner,
    private fullscreenQuad: THREE.BufferGeometry,
    private simres: number,
    private renderer: THREE.WebGLRenderer
  ) {
    // Create all water passes using ShaderManifest
    const rainShader = shaderManifest.getShaderSource('rain');
    const flowShader = shaderManifest.getShaderSource('flow');
    const waterHeightShader = shaderManifest.getShaderSource('waterHeight');
    const evaporationShader = shaderManifest.getShaderSource('evaporation');
    
    this.rainPass = new GpgpuPass(rainShader.vert!, rainShader.frag!, fullscreenQuad);
    this.flowPass = new GpgpuPass(flowShader.vert!, flowShader.frag!, fullscreenQuad);
    this.waterHeightPass = new GpgpuPass(waterHeightShader.vert!, waterHeightShader.frag!, fullscreenQuad);
    this.evaporationPass = new GpgpuPass(evaporationShader.vert!, evaporationShader.frag!, fullscreenQuad);
  }

  /**
   * Executes the rain pass
   */
  public executeRain(
    controls: SimulationParams,
    timer: number,
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
    }
  ): void {
    this.rainPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    
    // Standard simulation uniforms
    this.rainPass.setUniform('raindeg', controls.RainDegree);
    this.rainPass.setUniform('u_SimRes', this.simres);
    this.rainPass.setUniform('u_Time', timer);
    
    // Brush uniforms
    // Only set brushPos if it's valid (not the invalid default [-10, -10])
    let finalBrushPos: THREE.Vector2;
    if (brushState && brushState.brushPos) {
      const [brushPosX, brushPosY] = brushState.brushPos;
      // Only set if brushPos is valid (within [0, 1] range)
      if (brushPosX >= 0 && brushPosX <= 1 && brushPosY >= 0 && brushPosY <= 1) {
        finalBrushPos = new THREE.Vector2(brushPosX, brushPosY);
        this.rainPass.setUniform('u_BrushPos', finalBrushPos);
      } else {
        // Invalid brushPos - set to invalid value that shader will ignore
        finalBrushPos = new THREE.Vector2(-10.0, -10.0);
        this.rainPass.setUniform('u_BrushPos', finalBrushPos);
      }
      if (brushState.mouseWorldPos) {
        this.rainPass.setUniform('u_MouseWorldPos', new THREE.Vector4(...brushState.mouseWorldPos));
      }
      if (brushState.mouseWorldDir) {
        this.rainPass.setUniform('u_MouseWorldDir', new THREE.Vector3(...brushState.mouseWorldDir));
      }
    } else {
      // No brushState or no brushPos - set to invalid value
      finalBrushPos = new THREE.Vector2(-10.0, -10.0);
      this.rainPass.setUniform('u_BrushPos', finalBrushPos);
    }
    this.rainPass.setUniform('u_BrushSize', controls.brushSize || 0);
    this.rainPass.setUniform('u_BrushStrength', controls.brushStrenth || 0);
    this.rainPass.setUniform('u_BrushType', controls.brushType || 0);
    this.rainPass.setUniform('u_BrushPressed', controls.brushPressed || 0);
    this.rainPass.setUniform('u_BrushOperation', controls.brushOperation || 0);
    
    // Brush-specific uniforms
    this.rainPass.setUniform('u_FlattenTargetHeight', controls.flattenTargetHeight || 0);
    if (controls.slopeStartPos) {
      this.rainPass.setUniform('u_SlopeStartPos', new THREE.Vector2(controls.slopeStartPos[0] || 0, controls.slopeStartPos[1] || 0));
    } else {
      this.rainPass.setUniform('u_SlopeStartPos', new THREE.Vector2(0, 0));
    }
    if (controls.slopeEndPos) {
      this.rainPass.setUniform('u_SlopeEndPos', new THREE.Vector2(controls.slopeEndPos[0] || 0, controls.slopeEndPos[1] || 0));
    } else {
      this.rainPass.setUniform('u_SlopeEndPos', new THREE.Vector2(0, 0));
    }
    this.rainPass.setUniform('u_SlopeActive', controls.slopeActive || 0);
    
    // Rain erosion uniforms
    this.rainPass.setUniform('u_RainErosion', controls.RainErosion ? 1 : 0);
    this.rainPass.setUniform('u_RainErosionStrength', controls.RainErosionStrength || 1.0);
    this.rainPass.setUniform('u_RainErosionDropSize', controls.RainErosionDropSize || 1.0);
    
    // Water source arrays
    if (waterSources) {
      this.rainPass.setUniform('u_SourceCount', waterSources.count);
      // Set source arrays (max 16 sources)
      const maxSources = Math.min(waterSources.count, 16);
      const positions = new Float32Array(maxSources * 2);
      const sizes = new Float32Array(maxSources);
      const strengths = new Float32Array(maxSources);
      for (let i = 0; i < maxSources; i++) {
        positions[i * 2] = waterSources.positions[i * 2] || 0;
        positions[i * 2 + 1] = waterSources.positions[i * 2 + 1] || 0;
        sizes[i] = waterSources.sizes[i] || 0;
        strengths[i] = waterSources.strengths[i] || 0;
      }
      this.rainPass.setUniform('u_SourcePositions', positions);
      this.rainPass.setUniform('u_SourceSizes', sizes);
      this.rainPass.setUniform('u_SourceStrengths', strengths);
    } else {
      this.rainPass.setUniform('u_SourceCount', 0);
      this.rainPass.setUniform('u_SourcePositions', new Float32Array(32)); // 16 * 2
      this.rainPass.setUniform('u_SourceSizes', new Float32Array(16));
      this.rainPass.setUniform('u_SourceStrengths', new Float32Array(16));
    }
    
    this.passRunner.executePingPongPass(this.rainPass, this.renderTargets.terrainPP);
  }

  /**
   * Executes the flow pass
   */
  public executeFlow(controls: SimulationParams): void {
    this.flowPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.flowPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
    this.flowPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.flowPass.setUniform('u_SimRes', this.simres);
    this.flowPass.setUniform('u_PipeLen', controls.pipelen);
    this.flowPass.setUniform('u_timestep', controls.timestep);
    this.flowPass.setUniform('u_PipeArea', controls.pipeAra);
    this.passRunner.executePingPongPass(this.flowPass, this.renderTargets.fluxPP);
  }

  /**
   * Executes the water height pass (MRT pass with 2 outputs)
   */
  public executeWaterHeight(controls: SimulationParams, timer: number): void {
    // This is an MRT pass (2 outputs)
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 2);
    mrtTarget.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
    
    this.waterHeightPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readFlux', this.renderTargets.fluxPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.waterHeightPass.setInputTexture('readVel', this.renderTargets.velocityPP.getReadTexture());
    this.waterHeightPass.setUniform('u_SimRes', this.simres);
    this.waterHeightPass.setUniform('u_PipeLen', controls.pipelen);
    this.waterHeightPass.setUniform('u_timestep', controls.timestep);
    this.waterHeightPass.setUniform('u_PipeArea', controls.pipeAra);
    this.waterHeightPass.setUniform('u_VelMult', controls.VelocityMultiplier || 1.0);
    this.waterHeightPass.setUniform('u_VelAdvMag', controls.VelocityAdvectionMag || 1.0);
    this.waterHeightPass.setUniform('u_Time', timer);
    
    this.passRunner.executeMRTPass(this.waterHeightPass, mrtTarget.getTargets());
    this.renderTargets.terrainPP.swap();
    this.renderTargets.velocityPP.swap();
  }

  /**
   * Executes the evaporation pass
   * evapod is the evaporation factor: 1.0 - evaporation rate
   * The shader computes: eva = 1.0 - evapod, then multiplies water by eva
   */
  public executeEvaporation(controls: SimulationParams): void {
    this.evaporationPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
    // evapod = 1.0 - evaporation rate (EvaporationConstant is the rate, 0-1)
    const evapod = 1.0 - (controls.EvaporationConstant || 0.003);
    this.evaporationPass.setUniform('evapod', evapod);
    this.passRunner.executePingPongPass(this.evaporationPass, this.renderTargets.terrainPP);
  }
}
