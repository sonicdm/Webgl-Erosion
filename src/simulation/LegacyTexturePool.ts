/**
 * Encapsulates all WebGL texture/framebuffer/renderbuffer management.
 * This replaces the module-level singletons in texture-management.ts.
 * 
 * All textures and framebuffers are owned by this instance and managed through
 * dependency injection rather than global module state.
 */
export class LegacyTexturePool {
    private gl: WebGL2RenderingContext;
    private simres: number;
    private shadowMapResolution: number;

    // Frame buffers
    public frame_buffer: WebGLFramebuffer;
    public shadowMap_frame_buffer: WebGLFramebuffer;
    public deferred_frame_buffer: WebGLFramebuffer;

    // Render buffers
    public render_buffer: WebGLRenderbuffer;
    public shadowMap_render_buffer: WebGLRenderbuffer;
    public deferred_render_buffer: WebGLRenderbuffer;

    // Multi-renderpass textures
    public shadowMap_tex: WebGLTexture;
    public scene_depth_tex: WebGLTexture;
    public bilateral_filter_horizontal_tex: WebGLTexture;
    public bilateral_filter_vertical_tex: WebGLTexture;
    public color_pass_tex: WebGLTexture;
    public color_pass_reflection_tex: WebGLTexture;
    public scatter_pass_tex: WebGLTexture;

    // Simulation textures
    public read_terrain_tex: WebGLTexture;
    public write_terrain_tex: WebGLTexture;
    public read_flux_tex: WebGLTexture;
    public write_flux_tex: WebGLTexture;
    public read_terrain_flux_tex: WebGLTexture; // thermal
    public write_terrain_flux_tex: WebGLTexture;
    public read_maxslippage_tex: WebGLTexture;
    public write_maxslippage_tex: WebGLTexture;
    public read_vel_tex: WebGLTexture;
    public write_vel_tex: WebGLTexture;
    public read_sediment_tex: WebGLTexture;
    public write_sediment_tex: WebGLTexture;
    public terrain_nor: WebGLTexture;
    public read_sediment_blend: WebGLTexture;
    public write_sediment_blend: WebGLTexture;
    public sediment_advect_a: WebGLTexture;
    public sediment_advect_b: WebGLTexture;

    // Height map texture for importing external height maps
    public heightmap_tex: WebGLTexture | null = null;

    constructor(gl: WebGL2RenderingContext, simres: number, shadowMapResolution: number) {
        this.gl = gl;
        this.simres = simres;
        this.shadowMapResolution = shadowMapResolution;

        // Initialize to null - will be created in setup()
        this.frame_buffer = null as any;
        this.shadowMap_frame_buffer = null as any;
        this.deferred_frame_buffer = null as any;
        this.render_buffer = null as any;
        this.shadowMap_render_buffer = null as any;
        this.deferred_render_buffer = null as any;
        this.shadowMap_tex = null as any;
        this.scene_depth_tex = null as any;
        this.bilateral_filter_horizontal_tex = null as any;
        this.bilateral_filter_vertical_tex = null as any;
        this.color_pass_tex = null as any;
        this.color_pass_reflection_tex = null as any;
        this.scatter_pass_tex = null as any;
        this.read_terrain_tex = null as any;
        this.write_terrain_tex = null as any;
        this.read_flux_tex = null as any;
        this.write_flux_tex = null as any;
        this.read_terrain_flux_tex = null as any;
        this.write_terrain_flux_tex = null as any;
        this.read_maxslippage_tex = null as any;
        this.write_maxslippage_tex = null as any;
        this.read_vel_tex = null as any;
        this.write_vel_tex = null as any;
        this.read_sediment_tex = null as any;
        this.write_sediment_tex = null as any;
        this.terrain_nor = null as any;
        this.read_sediment_blend = null as any;
        this.write_sediment_blend = null as any;
        this.sediment_advect_a = null as any;
        this.sediment_advect_b = null as any;
    }

    private createTexture(w: number, h: number, samplingType: number): WebGLTexture {
        const new_tex = this.gl.createTexture();
        if (!new_tex) throw new Error('Failed to create texture');
        this.gl.bindTexture(this.gl.TEXTURE_2D, new_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, w, h, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, samplingType);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, samplingType);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return new_tex;
    }

    private recreateTexture(w: number, h: number, samplingType: number, texHandle: WebGLTexture): void {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texHandle);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, w, h, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, samplingType);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, samplingType);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }

    setup(): void {
        const simulationTextureSampler = this.gl.LINEAR;
        
        // Create simulation textures
        this.read_terrain_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_terrain_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_flux_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_flux_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_terrain_flux_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_terrain_flux_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_maxslippage_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_maxslippage_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_vel_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_vel_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_sediment_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_sediment_tex = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.terrain_nor = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.read_sediment_blend = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.write_sediment_blend = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.sediment_advect_a = this.createTexture(this.simres, this.simres, simulationTextureSampler);
        this.sediment_advect_b = this.createTexture(this.simres, this.simres, simulationTextureSampler);

        // Create screen textures
        this.shadowMap_tex = this.createTexture(this.shadowMapResolution, this.shadowMapResolution, this.gl.LINEAR);
        this.scene_depth_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
        this.bilateral_filter_horizontal_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
        this.bilateral_filter_vertical_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
        this.color_pass_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
        this.color_pass_reflection_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);
        this.scatter_pass_tex = this.createTexture(window.innerWidth, window.innerHeight, this.gl.LINEAR);

        // Create framebuffers and renderbuffers
        this.shadowMap_frame_buffer = this.gl.createFramebuffer();
        if (!this.shadowMap_frame_buffer) throw new Error('Failed to create shadowMap_frame_buffer');
        this.shadowMap_render_buffer = this.gl.createRenderbuffer();
        if (!this.shadowMap_render_buffer) throw new Error('Failed to create shadowMap_render_buffer');
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.shadowMap_render_buffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16,
            this.shadowMapResolution, this.shadowMapResolution);

        this.deferred_frame_buffer = this.gl.createFramebuffer();
        if (!this.deferred_frame_buffer) throw new Error('Failed to create deferred_frame_buffer');
        this.deferred_render_buffer = this.gl.createRenderbuffer();
        if (!this.deferred_render_buffer) throw new Error('Failed to create deferred_render_buffer');
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.deferred_render_buffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16,
            window.innerWidth, window.innerHeight);

        this.frame_buffer = this.gl.createFramebuffer();
        if (!this.frame_buffer) throw new Error('Failed to create frame_buffer');
        this.render_buffer = this.gl.createRenderbuffer();
        if (!this.render_buffer) throw new Error('Failed to create render_buffer');
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.render_buffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16,
            this.simres, this.simres);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
    }

    resizeTextures4Simulation(newSimres: number): void {
        this.simres = newSimres;
        const simulationTextureSampler = this.gl.LINEAR;
        
        // Recreate all simulation textures
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_terrain_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_terrain_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_flux_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_flux_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_terrain_flux_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_terrain_flux_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_maxslippage_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_maxslippage_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_vel_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_vel_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_sediment_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_sediment_tex);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.terrain_nor);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.read_sediment_blend);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.write_sediment_blend);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.sediment_advect_a);
        this.recreateTexture(this.simres, this.simres, simulationTextureSampler, this.sediment_advect_b);

        // Recreate renderbuffer
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.render_buffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16,
            this.simres, this.simres);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
    }

    resizeScreenTextures(): void {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.color_pass_reflection_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.scatter_pass_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.color_pass_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.bilateral_filter_vertical_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.bilateral_filter_horizontal_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.scene_depth_tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, window.innerWidth, window.innerHeight, 0,
            this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.deferred_render_buffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16,
            window.innerWidth, window.innerHeight);
    }

    setHeightMapTexture(tex: WebGLTexture | null): void {
        this.heightmap_tex = tex;
    }

    getHeightMapTexture(): WebGLTexture | null {
        return this.heightmap_tex;
    }

    // Ping-pong swap functions
    swapTerrainTextures(): void {
        const tmp = this.read_terrain_tex;
        this.read_terrain_tex = this.write_terrain_tex;
        this.write_terrain_tex = tmp;
    }

    swapFluxTextures(): void {
        const tmp = this.read_flux_tex;
        this.read_flux_tex = this.write_flux_tex;
        this.write_flux_tex = tmp;
    }

    swapVelTextures(): void {
        const tmp = this.read_vel_tex;
        this.read_vel_tex = this.write_vel_tex;
        this.write_vel_tex = tmp;
    }

    swapSedimentTextures(): void {
        const tmp = this.read_sediment_tex;
        this.read_sediment_tex = this.write_sediment_tex;
        this.write_sediment_tex = tmp;
    }

    swapSedimentBlendTextures(): void {
        const tmp = this.read_sediment_blend;
        this.read_sediment_blend = this.write_sediment_blend;
        this.write_sediment_blend = tmp;
    }

    swapMaxSlippageTextures(): void {
        const tmp = this.read_maxslippage_tex;
        this.read_maxslippage_tex = this.write_maxslippage_tex;
        this.write_maxslippage_tex = tmp;
    }

    swapTerrainFluxTextures(): void {
        const tmp = this.read_terrain_flux_tex;
        this.read_terrain_flux_tex = this.write_terrain_flux_tex;
        this.write_terrain_flux_tex = tmp;
    }

    swapBilateralFilterTextures(): void {
        const tmp = this.bilateral_filter_horizontal_tex;
        this.bilateral_filter_horizontal_tex = this.bilateral_filter_vertical_tex;
        this.bilateral_filter_vertical_tex = tmp;
    }
}
