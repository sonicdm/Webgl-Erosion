import { simres, shadowMapResolution } from './simulation-state';

// We need to get gl_context from the caller, so we'll pass it as a parameter
let gl_context: WebGL2RenderingContext;

export function setGlContext(context: WebGL2RenderingContext): void {
    gl_context = context;
}

// ================ frame buffers ============
export let frame_buffer: WebGLFramebuffer;
export let shadowMap_frame_buffer: WebGLFramebuffer;
export let deferred_frame_buffer: WebGLFramebuffer;

// ================  render buffers ============
export let render_buffer: WebGLRenderbuffer;
export let shadowMap_render_buffer: WebGLRenderbuffer;
export let deferred_render_buffer: WebGLRenderbuffer;

// ================ muti-renderpasses used textures ============
export let shadowMap_tex: WebGLTexture;
export let scene_depth_tex: WebGLTexture;
export let bilateral_filter_horizontal_tex: WebGLTexture;
export let bilateral_filter_vertical_tex: WebGLTexture;
export let color_pass_tex: WebGLTexture;
export let color_pass_reflection_tex: WebGLTexture;
export let scatter_pass_tex: WebGLTexture;

// ================ simulation textures ===================
export let read_terrain_tex: WebGLTexture;
export let write_terrain_tex: WebGLTexture;
export let read_flux_tex: WebGLTexture;
export let write_flux_tex: WebGLTexture;
export let read_terrain_flux_tex: WebGLTexture; // thermal
export let write_terrain_flux_tex: WebGLTexture;
export let read_maxslippage_tex: WebGLTexture;
export let write_maxslippage_tex: WebGLTexture;
export let read_vel_tex: WebGLTexture;
export let write_vel_tex: WebGLTexture;
export let read_sediment_tex: WebGLTexture;
export let write_sediment_tex: WebGLTexture;
export let terrain_nor: WebGLTexture;
export let read_sediment_blend: WebGLTexture;
export let write_sediment_blend: WebGLTexture;
export let sediment_advect_a: WebGLTexture;
export let sediment_advect_b: WebGLTexture;

// Height map texture for importing external height maps
export let heightmap_tex: WebGLTexture | null = null;

function LE_create_texture(w: number, h: number, samplingType: number): WebGLTexture {
    let new_tex = gl_context.createTexture();
    gl_context.bindTexture(gl_context.TEXTURE_2D, new_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, w, h, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
    return new_tex;
}

function LE_recreate_texture(w: number, h: number, samplingType: number, texHandle: WebGLTexture): void {
    gl_context.bindTexture(gl_context.TEXTURE_2D, texHandle);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, w, h, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
}

function LE_create_screen_texture(w: number, h: number, samplingType: number): WebGLTexture {
    let new_tex = gl_context.createTexture();
    gl_context.bindTexture(gl_context.TEXTURE_2D, new_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, w, h, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, samplingType);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
    return new_tex;
}

export function resizeTextures4Simulation(context: WebGL2RenderingContext, simres: number): void {
    gl_context = context;
    let simulationTextureSampler = gl_context.LINEAR;
    // recreate all textures related to simulation
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_terrain_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_terrain_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_flux_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_flux_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_terrain_flux_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_terrain_flux_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_maxslippage_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_maxslippage_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_vel_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_vel_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_sediment_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_sediment_tex);
    LE_recreate_texture(simres, simres, simulationTextureSampler, terrain_nor);
    LE_recreate_texture(simres, simres, simulationTextureSampler, read_sediment_blend);
    LE_recreate_texture(simres, simres, simulationTextureSampler, write_sediment_blend);
    LE_recreate_texture(simres, simres, simulationTextureSampler, sediment_advect_a);
    LE_recreate_texture(simres, simres, simulationTextureSampler, sediment_advect_b);

    // recreate all framebuffer/renderbuffer related to simulation
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        simres, simres);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    // recreate CPU read texture buffer for simulation & User interaction
    // Note: HightMapCpuBuf is imported from simulation-state, but we need to update it
    // This will be handled by the caller
}

export function setupFramebufferandtextures(context: WebGL2RenderingContext, simres: number): void {
    gl_context = context;
    let simulationTextureSampler = gl_context.LINEAR;
    // Noise generated data from GPU texture, include population density, water distribution, terrain elevation...
    read_terrain_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_terrain_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    read_flux_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_flux_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    read_terrain_flux_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_terrain_flux_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    read_maxslippage_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_maxslippage_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    read_vel_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_vel_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    read_sediment_tex = LE_create_texture(simres, simres, simulationTextureSampler);
    write_sediment_tex = LE_create_texture(simres, simres, simulationTextureSampler);

    terrain_nor = LE_create_texture(simres, simres, simulationTextureSampler);

    read_sediment_blend = LE_create_texture(simres, simres, simulationTextureSampler);
    write_sediment_blend = LE_create_texture(simres, simres, simulationTextureSampler);

    sediment_advect_a = LE_create_texture(simres, simres, simulationTextureSampler);
    sediment_advect_b = LE_create_texture(simres, simres, simulationTextureSampler);

    shadowMap_tex = LE_create_screen_texture(shadowMapResolution, shadowMapResolution, gl_context.LINEAR);
    scene_depth_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);
    bilateral_filter_horizontal_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);
    bilateral_filter_vertical_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);
    color_pass_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);
    color_pass_reflection_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);
    scatter_pass_tex = LE_create_screen_texture(window.innerWidth, window.innerHeight, gl_context.LINEAR);

    shadowMap_frame_buffer = gl_context.createFramebuffer();
    shadowMap_render_buffer = gl_context.createRenderbuffer();
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, shadowMap_render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        shadowMapResolution, shadowMapResolution);

    deferred_frame_buffer = gl_context.createFramebuffer();
    deferred_render_buffer = gl_context.createRenderbuffer();
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, deferred_render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        window.innerWidth, window.innerHeight);

    frame_buffer = gl_context.createFramebuffer();
    render_buffer = gl_context.createRenderbuffer();
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        simres, simres);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);
}

export function resizeScreenTextures(): void {
    gl_context.bindTexture(gl_context.TEXTURE_2D, color_pass_reflection_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindTexture(gl_context.TEXTURE_2D, scatter_pass_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindTexture(gl_context.TEXTURE_2D, color_pass_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_vertical_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_horizontal_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, window.innerWidth, window.innerHeight, 0,
        gl_context.RGBA, gl_context.FLOAT, null);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);

    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, deferred_render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        window.innerWidth, window.innerHeight);
}

export function setHeightMapTexture(tex: WebGLTexture | null): void {
    heightmap_tex = tex;
}

export function getHeightMapTexture(): WebGLTexture | null {
    return heightmap_tex;
}

// Functions to swap ping-pong textures
export function swapTerrainTextures(): void {
    const tmp = read_terrain_tex;
    read_terrain_tex = write_terrain_tex;
    write_terrain_tex = tmp;
}

export function swapFluxTextures(): void {
    const tmp = read_flux_tex;
    read_flux_tex = write_flux_tex;
    write_flux_tex = tmp;
}

export function swapVelTextures(): void {
    const tmp = read_vel_tex;
    read_vel_tex = write_vel_tex;
    write_vel_tex = tmp;
}

export function swapSedimentTextures(): void {
    const tmp = read_sediment_tex;
    read_sediment_tex = write_sediment_tex;
    write_sediment_tex = tmp;
}

export function swapSedimentBlendTextures(): void {
    const tmp = read_sediment_blend;
    read_sediment_blend = write_sediment_blend;
    write_sediment_blend = tmp;
}

export function swapMaxSlippageTextures(): void {
    const tmp = read_maxslippage_tex;
    read_maxslippage_tex = write_maxslippage_tex;
    write_maxslippage_tex = tmp;
}

export function swapTerrainFluxTextures(): void {
    const tmp = read_terrain_flux_tex;
    read_terrain_flux_tex = write_terrain_flux_tex;
    write_terrain_flux_tex = tmp;
}

export function swapBilateralFilterTextures(): void {
    const tmp = bilateral_filter_horizontal_tex;
    bilateral_filter_horizontal_tex = bilateral_filter_vertical_tex;
    bilateral_filter_vertical_tex = tmp;
}

