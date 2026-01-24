import * as THREE from 'three';
import { GpgpuPass, PassRunner } from '../../../gpgpu';
import { RenderTargets } from '../../targets/RenderTargets';
import { shaderManifest } from '../../../../shaders/manifest';
import { SimulationParams } from '../../../../app/dto/SimulationParams';

/**
 * Thermal erosion simulation passes
 * Handles max-slippage, thermal-flux, and thermal-apply passes
 */
export class ThermalPasses {
  private maxslippagePass: GpgpuPass;
  private thermalFluxPass: GpgpuPass;
  private thermalApplyPass: GpgpuPass;

  constructor(
    private renderTargets: RenderTargets,
    private passRunner: PassRunner,
    private fullscreenQuad: THREE.BufferGeometry,
    private simres: number
  ) {
    // Create all thermal passes using ShaderManifest
    const maxSlippageHeightShader = shaderManifest.getShaderSource('maxSlippageHeight');
    const thermalFluxShader = shaderManifest.getShaderSource('thermalFlux');
    const thermalApplyShader = shaderManifest.getShaderSource('thermalApply');
    
    this.maxslippagePass = new GpgpuPass(maxSlippageHeightShader.vert!, maxSlippageHeightShader.frag!, fullscreenQuad);
    this.thermalFluxPass = new GpgpuPass(thermalFluxShader.vert!, thermalFluxShader.frag!, fullscreenQuad);
    this.thermalApplyPass = new GpgpuPass(thermalApplyShader.vert!, thermalApplyShader.frag!, fullscreenQuad);
  }

  /**
   * Executes the max slippage pass
   */
  public executeMaxSlippage(controls: SimulationParams): void {
    this.maxslippagePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.maxslippagePass.setUniform('u_SimRes', this.simres);
    this.maxslippagePass.setUniform('u_PipeLen', controls.pipelen);
    this.maxslippagePass.setUniform('u_timestep', controls.timestep);
    this.maxslippagePass.setUniform('u_PipeArea', controls.pipeAra);
    this.maxslippagePass.setUniform('unif_TalusScale', controls.thermalTalusAngleScale || 1.0);
    this.maxslippagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executePingPongPass(this.maxslippagePass, this.renderTargets.maxslippagePP);
  }

  /**
   * Executes the thermal flux pass
   */
  public executeThermalFlux(controls: SimulationParams): void {
    this.thermalFluxPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.thermalFluxPass.setInputTexture('readMaxSlippage', this.renderTargets.maxslippagePP.getReadTexture());
    this.thermalFluxPass.setUniform('u_SimRes', this.simres);
    this.thermalFluxPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalFluxPass.setUniform('u_timestep', controls.timestep);
    this.thermalFluxPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalFluxPass.setUniform('unif_thermalRate', controls.thermalRate || 0.5);
    this.passRunner.executePingPongPass(this.thermalFluxPass, this.renderTargets.terrainFluxPP);
  }

  /**
   * Executes the thermal apply pass
   */
  public executeThermalApply(controls: SimulationParams): void {
    this.thermalApplyPass.setInputTexture('readTerrainFlux', this.renderTargets.terrainFluxPP.getReadTexture());
    this.thermalApplyPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.thermalApplyPass.setUniform('u_SimRes', this.simres);
    this.thermalApplyPass.setUniform('u_PipeLen', controls.pipelen);
    this.thermalApplyPass.setUniform('u_timestep', controls.timestep);
    this.thermalApplyPass.setUniform('u_PipeArea', controls.pipeAra);
    this.thermalApplyPass.setUniform('unif_thermalErosionScale', controls.thermalErosionScale || 1.0);
    this.passRunner.executePingPongPass(this.thermalApplyPass, this.renderTargets.terrainPP);
  }
}
