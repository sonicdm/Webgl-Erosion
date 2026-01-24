import * as THREE from 'three';
import { GpgpuPass, PassRunner } from '../../../gpgpu';
import { RenderTargets } from '../../targets/RenderTargets';
import { shaderManifest } from '../../../../shaders/manifest';

/**
 * Post-processing passes
 * Handles clean pass for clearing render targets
 */
export class PostPasses {
  private cleanPass: GpgpuPass;

  constructor(
    private renderTargets: RenderTargets,
    private passRunner: PassRunner,
    private fullscreenQuad: THREE.BufferGeometry
  ) {
    // Create post passes using ShaderManifest
    const cleanShader = shaderManifest.getShaderSource('clean');
    this.cleanPass = new GpgpuPass(cleanShader.vert!, cleanShader.frag!, fullscreenQuad);
  }

  /**
   * Clears all render targets
   */
  public clearAllTargets(): void {
    // Clear all ping-pong targets
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.fluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.fluxPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.velocityPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.velocityPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentBlendPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentBlendPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.maxslippagePP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.maxslippagePP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainFluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainFluxPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaPP.getWriteTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaFluxPP.getReadTarget());
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.lavaFluxPP.getWriteTarget());

    // Clear non-ping-pong textures
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.terrainNor);
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentAdvectA);
    this.passRunner.executeSinglePass(this.cleanPass, this.renderTargets.sedimentAdvectB);
  }
}
