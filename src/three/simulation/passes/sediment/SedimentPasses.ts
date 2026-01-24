import * as THREE from 'three';
import { GpgpuPass } from '../../../gpgpu/GpgpuPass';
import { PassRunner } from '../../../gpgpu/PassRunner';
import { MRTRenderTarget } from '../../../gpgpu/MRTRenderTarget';
import { RenderTargets } from '../../targets/RenderTargets';
import quadVert from '../../../../shaders/quad-vert.glsl?raw';
import sedimentFrag from '../../../../shaders/sediment-frag.glsl?raw';
import sediadvectFrag from '../../../../shaders/sediadvect-frag.glsl?raw';
import maccormackFrag from '../../../../shaders/maccormack-frag.glsl?raw';
import averageFrag from '../../../../shaders/average-frag.glsl?raw';

/**
 * Sediment simulation passes
 * Handles sediment, advection (MacCormack and simple), and average smoothing passes
 */
export class SedimentPasses {
  private sedimentPass: GpgpuPass;
  private advectPass: GpgpuPass;
  private macCormackPass: GpgpuPass;
  private averagePass: GpgpuPass;

  constructor(
    private renderTargets: RenderTargets,
    private passRunner: PassRunner,
    private fullscreenQuad: THREE.BufferGeometry,
    private simres: number
  ) {
    // Create all sediment passes
    this.sedimentPass = new GpgpuPass(quadVert, sedimentFrag, fullscreenQuad);
    this.advectPass = new GpgpuPass(quadVert, sediadvectFrag, fullscreenQuad);
    this.macCormackPass = new GpgpuPass(quadVert, maccormackFrag, fullscreenQuad);
    this.averagePass = new GpgpuPass(quadVert, averageFrag, fullscreenQuad);
  }

  /**
   * Executes the sediment pass (4-output MRT)
   */
  public executeSediment(controls: any, timer: number): void {
    // This is a 4-output MRT pass
    const mrtTarget = new MRTRenderTarget(this.simres, this.simres, 4);
    mrtTarget.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[1] = this.renderTargets.sedimentPP.getWriteTarget().texture;
    mrtTarget.getTargets().texture[2] = this.renderTargets.terrainNor.texture;
    mrtTarget.getTargets().texture[3] = this.renderTargets.velocityPP.getWriteTarget().texture;
    
    this.sedimentPass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.sedimentPass.setInputTexture('readVelocity', this.renderTargets.velocityPP.getReadTexture());
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
    this.renderTargets.terrainPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.renderTargets.velocityPP.swap();
  }

  /**
   * Executes MacCormack advection (3 subpasses)
   */
  public executeMacCormackAdvection(controls: any): void {
    // Subpass 1
    const mrt1 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt1.getTargets().texture[0] = this.renderTargets.sedimentAdvectA.texture;
    mrt1.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
    mrt1.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.renderTargets.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt1.getTargets());
    
    // Subpass 2
    const mrt2 = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt2.getTargets().texture[0] = this.renderTargets.sedimentAdvectB.texture;
    mrt2.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
    mrt2.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentAdvectA.texture);
    this.advectPass.setUniform('unif_advectMultiplier', -1);
    this.passRunner.executeMRTPass(this.advectPass, mrt2.getTargets());
    
    // Subpass 3: MacCormack
    this.macCormackPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
    this.macCormackPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.macCormackPass.setInputTexture('sediadvecta', this.renderTargets.sedimentAdvectA.texture);
    this.macCormackPass.setInputTexture('sediadvectb', this.renderTargets.sedimentAdvectB.texture);
    this.macCormackPass.setUniform('u_SimRes', this.simres);
    this.macCormackPass.setUniform('u_PipeLen', controls.pipelen);
    this.macCormackPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeSinglePass(this.macCormackPass, this.renderTargets.sedimentPP.getWriteTarget());
    
    this.renderTargets.sedimentBlendPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.renderTargets.velocityPP.swap();
  }

  /**
   * Executes simple advection (single MRT pass)
   */
  public executeSimpleAdvection(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 3);
    mrt.getTargets().texture[0] = this.renderTargets.sedimentPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.renderTargets.velocityPP.getWriteTarget().texture;
    mrt.getTargets().texture[2] = this.renderTargets.sedimentBlendPP.getWriteTarget().texture;
    
    this.advectPass.setInputTexture('vel', this.renderTargets.velocityPP.getReadTexture());
    this.advectPass.setInputTexture('sedi', this.renderTargets.sedimentPP.getReadTexture());
    this.advectPass.setInputTexture('sediBlend', this.renderTargets.sedimentBlendPP.getReadTexture());
    this.advectPass.setInputTexture('terrain', this.renderTargets.terrainPP.getReadTexture());
    this.advectPass.setUniform('unif_advectMultiplier', 1);
    this.advectPass.setUniform('u_SimRes', this.simres);
    this.advectPass.setUniform('u_PipeLen', controls.pipelen);
    this.advectPass.setUniform('u_timestep', controls.timestep);
    this.passRunner.executeMRTPass(this.advectPass, mrt.getTargets());
    
    this.renderTargets.sedimentBlendPP.swap();
    this.renderTargets.sedimentPP.swap();
    this.renderTargets.velocityPP.swap();
  }

  /**
   * Executes the average smoothing pass (2-output MRT)
   */
  public executeAverage(controls: any): void {
    const mrt = new MRTRenderTarget(this.simres, this.simres, 2);
    mrt.getTargets().texture[0] = this.renderTargets.terrainPP.getWriteTarget().texture;
    mrt.getTargets().texture[1] = this.renderTargets.terrainNor.texture;
    
    this.averagePass.setInputTexture('readTerrain', this.renderTargets.terrainPP.getReadTexture());
    this.averagePass.setInputTexture('readSedi', this.renderTargets.sedimentPP.getReadTexture());
    this.averagePass.setUniform('u_SimRes', this.simres);
    this.averagePass.setUniform('unif_ErosionMode', controls.ErosionMode);
    this.averagePass.setUniform('unif_rainMode', controls.RainErosion ? 1 : 0);
    this.passRunner.executeMRTPass(this.averagePass, mrt.getTargets());
    this.renderTargets.terrainPP.swap();
  }
}
