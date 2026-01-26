/**
 * Encapsulates all legacy WebGL framebuffers, renderbuffers, and textures.
 * Replaces module-level globals in texture-management. No simulation-state imports.
 * Built with { gl, simres, shadowMapResolution } at construction.
 */
export class LegacyTexturePool {
  private gl: WebGL2RenderingContext;
  private _simres: number;
  private readonly shadowMapResolution: number;

  // Framebuffers
  private _frame_buffer!: WebGLFramebuffer;
  private _shadowMap_frame_buffer!: WebGLFramebuffer;
  private _deferred_frame_buffer!: WebGLFramebuffer;

  // Renderbuffers
  private _render_buffer!: WebGLRenderbuffer;
  private _shadowMap_render_buffer!: WebGLRenderbuffer;
  private _deferred_render_buffer!: WebGLRenderbuffer;

  // Multi-renderpass textures
  private _shadowMap_tex!: WebGLTexture;
  private _scene_depth_tex!: WebGLTexture;
  private _bilateral_filter_horizontal_tex!: WebGLTexture;
  private _bilateral_filter_vertical_tex!: WebGLTexture;
  private _color_pass_tex!: WebGLTexture;
  private _color_pass_reflection_tex!: WebGLTexture;
  private _scatter_pass_tex!: WebGLTexture;

  // Simulation textures
  private _read_terrain_tex!: WebGLTexture;
  private _write_terrain_tex!: WebGLTexture;
  private _read_flux_tex!: WebGLTexture;
  private _write_flux_tex!: WebGLTexture;
  private _read_terrain_flux_tex!: WebGLTexture;
  private _write_terrain_flux_tex!: WebGLTexture;
  private _read_maxslippage_tex!: WebGLTexture;
  private _write_maxslippage_tex!: WebGLTexture;
  private _read_vel_tex!: WebGLTexture;
  private _write_vel_tex!: WebGLTexture;
  private _read_sediment_tex!: WebGLTexture;
  private _write_sediment_tex!: WebGLTexture;
  private _terrain_nor!: WebGLTexture;
  private _read_sediment_blend!: WebGLTexture;
  private _write_sediment_blend!: WebGLTexture;
  private _sediment_advect_a!: WebGLTexture;
  private _sediment_advect_b!: WebGLTexture;
  private _read_lava_tex!: WebGLTexture;
  private _write_lava_tex!: WebGLTexture;
  private _read_lava_flux_tex!: WebGLTexture;
  private _write_lava_flux_tex!: WebGLTexture;

  private _heightmap_tex: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext, simres: number, shadowMapResolution: number) {
    this.gl = gl;
    this._simres = simres;
    this.shadowMapResolution = shadowMapResolution;
    this.setup();
  }

  get simres(): number {
    return this._simres;
  }

  getShadowMapResolution(): number {
    return this.shadowMapResolution;
  }

  private createTexture(w: number, h: number, samplingType: number): WebGLTexture {
    const tex = this.gl.createTexture()!;
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, w, h, 0, this.gl.RGBA, this.gl.FLOAT, null);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, samplingType);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, samplingType);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createScreenTexture(w: number, h: number, samplingType: number): WebGLTexture {
    return this.createTexture(w, h, samplingType);
  }

  private recreateTexture(w: number, h: number, samplingType: number, tex: WebGLTexture): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, w, h, 0, this.gl.RGBA, this.gl.FLOAT, null);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, samplingType);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, samplingType);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  }

  setup(simres?: number): void {
    const s = simres ?? this._simres;
    if (simres != null) this._simres = s;
    const smp = this.gl.LINEAR;

    this._read_terrain_tex = this.createTexture(s, s, smp);
    this._write_terrain_tex = this.createTexture(s, s, smp);
    this._read_flux_tex = this.createTexture(s, s, smp);
    this._write_flux_tex = this.createTexture(s, s, smp);
    this._read_terrain_flux_tex = this.createTexture(s, s, smp);
    this._write_terrain_flux_tex = this.createTexture(s, s, smp);
    this._read_maxslippage_tex = this.createTexture(s, s, smp);
    this._write_maxslippage_tex = this.createTexture(s, s, smp);
    this._read_vel_tex = this.createTexture(s, s, smp);
    this._write_vel_tex = this.createTexture(s, s, smp);
    this._read_sediment_tex = this.createTexture(s, s, smp);
    this._write_sediment_tex = this.createTexture(s, s, smp);
    this._terrain_nor = this.createTexture(s, s, smp);
    this._read_sediment_blend = this.createTexture(s, s, smp);
    this._write_sediment_blend = this.createTexture(s, s, smp);
    this._sediment_advect_a = this.createTexture(s, s, smp);
    this._sediment_advect_b = this.createTexture(s, s, smp);
    this._read_lava_tex = this.createTexture(s, s, smp);
    this._write_lava_tex = this.createTexture(s, s, smp);
    this._read_lava_flux_tex = this.createTexture(s, s, smp);
    this._write_lava_flux_tex = this.createTexture(s, s, smp);

    const sh = this.shadowMapResolution;
    this._shadowMap_tex = this.createScreenTexture(sh, sh, this.gl.LINEAR);
    this._scene_depth_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
    this._bilateral_filter_horizontal_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
    this._bilateral_filter_vertical_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
    this._color_pass_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
    this._color_pass_reflection_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
    this._scatter_pass_tex = this.createScreenTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);

    this._shadowMap_frame_buffer = this.gl.createFramebuffer()!;
    this._shadowMap_render_buffer = this.gl.createRenderbuffer()!;
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this._shadowMap_render_buffer);
    this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, sh, sh);

    this._deferred_frame_buffer = this.gl.createFramebuffer()!;
    this._deferred_render_buffer = this.gl.createRenderbuffer()!;
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this._deferred_render_buffer);
    this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, window.innerWidth, window.innerHeight);

    this._frame_buffer = this.gl.createFramebuffer()!;
    this._render_buffer = this.gl.createRenderbuffer()!;
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this._render_buffer);
    this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, s, s);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
  }

  resizeTextures4Simulation(newSimres?: number): void {
    const s = newSimres ?? this._simres;
    if (newSimres != null) this._simres = newSimres;
    const smp = this.gl.LINEAR;

    this.recreateTexture(s, s, smp, this._read_terrain_tex);
    this.recreateTexture(s, s, smp, this._write_terrain_tex);
    this.recreateTexture(s, s, smp, this._read_flux_tex);
    this.recreateTexture(s, s, smp, this._write_flux_tex);
    this.recreateTexture(s, s, smp, this._read_terrain_flux_tex);
    this.recreateTexture(s, s, smp, this._write_terrain_flux_tex);
    this.recreateTexture(s, s, smp, this._read_maxslippage_tex);
    this.recreateTexture(s, s, smp, this._write_maxslippage_tex);
    this.recreateTexture(s, s, smp, this._read_vel_tex);
    this.recreateTexture(s, s, smp, this._write_vel_tex);
    this.recreateTexture(s, s, smp, this._read_sediment_tex);
    this.recreateTexture(s, s, smp, this._write_sediment_tex);
    this.recreateTexture(s, s, smp, this._terrain_nor);
    this.recreateTexture(s, s, smp, this._read_sediment_blend);
    this.recreateTexture(s, s, smp, this._write_sediment_blend);
    this.recreateTexture(s, s, smp, this._sediment_advect_a);
    this.recreateTexture(s, s, smp, this._sediment_advect_b);
    this.recreateTexture(s, s, smp, this._read_lava_tex);
    this.recreateTexture(s, s, smp, this._write_lava_tex);
    this.recreateTexture(s, s, smp, this._read_lava_flux_tex);
    this.recreateTexture(s, s, smp, this._write_lava_flux_tex);

    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this._render_buffer);
    this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, s, s);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
  }

  resizeScreenTextures(): void {
    const gl = this.gl;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const resizeTex = (tex: WebGLTexture) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    resizeTex(this._color_pass_reflection_tex);
    resizeTex(this._scatter_pass_tex);
    resizeTex(this._color_pass_tex);
    resizeTex(this._bilateral_filter_vertical_tex);
    resizeTex(this._bilateral_filter_horizontal_tex);
    resizeTex(this._scene_depth_tex);

    gl.bindRenderbuffer(gl.RENDERBUFFER, this._deferred_render_buffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  }

  setHeightMapTexture(tex: WebGLTexture | null): void {
    this._heightmap_tex = tex;
  }

  getHeightMapTexture(): WebGLTexture | null {
    return this._heightmap_tex;
  }

  getFrameBuffer(): WebGLFramebuffer { return this._frame_buffer; }
  getRenderBuffer(): WebGLRenderbuffer { return this._render_buffer; }
  getShadowMapFrameBuffer(): WebGLFramebuffer { return this._shadowMap_frame_buffer; }
  getShadowMapRenderBuffer(): WebGLRenderbuffer { return this._shadowMap_render_buffer; }
  getDeferredFrameBuffer(): WebGLFramebuffer { return this._deferred_frame_buffer; }
  getDeferredRenderBuffer(): WebGLRenderbuffer { return this._deferred_render_buffer; }

  getReadTerrainTex(): WebGLTexture { return this._read_terrain_tex; }
  getWriteTerrainTex(): WebGLTexture { return this._write_terrain_tex; }
  getReadFluxTex(): WebGLTexture { return this._read_flux_tex; }
  getWriteFluxTex(): WebGLTexture { return this._write_flux_tex; }
  getReadTerrainFluxTex(): WebGLTexture { return this._read_terrain_flux_tex; }
  getWriteTerrainFluxTex(): WebGLTexture { return this._write_terrain_flux_tex; }
  getReadMaxslippageTex(): WebGLTexture { return this._read_maxslippage_tex; }
  getWriteMaxslippageTex(): WebGLTexture { return this._write_maxslippage_tex; }
  getReadVelTex(): WebGLTexture { return this._read_vel_tex; }
  getWriteVelTex(): WebGLTexture { return this._write_vel_tex; }
  getReadSedimentTex(): WebGLTexture { return this._read_sediment_tex; }
  getWriteSedimentTex(): WebGLTexture { return this._write_sediment_tex; }
  getTerrainNor(): WebGLTexture { return this._terrain_nor; }
  getReadSedimentBlend(): WebGLTexture { return this._read_sediment_blend; }
  getWriteSedimentBlend(): WebGLTexture { return this._write_sediment_blend; }
  getSedimentAdvectA(): WebGLTexture { return this._sediment_advect_a; }
  getSedimentAdvectB(): WebGLTexture { return this._sediment_advect_b; }
  getReadLavaTex(): WebGLTexture { return this._read_lava_tex; }
  getWriteLavaTex(): WebGLTexture { return this._write_lava_tex; }
  getReadLavaFluxTex(): WebGLTexture { return this._read_lava_flux_tex; }
  getWriteLavaFluxTex(): WebGLTexture { return this._write_lava_flux_tex; }

  getShadowMapTex(): WebGLTexture { return this._shadowMap_tex; }
  getSceneDepthTex(): WebGLTexture { return this._scene_depth_tex; }
  getBilateralFilterHorizontalTex(): WebGLTexture { return this._bilateral_filter_horizontal_tex; }
  getBilateralFilterVerticalTex(): WebGLTexture { return this._bilateral_filter_vertical_tex; }
  getColorPassTex(): WebGLTexture { return this._color_pass_tex; }
  getColorPassReflectionTex(): WebGLTexture { return this._color_pass_reflection_tex; }
  getScatterPassTex(): WebGLTexture { return this._scatter_pass_tex; }

  swapTerrainTextures(): void {
    const t = this._read_terrain_tex;
    this._read_terrain_tex = this._write_terrain_tex;
    this._write_terrain_tex = t;
  }
  swapFluxTextures(): void {
    const t = this._read_flux_tex;
    this._read_flux_tex = this._write_flux_tex;
    this._write_flux_tex = t;
  }
  swapVelTextures(): void {
    const t = this._read_vel_tex;
    this._read_vel_tex = this._write_vel_tex;
    this._write_vel_tex = t;
  }
  swapSedimentTextures(): void {
    const t = this._read_sediment_tex;
    this._read_sediment_tex = this._write_sediment_tex;
    this._write_sediment_tex = t;
  }
  swapSedimentBlendTextures(): void {
    const t = this._read_sediment_blend;
    this._read_sediment_blend = this._write_sediment_blend;
    this._write_sediment_blend = t;
  }
  swapMaxSlippageTextures(): void {
    const t = this._read_maxslippage_tex;
    this._read_maxslippage_tex = this._write_maxslippage_tex;
    this._write_maxslippage_tex = t;
  }
  swapTerrainFluxTextures(): void {
    const t = this._read_terrain_flux_tex;
    this._read_terrain_flux_tex = this._write_terrain_flux_tex;
    this._write_terrain_flux_tex = t;
  }
  swapBilateralFilterTextures(): void {
    const t = this._bilateral_filter_horizontal_tex;
    this._bilateral_filter_horizontal_tex = this._bilateral_filter_vertical_tex;
    this._bilateral_filter_vertical_tex = t;
  }
  swapLavaTextures(): void {
    const t = this._read_lava_tex;
    this._read_lava_tex = this._write_lava_tex;
    this._write_lava_tex = t;
  }
  swapLavaFluxTextures(): void {
    const t = this._read_lava_flux_tex;
    this._read_lava_flux_tex = this._write_lava_flux_tex;
    this._write_lava_flux_tex = t;
  }
}
