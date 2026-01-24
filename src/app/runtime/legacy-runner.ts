// @ts-ignore
import Stats from 'stats-js';
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { AppContext } from '../bootstrap';
import { calculateBrushInput, normalizeMousePosition } from '../input/brush-controls';
import { createSimulationParams, SimulationParams } from '../dto/SimulationParams';
import { Controls } from '../../gui/gui-setup';
import OpenGLRenderer from '../../rendering/gl/OpenGLRenderer';
import Camera from '../../Camera';
import ShaderProgram from '../../rendering/gl/ShaderProgram';
import Square from '../../geometry/Square';
import Plane from '../../geometry/Plane';
import { Render2Texture } from '../../rendering/render-utils';
import {
  frame_buffer,
  read_terrain_tex,
  write_terrain_tex,
  read_flux_tex,
  write_flux_tex,
  read_vel_tex,
  write_vel_tex,
  read_sediment_tex,
  write_sediment_tex,
  terrain_nor,
  read_sediment_blend,
  write_sediment_blend,
  sediment_advect_a,
  sediment_advect_b,
  read_maxslippage_tex,
  write_maxslippage_tex,
  read_terrain_flux_tex,
  write_terrain_flux_tex,
  shadowMap_frame_buffer,
  shadowMap_tex,
  shadowMap_render_buffer,
  deferred_frame_buffer,
  scene_depth_tex,
  deferred_render_buffer,
  color_pass_tex,
  color_pass_reflection_tex,
  scatter_pass_tex,
  bilateral_filter_horizontal_tex,
  bilateral_filter_vertical_tex,
  swapTerrainTextures,
  swapFluxTextures,
  swapVelTextures,
  swapSedimentTextures,
  swapSedimentBlendTextures,
  swapMaxSlippageTextures,
  swapTerrainFluxTextures,
  swapBilateralFilterTextures,
  resizeScreenTextures,
  read_lava_tex,
  write_lava_tex,
  read_lava_flux_tex,
  write_lava_flux_tex,
  render_buffer,
  swapLavaTextures,
  swapLavaFluxTextures,
} from '../../simulation/texture-management';
import {
  simres,
  shadowMapResolution,
  simFrameCount,
  TerrainGeometryDirty,
  PauseGeneration,
  heightMapCpuBuf,
  heightMapBufCounter,
  maxHeightMapBufCounter,
  shouldReadHeightmap,
  setSimRes,
  incrementSimFrameCount,
  setTerrainGeometryDirty,
  incrementHeightMapBufCounter,
  resetHeightMapBufCounter,
  terrainGeometry,
  terrainBVH,
  setTerrainGeometry,
  setTerrainBVH,
  terrainBVHBuildInProgress,
  setTerrainBVHBuildInProgress,
  heightMapBufIsFresh,
  setHeightMapBufIsFresh,
  geometryUpdateCounter,
  geometryNeedsUpdate,
  geometryUpdateInterval,
  enableBVHUpdates,
  incrementGeometryUpdateCounter,
  resetGeometryUpdateCounter,
  setGeometryNeedsUpdate,
  shouldUpdateGeometry,
  resizeHeightMapCpuBuf,
} from '../../simulation/simulation-state';
import { getCachedUniformLocation } from '../../utils/uniform-cache';
import { rayCast } from '../../utils/raycast';
import { rayCastBVH } from '../../utils/bvh-raycast';
import { createTerrainGeometry, updateTerrainGeometry } from '../../utils/terrain-geometry-builder';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { LoadProgressTracker, LoadPhase } from '../../utils/load-progress';
import { MAX_WATER_SOURCES, waterSources, getWaterSourceCount } from '../../utils/water-sources';
import { MAX_LAVA_SOURCES, lavaSources, getLavaSourceCount } from '../../utils/lava-sources';
import { updateBrushState, BrushContext, BrushControls } from '../../brush-handler';
import { resizeTextures4Simulation } from '../../simulation/texture-management';

/**
 * Legacy runner result
 */
export interface LegacyRunnerResult {
  start(): void;
  stop(): void;
  dispose(): void;
}

/**
 * Legacy runner configuration
 */
export interface LegacyRunnerConfig {
  appContext: AppContext;
  controls: Controls;
  canvas: HTMLCanvasElement;
  glContext: WebGL2RenderingContext;
  renderer: OpenGLRenderer;
  camera: Camera;
  shaders: {
    lambert: ShaderProgram;
    flat: ShaderProgram;
    flow: ShaderProgram;
    waterHeight: ShaderProgram;
    sediment: ShaderProgram;
    sediadvect: ShaderProgram;
    macCormack: ShaderProgram;
    rains: ShaderProgram;
    evaporation: ShaderProgram;
    average: ShaderProgram;
    clean: ShaderProgram;
    water: ShaderProgram;
    thermalterrainflux: ShaderProgram;
    thermalapply: ShaderProgram;
    maxslippageheight: ShaderProgram;
    shadowMapShader: ShaderProgram;
    sceneDepthShader: ShaderProgram;
    combinedShader: ShaderProgram;
    bilateralBlur: ShaderProgram;
    veladvect: ShaderProgram;
    lavaFlow: ShaderProgram;
    lavaUpdate: ShaderProgram;
    lavaTerrain: ShaderProgram;
    noiseterrain: ShaderProgram | null;
  };
  geometries: {
    square: Square;
    plane: Plane;
  };
  terrainRandom: {
    seedOffset: [number, number];
    duneDir: [number, number];
    craterDensity: number;
    canyonDepth: number;
  };
}

/**
 * Creates a legacy WebGL runner
 * Extracts tick() function and SimulatePerStep() from main.ts
 * 
 * NOTE: Full extraction of SimulatePerStep() (~900 lines) and tick() (~1200 lines)
 * is a complex task. This module provides the structure and interface.
 * The actual extraction will be done incrementally to ensure correctness.
 * 
 * @param config - Legacy runner configuration
 * @returns Runner with start, stop, and dispose methods
 */
export function createLegacyRunner(config: LegacyRunnerConfig): LegacyRunnerResult {
  const {
    appContext,
    controls,
    canvas,
    glContext,
    renderer,
    camera,
    shaders,
    geometries,
    terrainRandom,
  } = config;

  const {
    lambert,
    flat,
    flow,
    waterHeight,
    sediment,
    sediadvect,
    macCormack,
    rains,
    evaporation,
    average,
    clean,
    water,
    thermalterrainflux,
    thermalapply,
    maxslippageheight,
    shadowMapShader,
    sceneDepthShader,
    combinedShader,
    bilateralBlur,
    veladvect,
    lavaFlow,
    lavaUpdate,
    lavaTerrain,
    noiseterrain,
  } = shaders;

  const { square, plane } = geometries;

  // Initialize stats for framerate display
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);

  // Reusable objects to avoid allocations every frame
  const reusableViewProj = mat4.create();
  const reusableInvViewProj = mat4.create();
  const reusableMousePoint = vec4.create();
  const reusableMousePointEnd = vec4.create();
  const reusableDir = vec3.create();
  const reusableRo = vec3.create();
  const reusablePos = vec2.create();
  const reusableLightViewMat = mat4.create();
  const reusableLightProjMat = mat4.create();
  const reusableLightPos = vec3.create();
  const reusableSpawnPos = vec2.create();

  // Reusable arrays for water sources
  const reusableSourcePositions = new Float32Array(MAX_WATER_SOURCES * 2);
  const reusableSourceSizes = new Float32Array(MAX_WATER_SOURCES);
  const reusableSourceStrengths = new Float32Array(MAX_WATER_SOURCES);

  // Reusable arrays for lava sources
  const reusableLavaSourcePositions = new Float32Array(MAX_LAVA_SOURCES * 2);
  const reusableLavaSourceSizes = new Float32Array(MAX_LAVA_SOURCES);
  const reusableLavaSourceStrengths = new Float32Array(MAX_LAVA_SOURCES);

  // Track brush state transitions for heightmap readback
  let lastBrushPressed = 0;
  let lastReadMouseX = -1;
  let lastReadMouseY = -1;
  let timer = 0;
  let animationFrameId: number | null = null;
  let isRunning = false;

  // Clean up textures function
  function cleanUpTextures() {
    Render2Texture(renderer, glContext, camera, clean, read_terrain_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_vel_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_flux_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_terrain_flux_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_terrain_flux_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_maxslippage_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_maxslippage_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_sediment_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_terrain_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_vel_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_flux_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_sediment_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, terrain_nor, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_sediment_blend, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_sediment_blend, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, sediment_advect_a, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, sediment_advect_b, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_lava_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_lava_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, read_lava_flux_tex, square, noiseterrain, appContext.simulationState);
    Render2Texture(renderer, glContext, camera, clean, write_lava_flux_tex, square, noiseterrain, appContext.simulationState);
  }

  // SimulatePerStep function - executes one simulation step
  function SimulatePerStep(
    renderer: OpenGLRenderer,
    gl_context: WebGL2RenderingContext,
    camera: Camera,
    shader: ShaderProgram,
    waterHeight: ShaderProgram,
    veladvect: ShaderProgram,
    sedi: ShaderProgram,
    advect: ShaderProgram,
    macCormack: ShaderProgram,
    rains: ShaderProgram,
    eva: ShaderProgram,
    ave: ShaderProgram,
    thermalterrainflux: ShaderProgram,
    thermalapply: ShaderProgram,
    maxslippageheight: ShaderProgram,
    lavaFlow: ShaderProgram,
    lavaUpdate: ShaderProgram,
    lavaTerrain: ShaderProgram,
    lavaSourcePositions: Float32Array,
    lavaSourceSizes: Float32Array,
    lavaSourceStrengths: Float32Array,
    lavaSourceCount: number,
    controls: any,
    reusableMousePoint: vec4,
    reusableDir: vec3,
    reusablePos: vec2
  ) {
    //////////////////////////////////////////////////////////////////
    //rain precipitation
    //0---use hight map to derive hight map : hight map -----> hight map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    rains.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(rains.prog, "readTerrain"), 0);
    gl_context.uniform1f(getCachedUniformLocation(rains.prog, 'raindeg'), controls.RainDegree);

    renderer.render(camera, rains, [square]);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //swap terrain tex-----------------------------------------------
    swapTerrainTextures();
    //swap terrain tex-----------------------------------------------

    //////////////////////////////////////////////////////////////////
    //1---use hight map to derive flux map : hight map -----> flux map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_flux_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    shader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog, "readFlux"), 1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog, "readSedi"), 2);

    renderer.render(camera, shader, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //-----swap flux ping and pong
    swapFluxTextures();
    //-----swap flux ping and pong

    //////////////////////////////////////////////////////////////////
    //2---use flux map and hight map to derive velocity map and new hight map :
    // hight map + flux map -----> velocity map + hight map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    waterHeight.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterHeight.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterHeight.prog, "readFlux"), 1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterHeight.prog, "readSedi"), 2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterHeight.prog, "readVel"), 3);

    renderer.render(camera, waterHeight, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //-----swap terrain ping and pong and velocity ping pong
    swapTerrainTextures();
    swapVelTextures();
    //-----swap terrain ping and pong and velocity ping pong

    //////////////////////////////////////////////////////////////////
    //3---use velocity map, sediment map and hight map to derive sediment map and new hight map and velocity map :
    // hight map + velocity map + sediment map -----> sediment map + hight map + terrain normal map + velocity map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_sediment_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, terrain_nor, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, write_vel_tex, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2, gl_context.COLOR_ATTACHMENT3]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    sedi.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog, "readVelocity"), 1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog, "readSediment"), 2);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog, "readLava"), 4);

    renderer.render(camera, sedi, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //----------swap terrain and sediment map---------
    swapSedimentTextures();
    swapTerrainTextures();
    swapVelTextures();
    //----------swap terrain and sediment map---------

    //////////////////////////////////////////////////////////////////
    // semi-lagrangian advection for sediment transportation
    // 4---use velocity map, sediment map to derive new sediment map :
    // velocity map + sediment map -----> sediment map
    //////////////////////////////////////////////////////////////////
    if (controls.AdvectionMethod == 1) {
      //4.1  first subpass writing to the intermidiate sediment advection texture a
      {
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, sediment_advect_a, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, write_sediment_blend, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

        gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

        gl_context.viewport(0, 0, simres, simres);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

        renderer.clear();
        advect.use();
        gl_context.activeTexture(gl_context.TEXTURE0);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "vel"), 0);

        gl_context.activeTexture(gl_context.TEXTURE1);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sedi"), 1);

        gl_context.activeTexture(gl_context.TEXTURE2);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sediBlend"), 2);

        gl_context.activeTexture(gl_context.TEXTURE3);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "terrain"), 3);

        advect.setFloat(1, "unif_advectMultiplier");

        renderer.render(camera, advect, [square]);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
      }
      //4.2  second subpass writing to the intermidiate sediment advection texture b using a
      {
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, sediment_advect_b, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, write_sediment_blend, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

        gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

        gl_context.viewport(0, 0, simres, simres);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

        renderer.clear();
        advect.use();
        gl_context.activeTexture(gl_context.TEXTURE0);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "vel"), 0);

        gl_context.activeTexture(gl_context.TEXTURE1);
        gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_a);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sedi"), 1);

        gl_context.activeTexture(gl_context.TEXTURE2);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sediBlend"), 2);

        gl_context.activeTexture(gl_context.TEXTURE3);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
        gl_context.uniform1i(getCachedUniformLocation(advect.prog, "terrain"), 3);

        advect.setFloat(-1, "unif_advectMultiplier");

        renderer.render(camera, advect, [square]);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
      }
      //4.3 thrid subpass : mac cormack advection writing to actual sediment using intermidiate advection textures
      {
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_sediment_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

        gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

        gl_context.viewport(0, 0, simres, simres);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

        renderer.clear();
        macCormack.use();
        gl_context.activeTexture(gl_context.TEXTURE0);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
        gl_context.uniform1i(getCachedUniformLocation(macCormack.prog, "vel"), 0);

        gl_context.activeTexture(gl_context.TEXTURE1);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
        gl_context.uniform1i(getCachedUniformLocation(macCormack.prog, "sedi"), 1);

        gl_context.activeTexture(gl_context.TEXTURE2);
        gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_a);
        gl_context.uniform1i(getCachedUniformLocation(macCormack.prog, "sediadvecta"), 2);

        gl_context.activeTexture(gl_context.TEXTURE3);
        gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_b);
        gl_context.uniform1i(getCachedUniformLocation(macCormack.prog, "sediadvectb"), 3);

        renderer.render(camera, macCormack, [square]);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
      }
    } else {
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_sediment_tex, 0);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, write_sediment_blend, 0);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

      gl_context.bindTexture(gl_context.TEXTURE_2D, null);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
      gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

      gl_context.viewport(0, 0, simres, simres);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

      renderer.clear();
      advect.use();
      gl_context.activeTexture(gl_context.TEXTURE0);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
      gl_context.uniform1i(getCachedUniformLocation(advect.prog, "vel"), 0);

      gl_context.activeTexture(gl_context.TEXTURE1);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
      gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sedi"), 1);

      gl_context.activeTexture(gl_context.TEXTURE2);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
      gl_context.uniform1i(getCachedUniformLocation(advect.prog, "sediBlend"), 2);

      gl_context.activeTexture(gl_context.TEXTURE3);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
      gl_context.uniform1i(getCachedUniformLocation(advect.prog, "terrain"), 3);

      advect.setFloat(1, "unif_advectMultiplier");

      renderer.render(camera, advect, [square]);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    }
    //----------swap sediment map---------
    swapSedimentBlendTextures();
    swapSedimentTextures();
    swapVelTextures();
    //----------swap sediment map---------

    //////////////////////////////////////////////////////////////////
    // maxslippage map generation
    // 4.5---use terrain map to derive new maxslippage map :
    // hight map -----> max slippage  map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_maxslippage_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    maxslippageheight.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(maxslippageheight.prog, "readTerrain"), 0);

    renderer.render(camera, maxslippageheight, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //---------------------------------
    //swap maxslippage maps
    swapMaxSlippageTextures();
    //--------------------------------

    //////////////////////////////////////////////////////////////////
    // thermal terrain flux map generation
    // 5---use velocity map, sediment map to derive new sediment map :
    // hight map -----> terrain flux map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_flux_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    thermalterrainflux.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalterrainflux.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_maxslippage_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalterrainflux.prog, "readMaxSlippage"), 1);

    renderer.render(camera, thermalterrainflux, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //---------------------------------
    //swap terrain flux maps
    swapTerrainFluxTextures();

    //////////////////////////////////////////////////////////////////
    // thermal erosion apply
    // 6---use terrain flux map to derive new terrain map :
    // terrain flux map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    thermalapply.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalapply.prog, "readTerrainFlux"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalapply.prog, "readTerrain"), 1);

    renderer.render(camera, thermalapply, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
    //////////////////////////////////////////////////////////////////
    // water level evaporation at end of each iteration
    // 7---use terrain map to derive new terrain map :
    // terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    eva.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(eva.prog, "terrain"), 0);
    gl_context.uniform1f(getCachedUniformLocation(eva.prog, 'evapod'), controls.EvaporationConstant);

    renderer.render(camera, eva, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
    //---------------swap terrain mao----------------------------

    //////////////////////////////////////////////////////////////////
    // Lava Flow Calculation
    // 7.1---use terrain map and lava map to derive lava flux map :
    // terrain map + lava map -----> lava flux map
    //////////////////////////////////////////////////////////////////

    // Unbind all textures first to avoid feedback loops
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D, null);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_lava_flux_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    lavaFlow.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog, "readLava"), 1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog, "readLavaFlux"), 2);

    lavaFlow.setSimres(simres);
    lavaFlow.setPipeLen(controls.pipelen);
    lavaFlow.setTimestep(controls.timestep);
    lavaFlow.setPipeArea(controls.pipeAra);
    // Physics constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaViscosityPreExp"), controls.LavaViscosityPreExp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaActivationEnergy"), controls.LavaActivationEnergy);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaGasConstant"), 8.314); // Gas constant R = 8.314 J/(mol·K)
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog, "u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog, "u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaFlow.prog, "u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaFlow.prog, "u_LavaSourceSizes"), lavaSourceSizes);

    renderer.render(camera, lavaFlow, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //-----swap lava flux ping and pong
    swapLavaFluxTextures();
    //-----swap lava flux ping and pong

    //////////////////////////////////////////////////////////////////
    // Lava Volume Update
    // 7.2---use lava flux map and lava map to derive new lava map :
    // lava map + lava flux map -----> lava map (with temperature updates)
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_lava_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    lavaUpdate.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog, "readLava"), 1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog, "readLavaFlux"), 2);

    lavaUpdate.setSimres(simres);
    lavaUpdate.setPipeLen(controls.pipelen);
    lavaUpdate.setTimestep(controls.timestep);
    lavaUpdate.setPipeArea(controls.pipeAra);
    // Heat transfer constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaAirHeatTransfer"), controls.LavaAirHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaWaterHeatTransfer"), controls.LavaWaterHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaAmbientTemp"), controls.LavaAmbientTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaWaterTemp"), controls.LavaWaterTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSpecificHeat"), controls.LavaSpecificHeat);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSourceSizes"), lavaSourceSizes);
    gl_context.uniform1fv(getCachedUniformLocation(lavaUpdate.prog, "u_LavaSourceStrengths"), lavaSourceStrengths);

    // Lava brush uniforms - MUST be set here while shader is active
    lavaUpdate.setMouseWorldPos(reusableMousePoint);
    lavaUpdate.setMouseWorldDir(reusableDir);
    lavaUpdate.setBrushSize(controls.brushSize);
    lavaUpdate.setBrushStrength(controls.brushStrenth);
    lavaUpdate.setBrushType(controls.brushType);
    lavaUpdate.setBrushPressed(controls.brushPressed);
    lavaUpdate.setBrushPos(reusablePos);
    lavaUpdate.setBrushOperation(controls.brushOperation);
    // Lava source arrays are populated in tick() and passed into this function.

    renderer.render(camera, lavaUpdate, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //-----swap lava ping and pong
    swapLavaTextures();
    //-----swap lava ping and pong

    //////////////////////////////////////////////////////////////////
    // Lava-Terrain Interaction (Melting and Solidification)
    // 7.3---use lava map and terrain map to derive new terrain map :
    // terrain map + lava map -----> terrain map (with melting and solidification)
    // Also updates lava map (removes solidified parts)
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_lava_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);

    renderer.clear();
    lavaTerrain.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog, "readLava"), 1);
    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog, "readLavaFlux"), 2);

    lavaTerrain.setSimres(simres);
    lavaTerrain.setTimestep(controls.timestep);
    // Thermal erosion and solidification constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaContactHeatTransfer"), controls.LavaContactHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaMeltThreshold"), controls.LavaMeltThreshold);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaLatentHeatFusion"), controls.LavaLatentHeatFusion);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog, "u_LavaWaterTemp"), controls.LavaWaterTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog, "u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaTerrain.prog, "u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaTerrain.prog, "u_LavaSourceSizes"), lavaSourceSizes);

    renderer.render(camera, lavaTerrain, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

    //-----swap terrain ping and pong
    swapTerrainTextures();
    //-----swap terrain ping and pong

    //-----swap lava ping and pong (updated lava with solidified parts removed)
    swapLavaTextures();
    //-----swap lava ping and pong

    //////////////////////////////////////////////////////////////////
    // final average step : average terrain to avoid extremly sharp ridges or ravines
    // 6---use terrain map to derive new terrain map :
    //  terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_terrain_tex, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, terrain_nor, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1]);

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);
    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    renderer.clear();
    ave.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(ave.prog, "readTerrain"), 0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(ave.prog, "readSedi"), 1);

    renderer.render(camera, ave, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
    //---------------swap terrain mao----------------------------
  }

  // SimulationStep wrapper function
  function SimulationStep(
    curstep: number,
    flow: ShaderProgram,
    waterHeight: ShaderProgram,
    veladvect: ShaderProgram,
    sediment: ShaderProgram,
    advect: ShaderProgram,
    macCormack: ShaderProgram,
    rains: ShaderProgram,
    evapo: ShaderProgram,
    average: ShaderProgram,
    thermalterrainflux: ShaderProgram,
    thermalapply: ShaderProgram,
    maxslippageheight: ShaderProgram,
    lavaFlow: ShaderProgram,
    lavaUpdate: ShaderProgram,
    lavaTerrain: ShaderProgram,
    lavaSourcePositions: Float32Array,
    lavaSourceSizes: Float32Array,
    lavaSourceStrengths: Float32Array,
    lavaSourceCount: number,
    controls: any,
    renderer: OpenGLRenderer,
    gl_context: WebGL2RenderingContext,
    camera: Camera,
    reusableMousePoint: vec4,
    reusableDir: vec3,
    reusablePos: vec2
  ): boolean {
    if (PauseGeneration) return true;
    else {
      SimulatePerStep(
        renderer,
        gl_context,
        camera,
        flow,
        waterHeight,
        veladvect,
        sediment,
        advect,
        macCormack,
        rains,
        evapo,
        average,
        thermalterrainflux,
        thermalapply,
        maxslippageheight,
        lavaFlow,
        lavaUpdate,
        lavaTerrain,
        lavaSourcePositions,
        lavaSourceSizes,
        lavaSourceStrengths,
        lavaSourceCount,
        controls,
        reusableMousePoint,
        reusableDir,
        reusablePos
      );
    }
    return false;
  }

  function tick() {
    // Update camera before raycasting so matrices are in sync with rendered view
    camera.update(appContext.controlsConfig.camera);

    // ================ ray casting ===================
    //===================================================
    const normalizedMouse = normalizeMousePosition(canvas, appContext.clientState.lastX, appContext.clientState.lastY);
    var screenMouseX = normalizedMouse.x;
    var screenMouseY = normalizedMouse.y;
    //console.log(screenMouseX + ' ' + screenMouseY);

      //console.log(clientHeight + ' ' + clientWidth);
    mat4.multiply(reusableViewProj, camera.projectionMatrix, camera.viewMatrix);
    mat4.invert(reusableInvViewProj, reusableViewProj);
    reusableMousePoint[0] = 2.0 * screenMouseX - 1.0;
    reusableMousePoint[1] = 1.0 - 2.0 * screenMouseY;
    reusableMousePoint[2] = -1.0;
    reusableMousePoint[3] = 1.0;
    reusableMousePointEnd[0] = 2.0 * screenMouseX - 1.0;
    reusableMousePointEnd[1] = 1.0 - 2.0 * screenMouseY;
    reusableMousePointEnd[2] = -0.0;
    reusableMousePointEnd[3] = 1.0;

    vec4.transformMat4(reusableMousePoint, reusableMousePoint, reusableInvViewProj);
    vec4.transformMat4(reusableMousePointEnd, reusableMousePointEnd, reusableInvViewProj);
    reusableMousePoint[0] /= reusableMousePoint[3];
    reusableMousePoint[1] /= reusableMousePoint[3];
    reusableMousePoint[2] /= reusableMousePoint[3];
    reusableMousePoint[3] /= reusableMousePoint[3];
    reusableMousePointEnd[0] /= reusableMousePointEnd[3];
    reusableMousePointEnd[1] /= reusableMousePointEnd[3];
    reusableMousePointEnd[2] /= reusableMousePointEnd[3];
    reusableMousePointEnd[3] /= reusableMousePointEnd[3];
    reusableDir[0] = reusableMousePointEnd[0] - reusableMousePoint[0];
    reusableDir[1] = reusableMousePointEnd[1] - reusableMousePoint[1];
    reusableDir[2] = reusableMousePointEnd[2] - reusableMousePoint[2];
    vec3.normalize(reusableDir, reusableDir);
    reusableRo[0] = reusableMousePoint[0];
    reusableRo[1] = reusableMousePoint[1];
    reusableRo[2] = reusableMousePoint[2];


    //==========set initial terrain uniforms=================
    timer++;
    if (noiseterrain) {
        noiseterrain.setTime(timer);
        noiseterrain.setTerrainHeight(controls.TerrainHeight);
        noiseterrain.setTerrainScale(controls.TerrainScale);
        noiseterrain.setInt(controls.TerrainMask,"u_TerrainMask");
        glContext.uniform1i(getCachedUniformLocation(noiseterrain.prog,"u_terrainBaseType"),controls.TerrainBaseType);
        glContext.uniform2fv(getCachedUniformLocation(noiseterrain.prog,"u_TerrainSeedOffset"), terrainRandom.seedOffset);
        glContext.uniform2fv(getCachedUniformLocation(noiseterrain.prog,"u_DuneDir"), terrainRandom.duneDir);
        glContext.uniform1f(getCachedUniformLocation(noiseterrain.prog,"u_CraterDensity"), terrainRandom.craterDensity);
        glContext.uniform1f(getCachedUniformLocation(noiseterrain.prog,"u_CanyonDepth"), terrainRandom.canyonDepth);
    }


    if(TerrainGeometryDirty){
        const loadingOverlay = document.getElementById('terrain-loading-overlay');
        const progressText = document.getElementById('loading-progress-text');
        const progressBar = document.getElementById('loading-progress-bar');
        
        // Check if a build is already in progress - if so, don't reset the UI
        const buildInProgress = terrainBVHBuildInProgress || (loadingOverlay && loadingOverlay.classList.contains('visible'));
        
        if (buildInProgress) {
            console.log('[Loading] Build already in progress, skipping UI reset');
            // Still need to process the loading, but don't reset UI
        } else {
            console.log('[Loading] TerrainGeometryDirty=true, starting loading process');
            console.log('[Loading] UI elements:', {
                overlay: !!loadingOverlay,
                progressText: !!progressText,
                progressBar: !!progressBar
            });
            
            if (loadingOverlay) {
                loadingOverlay.classList.add('visible');
                // Force initial render of overlay
                void loadingOverlay.offsetHeight;
                console.log('[Loading] Overlay shown (visible class added)');
            } else {
                console.warn('[Loading] Overlay element not found!');
            }
            
            // Initialize progress bar to 0% to ensure it's visible
            if (progressBar) {
                progressBar.style.width = '0%';
                void progressBar.offsetHeight; // Force reflow
                console.log('[Loading] Progress bar initialized to 0%');
            } else {
                console.warn('[Loading] Progress bar element not found!');
            }
            if (progressText) {
                progressText.textContent = 'Initializing...';
                console.log('[Loading] Progress text set to "Initializing..."');
            } else {
                console.warn('[Loading] Progress text element not found!');
            }
        }
        
        // Create progress tracker with UI update callback
        const progressTracker = new LoadProgressTracker((progress, phase) => {
            const progressPercent = progress * 100;
            console.log(`[Loading] Progress callback: ${progressPercent.toFixed(1)}%, phase: ${phase || 'none'}`);
            
            if (progressBar) {
                const oldWidth = progressBar.style.width;
                progressBar.style.width = `${progressPercent}%`;
                // Force a reflow to ensure the browser renders the update
                void progressBar.offsetHeight;
                console.log(`[Loading] Progress bar updated: ${oldWidth} -> ${progressPercent.toFixed(1)}%`);
            } else {
                console.warn('[Loading] Progress bar not available in callback!');
            }
            
            if (progressText) {
                const phaseNames: Record<LoadPhase, string> = {
                    [LoadPhase.DECODE]: 'Decoding image...',
                    [LoadPhase.GPU_UPLOAD]: 'Uploading to GPU...',
                    [LoadPhase.READBACK]: 'Reading heightmap data...',
                    [LoadPhase.GEOMETRY]: 'Creating terrain geometry...',
                    [LoadPhase.BVH]: 'Building spatial index (BVH)...'
                };
                const newText = phase ? phaseNames[phase] : 'Initializing...';
                progressText.textContent = newText;
                console.log(`[Loading] Progress text updated: "${newText}"`);
            } else {
                console.warn('[Loading] Progress text not available in callback!');
            }
        });
        
        // Use requestAnimationFrame to ensure overlay is rendered before blocking operations
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Handle resolution change if needed (must happen before texture cleanup)
                const resolutionChanged = controls.SimulationResolution != simres;
                if(resolutionChanged){
                    const oldRes = simres;
                    const newRes = Number(controls.SimulationResolution); // Ensure it's a number, not a string
                    console.log(`[Loading] Resolution change detected: ${oldRes} -> ${newRes}`);
                    setSimRes(newRes);
                    resizeTextures4Simulation(glContext, newRes);
                    resizeHeightMapCpuBuf(newRes); // Resize the CPU buffer to match new resolution
                    
                    // Clear old BVH and geometry when resolution changes (they're invalid for new resolution)
                    if (terrainBVH) {
                        console.log('[Loading] Clearing old BVH due to resolution change');
                        setTerrainBVH(null);
                    }
                    if (terrainGeometry) {
                        console.log('[Loading] Disposing old geometry due to resolution change');
                        terrainGeometry.dispose();
                        setTerrainGeometry(null);
                    }
                    if (terrainBVHBuildInProgress) {
                        console.log('[Loading] Clearing in-progress flag due to resolution change');
                        setTerrainBVHBuildInProgress(false);
                    }
                } else {
                    console.log(`[Loading] No resolution change (current: ${simres})`);
                }
                
                //=============clean up all simulation textures===================
                cleanUpTextures();
                //=============recreate base terrain textures=====================
                if (noiseterrain) {
                    // GPU upload phase (rendering textures)
                    progressTracker.startPhase(LoadPhase.GPU_UPLOAD);
                    progressTracker.updateSubPhaseProgress(0.0);
                    Render2Texture(renderer,glContext,camera,noiseterrain,read_terrain_tex,square,noiseterrain);
                    progressTracker.updateSubPhaseProgress(0.5);
                    Render2Texture(renderer,glContext,camera,noiseterrain,write_terrain_tex,square,noiseterrain);
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.GPU_UPLOAD);
                    
                    // Readback phase
                    progressTracker.startPhase(LoadPhase.READBACK);
                    progressTracker.updateSubPhaseProgress(0.0);
                    glContext.bindFramebuffer(glContext.FRAMEBUFFER, frame_buffer);
                    glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, read_terrain_tex, 0);
                    glContext.readBuffer(glContext.COLOR_ATTACHMENT0);
                    progressTracker.updateSubPhaseProgress(0.5);
                    glContext.readPixels(0, 0, simres, simres, glContext.RGBA, glContext.FLOAT, heightMapCpuBuf);
                    glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
                    setHeightMapBufIsFresh(true); // Mark buffer as fresh
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.READBACK);
                }

                //=============rebuild secondary terrain mesh and BVH for raycasting===================
                // Guard: Don't rebuild if BVH build is already in progress (prevents duplicate builds)
                // But allow rebuild if resolution changed (old BVH was cleared above)
                console.log('[BVH] Checking build conditions:', {
                    terrainBVH: !!terrainBVH,
                    terrainBVHBuildInProgress,
                    terrainGeometry: !!terrainGeometry,
                    heightMapBufIsFresh,
                    bufferLength: heightMapCpuBuf?.length,
                    requiredLength: simres * simres * 4
                });
                
                if (terrainBVHBuildInProgress) {
                    console.log('[BVH] BVH build already in progress, skipping duplicate build');
                    // Don't set TerrainGeometryDirty to false yet - wait for build to complete
                    // Don't hide overlay - it should stay visible until build completes
                    return;
                }
                
                // Dispose old geometry and BVH if they exist (needed for rebuilds after reset/resolution change)
                if (terrainGeometry) {
                    console.log('[BVH] Disposing old terrain geometry');
                    terrainGeometry.dispose();
                    setTerrainGeometry(null);
                }
                if (terrainBVH) {
                    console.log('[BVH] Clearing old BVH');
                    setTerrainBVH(null);
                }
                
                // Create new terrain geometry from heightmap
                // Only build BVH if buffer is fresh (just read after terrain generation)
                // This prevents building BVH with stale data
                if (heightMapBufIsFresh && heightMapCpuBuf && heightMapCpuBuf.length >= simres * simres * 4) {
                    // Verify buffer has actual data (not all zeros)
                    let hasData = false;
                    const sampleCount = Math.min(100, simres * simres);
                    for (let i = 0; i < sampleCount; i++) {
                        const idx = Math.floor(Math.random() * simres * simres) * 4;
                        if (heightMapCpuBuf[idx] !== 0) {
                            hasData = true;
                            break;
                        }
                    }
                    
                    if (hasData) {
                        console.log('[BVH] Heightmap buffer has valid data, starting geometry and BVH build');
                        try {
                            // Mark BVH build as in progress to prevent duplicates
                            setTerrainBVHBuildInProgress(true);
                            // Set TerrainGeometryDirty to false NOW (synchronously) to prevent duplicate builds
                            // This must happen before async operations start
                            setTerrainGeometryDirty(false);
                            console.log('[BVH] Build marked as in progress, TerrainGeometryDirty set to false');
                            
                            // Geometry phase with progress callbacks
                            progressTracker.startPhase(LoadPhase.GEOMETRY);
                            progressTracker.updateSubPhaseProgress(0.0);
                            
                            // Force initial UI update - ensure progress bar is visible before blocking work
                            if (progressBar) {
                                const currentProgress = progressTracker.getProgress().progress;
                                progressBar.style.width = `${currentProgress * 100}%`;
                                progressBar.offsetHeight; // Force reflow to ensure render
                                console.log(`[Loading] Initial geometry progress bar set to ${(currentProgress * 100).toFixed(1)}%`);
                            }
                            
                            // Yield to browser to ensure initial progress is rendered
                            console.log('[Loading] Yielding to browser before geometry creation');
                            requestAnimationFrame(() => {
                                console.log('[Loading] Starting geometry creation');
                                const newGeometry = createTerrainGeometry(
                                    simres, 
                                    heightMapCpuBuf, 
                                    1.0,
                                    (progress) => {
                                        const overallProgress = progressTracker.getProgress().progress;
                                        console.log(`[Geometry] Progress callback: ${(progress * 100).toFixed(1)}% (overall: ${(overallProgress * 100).toFixed(1)}%)`);
                                        progressTracker.updateSubPhaseProgress(progress);
                                        // Force UI update periodically
                                        if (progressBar && Math.random() < 0.1) { // Update ~10% of calls to reduce overhead
                                            progressBar.style.width = `${overallProgress * 100}%`;
                                            console.log(`[Geometry] Progress bar updated to ${(overallProgress * 100).toFixed(1)}%`);
                                        }
                                    }
                                );
                                setTerrainGeometry(newGeometry);
                                progressTracker.endPhase(LoadPhase.GEOMETRY);
                                console.log('[Loading] Geometry creation complete');
                            
                                // BVH phase - ensure UI updates before blocking construction
                                progressTracker.startPhase(LoadPhase.BVH);
                                progressTracker.updateSubPhaseProgress(0.0);
                                
                                // Force UI update before blocking BVH construction
                                if (progressBar) {
                                    const currentProgress = progressTracker.getProgress().progress;
                                    progressBar.style.width = `${currentProgress * 100}%`;
                                    progressBar.offsetHeight; // Force reflow
                                    console.log(`[Loading] BVH phase progress bar set to ${(currentProgress * 100).toFixed(1)}%`);
                                }
                                
                                // Yield control to ensure progress bar updates before blocking BVH construction
                                console.log('[Loading] Yielding to browser before BVH construction');
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        console.log('[Loading] Starting BVH construction');
                                        // Update progress to show we're starting BVH construction
                                        progressTracker.updateSubPhaseProgress(0.05);
                                        
                                        // Force another UI update
                                        if (progressBar) {
                                            const currentProgress = progressTracker.getProgress().progress;
                                            progressBar.style.width = `${currentProgress * 100}%`;
                                            progressBar.offsetHeight; // Force reflow
                                        }
                                        
                                        const bvhStartTime = performance.now();
                                        
                                        // Simulate progress updates during BVH construction
                                        // Since MeshBVH doesn't provide progress callbacks, we'll estimate progress
                                        // based on elapsed time (typical BVH build takes 2-3 seconds for 1024x1024)
                                        const estimatedDuration = 2500; // Estimate 2.5 seconds
                                        let progressUpdateInterval: number | null = null;
                                        const startProgress = 0.05;
                                        const endProgress = 0.95; // Leave 5% for completion
                                        
                                        const updateProgress = () => {
                                            const elapsed = performance.now() - bvhStartTime;
                                            const estimatedProgress = Math.min(endProgress, startProgress + (elapsed / estimatedDuration) * (endProgress - startProgress));
                                            progressTracker.updateSubPhaseProgress(estimatedProgress);
                                            if (progressBar) {
                                                const currentProgress = progressTracker.getProgress().progress;
                                                progressBar.style.width = `${currentProgress * 100}%`;
                                            }
                                        };
                                        
                                        // Update progress every 50ms for smooth animation
                                        progressUpdateInterval = window.setInterval(updateProgress, 50);
                                        
                                        // Reduced maxDepth for faster construction while maintaining quality
                                        // 30 is usually sufficient for most terrain (was 40)
                                        const bvh = new MeshBVH(newGeometry, {
                                            strategy: SAH, // Surface Area Heuristic for best performance
                                            maxDepth: 30,    // Reduced from 40 for faster builds (still very accurate)
                                            indirect: false   // Direct indexed geometry
                                        });
                                        
                                        // Clear progress update interval
                                        if (progressUpdateInterval !== null) {
                                            clearInterval(progressUpdateInterval);
                                        }
                                        
                                        const bvhDuration = performance.now() - bvhStartTime;
                                        console.log(`[BVH] BVH construction complete in ${bvhDuration.toFixed(2)}ms`);
                                        
                                        setTerrainBVH(bvh); // This will clear terrainBVHBuildInProgress
                                        progressTracker.updateSubPhaseProgress(1.0);
                                        progressTracker.endPhase(LoadPhase.BVH);
                                        setHeightMapBufIsFresh(false); // Mark as consumed
                                        
                                        // Log timing information
                                        const timings = progressTracker.getAllTimings();
                                        const totalDuration = progressTracker.getTotalDuration();
                                        console.log('[Load] Terrain loading complete:', {
                                            totalDuration: `${totalDuration.toFixed(2)}ms`,
                                            phases: timings.map(t => ({
                                                phase: t.phase,
                                                duration: t.duration ? `${t.duration.toFixed(2)}ms` : 'N/A'
                                            }))
                                        });
                                        
                                        // Hide loading overlay after BVH is built
                                        if (loadingOverlay) {
                                            loadingOverlay.classList.remove('visible');
                                            console.log('[Loading] Overlay hidden (BVH complete)');
                                        } else {
                                            console.warn('[Loading] Overlay element not found when trying to hide!');
                                        }
                                        
                                        // TerrainGeometryDirty was already set to false before async operations started
                                        // No need to set it again here
                                        console.log('[Loading] BVH build complete, overlay hidden');
                                    });
                                });
                                // Don't hide overlay or mark as clean here - wait for BVH to complete
                                // Exit early, overlay will be hidden and dirty flag cleared after BVH completes
                                return;
                            });
                        } catch (error) {
                            console.error('[BVH] Failed to build BVH:', error);
                            setTerrainBVHBuildInProgress(false); // Clear flag on error
                            setHeightMapBufIsFresh(false); // Mark as consumed even on error
                            setTerrainGeometryDirty(false);
                            if (loadingOverlay) {
                                loadingOverlay.classList.remove('visible');
                                console.log('[Loading] Overlay hidden (error)');
                            }
                        }
                    } else {
                        console.log('[BVH] Heightmap buffer has no valid data');
                        setHeightMapBufIsFresh(false); // Mark as consumed
                        setTerrainGeometryDirty(false);
                        if (loadingOverlay) {
                            loadingOverlay.classList.remove('visible');
                            console.log('[Loading] Overlay hidden (no data)');
                        }
                    }
                } else {
                    console.log('[BVH] Heightmap buffer not fresh yet, will build when available');
                    setTerrainGeometryDirty(false);
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('visible');
                        console.log('[Loading] Overlay hidden (buffer not fresh)');
                    }
                }
            });
        });
    }

    //ray cast happens here
    // Initialize to invalid values so we can detect misses
    reusablePos[0] = -10.0;
    reusablePos[1] = -10.0;
    
    
    // Toggle between heightmap and BVH raycast methods for A/B testing
    if (controls.raycastMethod === 'bvh' && terrainBVH && terrainGeometry) {
        // Use BVH raycast
        const hit = rayCastBVH(reusableRo, reusableDir, terrainBVH, terrainGeometry, reusablePos);
        if (!hit) {
            // Fallback to heightmap if BVH misses
            const heightmapPos = vec2.create();
            rayCast(reusableRo, reusableDir, simres, heightMapCpuBuf, heightmapPos);
            reusablePos[0] = heightmapPos[0];
            reusablePos[1] = heightmapPos[1];
        }
    } else {
        // Use heightmap raycast (default)
        rayCast(reusableRo, reusableDir, simres, heightMapCpuBuf, reusablePos);
    }
    
    
    controls.posTemp = reusablePos;

    //===================per tick uniforms==================


    flat.setTime(timer);

    glContext.uniform1f(getCachedUniformLocation(flat.prog,"u_far"),camera.far);
    glContext.uniform1f(getCachedUniformLocation(flat.prog,"u_near"),camera.near);
    reusableLightPos[0] = controls.lightPosX;
    reusableLightPos[1] = controls.lightPosY;
    reusableLightPos[2] = controls.lightPosZ;
    glContext.uniform3fv(getCachedUniformLocation(flat.prog,"unif_LightPos"), reusableLightPos);

    water.setWaterTransparency(controls.WaterTransparency);
    water.setSimres(simres);
    glContext.uniform1f(getCachedUniformLocation(water.prog,"u_far"),camera.far);
    glContext.uniform1f(getCachedUniformLocation(water.prog,"u_near"),camera.near);
    glContext.uniform3fv(getCachedUniformLocation(water.prog,"unif_LightPos"), reusableLightPos);

    lambert.setTerrainDebug(controls.TerrainDebug);
    lambert.setMouseWorldPos(reusableMousePoint);
    lambert.setMouseWorldDir(reusableDir);
    lambert.setBrushSize(controls.brushSize);
    lambert.setBrushType(controls.brushType);
    lambert.setBrushPos(reusablePos);
    lambert.setSimres(simres);
    lambert.setFloat(controls.SnowRange, "u_SnowRange");
    lambert.setFloat(controls.ForestRange, "u_ForestRange");
    lambert.setInt(controls.TerrainPlatte, "u_TerrainPlatte");
    lambert.setInt(controls.ShowFlowTrace ? 0 : 1,"u_FlowTrace");
    lambert.setInt(controls.SedimentTrace ? 0 : 1,"u_SedimentTrace");
    lambert.setFloat(controls.LavaGlowIntensity, "u_LavaGlowIntensity");
    lambert.setFloat(controls.LavaSolidificationTemp, "u_LavaSolidificationTemp");
    lambert.setFloat(controls.LavaInitialTemp, "u_LavaInitialTemp");
    lambert.setFloat(controls.LavaAmbientTemp, "u_LavaAmbientTemp");
    lambert.setFloat(controls.LavaPatternFrequency, "u_LavaPatternFrequency");
    lambert.setInt(1, "u_LavaEnabled");
    lambert.setTime(timer);
    // Fill reusable arrays with source data (reuse instead of creating new ones)
    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
        if (i < waterSources.length) {
            reusableSourcePositions[i * 2] = waterSources[i].position[0];
            reusableSourcePositions[i * 2 + 1] = waterSources[i].position[1];
            reusableSourceSizes[i] = waterSources[i].size;
            reusableSourceStrengths[i] = waterSources[i].strength;
        } else {
            // Fill with zeros for inactive sources
            reusableSourcePositions[i * 2] = 0.0;
            reusableSourcePositions[i * 2 + 1] = 0.0;
            reusableSourceSizes[i] = 0.0;
            reusableSourceStrengths[i] = 0.0;
        }
    }

    // Set source arrays for terrain shader (visualization)
    lambert.setSourceCount(getWaterSourceCount());
    lambert.setSourcePositions(reusableSourcePositions);
    lambert.setSourceSizes(reusableSourceSizes);
    
    // Populate lava source arrays for terrain shader visualization
    for (let i = 0; i < MAX_LAVA_SOURCES; i++) {
        if (i < lavaSources.length) {
            reusableLavaSourcePositions[i * 2] = lavaSources[i].position[0];
            reusableLavaSourcePositions[i * 2 + 1] = lavaSources[i].position[1];
            reusableLavaSourceSizes[i] = lavaSources[i].size;
            reusableLavaSourceStrengths[i] = lavaSources[i].strength;
        } else {
            reusableLavaSourcePositions[i * 2] = 0.0;
            reusableLavaSourcePositions[i * 2 + 1] = 0.0;
            reusableLavaSourceSizes[i] = 0.0;
            reusableLavaSourceStrengths[i] = 0.0;
        }
    }
    
    // Set lava source arrays for terrain shader (visualization)
    glContext.uniform1i(getCachedUniformLocation(lambert.prog,"u_LavaSourceCount"), getLavaSourceCount());
    glContext.uniform2fv(getCachedUniformLocation(lambert.prog,"u_LavaSourcePositions"), reusableLavaSourcePositions);
    glContext.uniform1fv(getCachedUniformLocation(lambert.prog,"u_LavaSourceSizes"), reusableLavaSourceSizes);
    
    // Note: Lava source arrays for lava update shader are set in SimulatePerStep function
    // They need to be set there because that's where the shader is used
    
    reusableLightPos[0] = controls.lightPosX;
    reusableLightPos[1] = controls.lightPosY;
    reusableLightPos[2] = controls.lightPosZ;
    glContext.uniform3fv(getCachedUniformLocation(lambert.prog,"unif_LightPos"), reusableLightPos);
    
    sceneDepthShader.setSimres(simres);

    rains.setMouseWorldPos(reusableMousePoint);
    rains.setMouseWorldDir(reusableDir);
    rains.setBrushSize(controls.brushSize);
    rains.setBrushStrength(controls.brushStrenth);
    rains.setBrushType(controls.brushType);
    rains.setBrushPressed(controls.brushPressed);
    rains.setSimres(simres);
    
    // Update brush state (flatten target height, slope end points, etc.)
        const brushContext: BrushContext = {
            controls: controls as BrushControls,
            controlsConfig: appContext.controlsConfig,
            simres: Number(simres), // Ensure it's a number, not a string
            heightMapCpuBuf: heightMapCpuBuf,
            camera: camera
        };
    updateBrushState(reusablePos, brushContext);
    
    // Set brush uniforms for shader
    rains.setFloat(controls.flattenTargetHeight, 'u_FlattenTargetHeight');
    rains.setVec2(controls.slopeStartPos, 'u_SlopeStartPos');
    rains.setVec2(controls.slopeEndPos, 'u_SlopeEndPos');
    rains.setInt(controls.slopeActive, 'u_SlopeActive');
    // Set source arrays for rain shader (water emission)
    rains.setSourceCount(getWaterSourceCount());
    rains.setSourcePositions(reusableSourcePositions);
    rains.setSourceSizes(reusableSourceSizes);
    rains.setSourceStrengths(reusableSourceStrengths);
    rains.setBrushPos(reusablePos);
    // Set brush operation - this determines add vs subtract mode
    rains.setBrushOperation(controls.brushOperation);
    reusableSpawnPos[0] = controls.spawnposx;
    reusableSpawnPos[1] = controls.spawnposy;
    rains.setSpawnPos(reusableSpawnPos);
    rains.setTime(timer);
    glContext.uniform1i(getCachedUniformLocation(rains.prog,"u_RainErosion"),controls.RainErosion ? 1 : 0);
    rains.setFloat(controls.RainErosionStrength,'u_RainErosionStrength');
    rains.setFloat(controls.RainErosionDropSize,'u_RainErosionDropSize');

    flow.setPipeLen(controls.pipelen);
    flow.setSimres(simres);
    flow.setTimestep(controls.timestep);
    flow.setPipeArea(controls.pipeAra);

    // Lava shader uniforms
    lavaFlow.setSimres(simres);
    lavaFlow.setPipeLen(controls.pipelen);
    lavaFlow.setTimestep(controls.timestep);
    lavaFlow.setPipeArea(controls.pipeAra);
    // Physics constants from controls
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaViscosityPreExp"), controls.LavaViscosityPreExp);
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaActivationEnergy"), controls.LavaActivationEnergy);
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaDensity"), controls.LavaDensity);
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaGasConstant"), 8.314); // Gas constant R = 8.314 J/(mol·K)
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    glContext.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    glContext.uniform1i(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceCount"), getLavaSourceCount());
    glContext.uniform2fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourcePositions"), reusableLavaSourcePositions);
    glContext.uniform1fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceSizes"), reusableLavaSourceSizes);

    lavaUpdate.setSimres(simres);
    lavaUpdate.setPipeLen(controls.pipelen);
    lavaUpdate.setTimestep(controls.timestep);
    lavaUpdate.setPipeArea(controls.pipeAra);
    // Heat transfer constants from controls
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAirHeatTransfer"), controls.LavaAirHeatTransfer);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterHeatTransfer"), controls.LavaWaterHeatTransfer);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAmbientTemp"), controls.LavaAmbientTemp);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaDensity"), controls.LavaDensity);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSpecificHeat"), controls.LavaSpecificHeat);
    glContext.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    
    // Lava brush uniforms
    lavaUpdate.setMouseWorldPos(reusableMousePoint);
    lavaUpdate.setMouseWorldDir(reusableDir);
    lavaUpdate.setBrushSize(controls.brushSize);
    lavaUpdate.setBrushStrength(controls.brushStrenth);
    lavaUpdate.setBrushType(controls.brushType);
    lavaUpdate.setBrushPressed(controls.brushPressed);
    lavaUpdate.setBrushPos(reusablePos);
    lavaUpdate.setBrushOperation(controls.brushOperation);
    lavaUpdate.setTime(timer);

    lavaTerrain.setSimres(simres);
    lavaTerrain.setTimestep(controls.timestep);
    // Thermal erosion and solidification constants from controls
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaContactHeatTransfer"), controls.LavaContactHeatTransfer);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaMeltThreshold"), controls.LavaMeltThreshold);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaLatentHeatFusion"), controls.LavaLatentHeatFusion);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaDensity"), controls.LavaDensity);
    glContext.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);

    waterHeight.setPipeLen(controls.pipelen);
    waterHeight.setSimres(simres);
    waterHeight.setTimestep(controls.timestep);
    waterHeight.setPipeArea(controls.pipeAra);
    waterHeight.setFloat(controls.VelocityMultiplier, 'u_VelMult');
    waterHeight.setFloat(controls.VelocityAdvectionMag, 'u_VelAdvMag');
    waterHeight.setTime(timer);

    sediment.setSimres(simres);
    sediment.setPipeLen(controls.pipelen);
    sediment.setKc(controls.Kc);
    sediment.setKs(controls.Ks);
    sediment.setKd(controls.Kd);
    sediment.setRockErosionResistance(controls.rockErosionResistance);
    sediment.setTimestep(controls.timestep);
    sediment.setTime(timer);

    sediadvect.setSimres(simres);
    sediadvect.setPipeLen(controls.pipelen);
    sediadvect.setKc(controls.Kc);
    sediadvect.setKs(controls.Ks);
    sediadvect.setKd(controls.Kd);
    sediadvect.setTimestep(controls.timestep);
    sediadvect.setFloat(controls.AdvectionSpeedScaling, "unif_advectionSpeedScale");

    veladvect.setSimres(simres);
    veladvect.setPipeLen(controls.pipelen);
    veladvect.setKc(controls.Kc);
    veladvect.setKs(controls.Ks);
    veladvect.setKd(controls.Kd);
    veladvect.setTimestep(controls.timestep);

    macCormack.setSimres(simres);
    macCormack.setPipeLen(controls.pipelen);
    macCormack.setKc(controls.Kc);
    macCormack.setKs(controls.Ks);
    macCormack.setKd(controls.Kd);
    macCormack.setTimestep(controls.timestep);
    macCormack.setFloat(controls.AdvectionSpeedScaling, "unif_advectionSpeedScale");

    thermalterrainflux.setSimres(simres);
    thermalterrainflux.setPipeLen(controls.pipelen);
    thermalterrainflux.setTimestep(controls.timestep);
    thermalterrainflux.setPipeArea(controls.pipeAra);
    glContext.uniform1f(getCachedUniformLocation(thermalterrainflux.prog,"unif_thermalRate"),controls.thermalRate);

    thermalapply.setSimres(simres);
    thermalapply.setPipeLen(controls.pipelen);
    thermalapply.setTimestep(controls.timestep);
    thermalapply.setPipeArea(controls.pipeAra);
    glContext.uniform1f(getCachedUniformLocation(thermalapply.prog,"unif_thermalErosionScale"),controls.thermalErosionScale);

    maxslippageheight.setSimres(simres);
    maxslippageheight.setPipeLen(controls.pipelen);
    maxslippageheight.setTimestep(controls.timestep);
    maxslippageheight.setPipeArea(controls.pipeAra);
    maxslippageheight.setFloat(controls.thermalTalusAngleScale, "unif_TalusScale");
      if(controls.RainErosion){
          maxslippageheight.setInt(1, 'unif_rainMode');
      }else{
          maxslippageheight.setInt(0,'unif_rainMode');
      }

    average.setSimres(simres);
    average.setInt(controls.ErosionMode,'unif_ErosionMode');
    if(controls.RainErosion){
        average.setInt(1, 'unif_rainMode');
    }else{
        average.setInt(0,'unif_rainMode');
    }

    const brushPressed = controls.brushPressed === 1;
    const brushVisible = Number(controls.brushType) !== 0;
    const justPressed = brushPressed && lastBrushPressed === 0;
    const justReleased = !brushPressed && lastBrushPressed === 1; // Brush was just released
    incrementHeightMapBufCounter();
    stats.begin();

      //==========================  we begin simulation from now ===========================================

    for(let i = 0;i<controls.SimulationSpeed;i++) {
        SimulationStep(simFrameCount, flow, waterHeight, veladvect,sediment, sediadvect, macCormack,rains,evaporation,average,thermalterrainflux, thermalapply, maxslippageheight, lavaFlow, lavaUpdate, lavaTerrain, reusableLavaSourcePositions, reusableLavaSourceSizes, reusableLavaSourceStrengths, getLavaSourceCount(), controls, renderer, glContext, camera, reusableMousePoint, reusableDir, reusablePos);
        incrementSimFrameCount();
    }
    
    // Only track update counter if BVH updates are enabled
    // This avoids unnecessary overhead when updates are disabled
    if (enableBVHUpdates && controls.SimulationSpeed > 0 && !PauseGeneration) {
        incrementGeometryUpdateCounter();
    }

    const mouseMoved = (lastReadMouseX < 0 || lastReadMouseY < 0) ||
        (Math.abs(appContext.clientState.lastX - lastReadMouseX) + Math.abs(appContext.clientState.lastY - lastReadMouseY) > 1);
    
    // Trigger heightmap read for brush raycasting (and BVH updates)
    const shouldRead = (justPressed || mouseMoved) && shouldReadHeightmap(brushPressed, brushVisible, simres);
    // Also read when brush is released to update BVH after brush stroke
    const shouldReadForBVH = enableBVHUpdates && justReleased && terrainGeometry && terrainBVH;
    
    if (shouldRead || shouldReadForBVH) {
        // Read full resolution for accurate raycasting
        // Note: This is throttled by shouldReadHeightmap to avoid blocking
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, frame_buffer);
        glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, read_terrain_tex, 0);
        glContext.readBuffer(glContext.COLOR_ATTACHMENT0);
        glContext.readPixels(0, 0, simres, simres, glContext.RGBA, glContext.FLOAT, heightMapCpuBuf);
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
        // Mark as fresh so BVH updates can piggyback on this read (no extra readPixels cost)
        setHeightMapBufIsFresh(true);
        lastReadMouseX = appContext.clientState.lastX;
        lastReadMouseY = appContext.clientState.lastY;
        if (!brushPressed && !brushVisible && heightMapBufCounter >= maxHeightMapBufCounter) {
            resetHeightMapBufCounter();
        }
    }

    // ========== BVH Geometry Update Mechanism ==========
    // Periodically update terrain geometry and refit BVH to keep it synchronized with erosion
    // This avoids full BVH rebuilds (2+ seconds) by using fast refit operations (~50ms)
    // CRITICAL: Only updates when heightmap is already fresh (from brush raycasting)
    // This avoids expensive readPixels calls - we piggyback on existing heightmap reads
    // Also triggers immediately on brush release to update after terrain modifications
    // IMPORTANT: Updates are deferred to avoid blocking the render loop (BVH is not visible)
    const shouldUpdateNow = enableBVHUpdates && terrainGeometry && terrainBVH && !terrainBVHBuildInProgress && heightMapBufIsFresh;
    const updateTriggeredByBrush = justReleased; // Immediate update after brush stroke
    const updateTriggeredByInterval = shouldUpdateGeometry(); // Periodic update during erosion
    
    if (shouldUpdateNow && (updateTriggeredByBrush || updateTriggeredByInterval)) {
        // Terraforming is now GPU-based (rain shader modifies heightmap texture)
        // Geometry is displaced via VTF in vertex shader, so we don't need to update geometry from heightmap
        // BVH updates can proceed normally
        
        // Copy heightmap data to avoid race conditions (heightmap buffer might be overwritten)
        const heightmapCopy = new Float32Array(heightMapCpuBuf);
        
        // Clear fresh flag immediately (before async work) to prevent duplicate updates
        setHeightMapBufIsFresh(false);
        
        // Defer the actual update work to avoid blocking the render loop
        // Since BVH is only used for raycasting (not rendering), we can update it asynchronously
        const performAsyncUpdate = () => {
            if (!terrainGeometry || !terrainBVH || terrainBVHBuildInProgress) {
                return; // Safety check in case BVH was cleared during async delay
            }
            
            // Update geometry positions with copied heightmap (for BVH raycasting)
            // Note: Rendering uses VTF displacement, so geometry update is only for BVH
            updateTerrainGeometry(terrainGeometry, simres, heightmapCopy, 1.0);
            
            // Refit BVH bounding volumes to match updated geometry
            // This is much faster than a full rebuild (~50ms vs 2000-5000ms)
            terrainBVH.refit();
            
            // Reset update tracking
            resetGeometryUpdateCounter();
            setGeometryNeedsUpdate(false);
        };
        
        // Use requestIdleCallback if available (runs when browser is idle)
        // Fallback to setTimeout with 0ms delay (runs after current frame)
        if ('requestIdleCallback' in window) {
            requestIdleCallback(performAsyncUpdate, { timeout: 100 });
        } else {
            setTimeout(performAsyncUpdate, 0);
        }
    }

    // ========== TEST: BVH Accuracy Degradation Over Time ==========
    // Test how BVH accuracy degrades when geometry is not updated
    // This helps determine optimal update frequency
    const ENABLE_BVH_ACCURACY_TEST = false; // Set to true to enable test
    const BVH_TEST_INTERVAL = 1000; // Test every N simulation frames
    
    if (ENABLE_BVH_ACCURACY_TEST && terrainGeometry && terrainBVH && simFrameCount % BVH_TEST_INTERVAL === 0 && simFrameCount > 0) {
        // Read heightmap if not already fresh
        if (!heightMapBufIsFresh) {
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, frame_buffer);
            glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, read_terrain_tex, 0);
            glContext.readBuffer(glContext.COLOR_ATTACHMENT0);
            glContext.readPixels(0, 0, simres, simres, glContext.RGBA, glContext.FLOAT, heightMapCpuBuf);
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
        }
        
        // Test BVH raycast BEFORE geometry update
        const testRayOrigin = vec3.fromValues(0, 2, 0); // Ray from above terrain
        const testRayDir = vec3.fromValues(0, -1, 0); // Ray pointing down
        const bvhPosBefore = vec2.create();
        const heightmapPosBefore = vec2.create();
        const bvhHitBefore = rayCastBVH(testRayOrigin, testRayDir, terrainBVH, terrainGeometry, bvhPosBefore);
        rayCast(testRayOrigin, testRayDir, simres, heightMapCpuBuf, heightmapPosBefore);
        
        // Measure performance: Update + Refit
        const updateStartTime = performance.now();
        updateTerrainGeometry(terrainGeometry, simres, heightMapCpuBuf, 1.0);
        const updateTime = performance.now() - updateStartTime;
        
        const refitStartTime = performance.now();
        // Refit BVH to update bounding volumes after geometry changes
        // Note: BVH stores references to geometry position buffer, so refit() recalculates bounding volumes
        terrainBVH.refit();
        const refitTime = performance.now() - refitStartTime;
        
        // Measure performance: Full rebuild (for comparison, but don't actually rebuild)
        // This would be: const rebuildStartTime = performance.now(); new MeshBVH(terrainGeometry); const rebuildTime = performance.now() - rebuildStartTime;
        // Skipping actual rebuild to avoid blocking, but documenting expected time
        
        // Test BVH raycast AFTER geometry update and refit
        const bvhPosAfter = vec2.create();
        const heightmapPosAfter = vec2.create();
        const bvhHitAfter = rayCastBVH(testRayOrigin, testRayDir, terrainBVH, terrainGeometry, bvhPosAfter);
        rayCast(testRayOrigin, testRayDir, simres, heightMapCpuBuf, heightmapPosAfter);
        
        // Calculate differences
        const diffBefore = vec2.distance(bvhPosBefore, heightmapPosBefore);
        const diffAfter = vec2.distance(bvhPosAfter, heightmapPosAfter);
        const diffHeightmap = vec2.distance(heightmapPosBefore, heightmapPosAfter);
        
        // Test multiple raycast positions to measure accuracy degradation
        const testRays = [
            { origin: vec3.fromValues(0, 2, 0), dir: vec3.fromValues(0, -1, 0), name: 'center' },
            { origin: vec3.fromValues(-0.3, 2, -0.3), dir: vec3.fromValues(0, -1, 0), name: 'corner1' },
            { origin: vec3.fromValues(0.3, 2, 0.3), dir: vec3.fromValues(0, -1, 0), name: 'corner2' },
        ];
        
        let maxDiff = 0;
        let avgDiff = 0;
        let testCount = 0;
        
        for (const testRay of testRays) {
            const bvhPos = vec2.create();
            const heightmapPos = vec2.create();
            const bvhHit = rayCastBVH(testRay.origin, testRay.dir, terrainBVH, terrainGeometry, bvhPos);
            rayCast(testRay.origin, testRay.dir, simres, heightMapCpuBuf, heightmapPos);
            
            if (bvhHit && heightmapPos[0] >= 0 && heightmapPos[0] <= 1) {
                const diff = vec2.distance(bvhPos, heightmapPos);
                maxDiff = Math.max(maxDiff, diff);
                avgDiff += diff;
                testCount++;
            }
        }
        
        if (testCount > 0) {
            avgDiff /= testCount;
        }
        
        console.log('[BVH Accuracy Test] Frame:', simFrameCount, 'Resolution:', simres);
        console.log('  Steps since last update:', geometryUpdateCounter);
        console.log('  Update interval:', geometryUpdateInterval);
        console.log('  Max BVH vs Heightmap diff:', maxDiff.toFixed(6));
        console.log('  Avg BVH vs Heightmap diff:', avgDiff.toFixed(6));
        console.log('  Accuracy:', maxDiff < 0.01 ? 'EXCELLENT' : maxDiff < 0.05 ? 'GOOD' : maxDiff < 0.1 ? 'ACCEPTABLE' : 'POOR');
        console.log('  Performance:');
        console.log('    Geometry update time:', updateTime.toFixed(2), 'ms');
        console.log('    BVH refit time:', refitTime.toFixed(2), 'ms');
        console.log('    Total update+refit time:', (updateTime + refitTime).toFixed(2), 'ms');
        console.log('    Expected full rebuild time: ~2000-5000ms (not measured to avoid blocking)');
        
        // Log accuracy degradation warning if accuracy is poor
        if (maxDiff > 0.1) {
            console.warn('[BVH] Accuracy degradation detected! Consider reducing update interval.');
        }
    }
    // ========== END TEST ==========

    lastBrushPressed = brushPressed ? 1 : 0;

    glContext.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();

    //========================== we enter a series of render pass from now ================================
    //========================== pass 1 : render shadow map pass=====================================


      glContext.bindFramebuffer(glContext.FRAMEBUFFER,shadowMap_frame_buffer);
      glContext.framebufferTexture2D(glContext.FRAMEBUFFER,glContext.COLOR_ATTACHMENT0,glContext.TEXTURE_2D,shadowMap_tex,0);
      glContext.framebufferRenderbuffer(glContext.FRAMEBUFFER,glContext.DEPTH_ATTACHMENT,glContext.RENDERBUFFER,shadowMap_render_buffer);

      glContext.drawBuffers([glContext.COLOR_ATTACHMENT0]);

      glContext.bindTexture(glContext.TEXTURE_2D,null);
      glContext.bindFramebuffer(glContext.FRAMEBUFFER,null);
      glContext.bindRenderbuffer(glContext.RENDERBUFFER,null);

      glContext.viewport(0,0,shadowMapResolution,shadowMapResolution);
      glContext.bindFramebuffer(glContext.FRAMEBUFFER,shadowMap_frame_buffer);
      renderer.clear();// clear when attached to shadow map
      shadowMapShader.use();

      glContext.activeTexture(glContext.TEXTURE0);
      glContext.bindTexture(glContext.TEXTURE_2D,read_terrain_tex);
      glContext.uniform1i(getCachedUniformLocation(shadowMapShader.prog,"heightmap"),0);

      glContext.activeTexture(glContext.TEXTURE1);
      glContext.bindTexture(glContext.TEXTURE_2D, read_sediment_tex);
      glContext.uniform1i(getCachedUniformLocation(shadowMapShader.prog, "sedimap"), 1);

      mat4.ortho(reusableLightProjMat, -1.6, 1.6, -1.6, 1.6, 0, 100);
      reusableLightPos[0] = controls.lightPosX;
      reusableLightPos[1] = controls.lightPosY;
      reusableLightPos[2] = controls.lightPosZ;
      mat4.lookAt(reusableLightViewMat, reusableLightPos, [0,0,0], [0,1,0]);

      glContext.uniformMatrix4fv(getCachedUniformLocation(shadowMapShader.prog,'u_proj'),false,reusableLightProjMat);
      glContext.uniformMatrix4fv(getCachedUniformLocation(shadowMapShader.prog,'u_view'),false,reusableLightViewMat);
      shadowMapShader.setSimres(simres);

      renderer.render(camera,shadowMapShader,[plane]);
      glContext.bindFramebuffer(glContext.FRAMEBUFFER,null);


      //=========================== pass 2 :  render scene depth tex ================================
      sceneDepthShader.use();
      glContext.bindFramebuffer(glContext.FRAMEBUFFER,deferred_frame_buffer);
      glContext.framebufferTexture2D(glContext.FRAMEBUFFER,glContext.COLOR_ATTACHMENT0,glContext.TEXTURE_2D,scene_depth_tex,0);
      glContext.framebufferRenderbuffer(glContext.FRAMEBUFFER,glContext.DEPTH_ATTACHMENT,glContext.RENDERBUFFER,deferred_render_buffer);

      glContext.drawBuffers([glContext.COLOR_ATTACHMENT0]);

      renderer.clear();// clear when attached to scene depth map
      glContext.viewport(0,0,window.innerWidth, window.innerHeight);
      // Bind terrain textures for the depth pass so vertex displacement matches terrain render.
      glContext.activeTexture(glContext.TEXTURE0);
      glContext.bindTexture(glContext.TEXTURE_2D, read_terrain_tex);
      glContext.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "heightmap"), 0);

      glContext.activeTexture(glContext.TEXTURE1);
      glContext.bindTexture(glContext.TEXTURE_2D, read_sediment_tex);
      glContext.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "sedimap"), 1);

      glContext.activeTexture(glContext.TEXTURE2);
      glContext.bindTexture(glContext.TEXTURE_2D, read_lava_tex);
      glContext.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "lavamap"), 2);
      renderer.render(camera, sceneDepthShader, [
          plane,
      ]);
      glContext.bindFramebuffer(glContext.FRAMEBUFFER,null);

    //============================= pass 3 : render terrain and water geometry ================================================
    //============ terrain geometry =========
    glContext.bindFramebuffer(glContext.FRAMEBUFFER,deferred_frame_buffer);
    glContext.framebufferTexture2D(glContext.FRAMEBUFFER,glContext.COLOR_ATTACHMENT0,glContext.TEXTURE_2D,color_pass_tex,0);
    glContext.framebufferTexture2D(glContext.FRAMEBUFFER,glContext.COLOR_ATTACHMENT1,glContext.TEXTURE_2D,color_pass_reflection_tex,0);
    glContext.framebufferRenderbuffer(glContext.FRAMEBUFFER,glContext.DEPTH_ATTACHMENT,glContext.RENDERBUFFER,deferred_render_buffer);

    glContext.drawBuffers([glContext.COLOR_ATTACHMENT0, glContext.COLOR_ATTACHMENT1]);

    renderer.clear();

    lambert.use();
    glContext.viewport(0,0,window.innerWidth, window.innerHeight);
    //plane.setDrawMode(glContext.LINE_STRIP);
    glContext.activeTexture(glContext.TEXTURE0);
    glContext.bindTexture(glContext.TEXTURE_2D,read_terrain_tex);
    let PingUniform = getCachedUniformLocation(lambert.prog,"heightmap");
    glContext.uniform1i(PingUniform,0);

    glContext.activeTexture(glContext.TEXTURE1);
    glContext.bindTexture(glContext.TEXTURE_2D,terrain_nor);
    let norUniform = getCachedUniformLocation(lambert.prog,"normap");
    glContext.uniform1i(norUniform,1);

    glContext.activeTexture(glContext.TEXTURE2);
    glContext.bindTexture(glContext.TEXTURE_2D, read_sediment_tex);
    let sediUniform = getCachedUniformLocation(lambert.prog, "sedimap");
    glContext.uniform1i(sediUniform, 2);

    glContext.activeTexture(glContext.TEXTURE3);
    glContext.bindTexture(glContext.TEXTURE_2D, read_vel_tex);
    let velUniform = getCachedUniformLocation(lambert.prog, "velmap");
    glContext.uniform1i(velUniform, 3);

    glContext.activeTexture(glContext.TEXTURE4);
    glContext.bindTexture(glContext.TEXTURE_2D, read_flux_tex);
    let fluxUniform = getCachedUniformLocation(lambert.prog, "fluxmap");
    glContext.uniform1i(fluxUniform, 4);

    glContext.activeTexture(glContext.TEXTURE5);
    glContext.bindTexture(glContext.TEXTURE_2D, read_terrain_flux_tex);
    let terrainfluxUniform = getCachedUniformLocation(lambert.prog, "terrainfluxmap");
    glContext.uniform1i(terrainfluxUniform, 5);

    glContext.activeTexture(glContext.TEXTURE6);
    glContext.bindTexture(glContext.TEXTURE_2D, read_maxslippage_tex);
    let terrainslippageUniform = getCachedUniformLocation(lambert.prog, "maxslippagemap");
    glContext.uniform1i(terrainslippageUniform, 6);

    glContext.activeTexture(glContext.TEXTURE7);
    glContext.bindTexture(glContext.TEXTURE_2D, read_sediment_blend);
    glContext.uniform1i(getCachedUniformLocation(lambert.prog, "sediBlend"), 7);


    glContext.activeTexture(glContext.TEXTURE0 + 8);
    glContext.bindTexture(glContext.TEXTURE_2D, shadowMap_tex);
    const shadowMapUniformLoc = getCachedUniformLocation(lambert.prog, "shadowMap");
    glContext.uniform1i(shadowMapUniformLoc, 8);

    glContext.activeTexture(glContext.TEXTURE9);
    glContext.bindTexture(glContext.TEXTURE_2D, scene_depth_tex);
    glContext.uniform1i(getCachedUniformLocation(lambert.prog, "sceneDepth"), 9);

    // Bind lava texture for vertex shader pooling (like water)
    // CRITICAL: Use TEXTURE11 to avoid conflicts with TEXTURE10 (used for heightmap)
    // Must bind to a texture unit that's not used by fragment shader
    glContext.activeTexture(glContext.TEXTURE0 + 11);
    glContext.bindTexture(glContext.TEXTURE_2D, read_lava_tex);
    const lavamapUniformLoc = getCachedUniformLocation(lambert.prog, "lavamap");
    if (lavamapUniformLoc) {
        glContext.uniform1i(lavamapUniformLoc, 11);
    }

    glContext.uniformMatrix4fv(getCachedUniformLocation(lambert.prog,'u_sproj'),false,reusableLightProjMat);
    glContext.uniformMatrix4fv(getCachedUniformLocation(lambert.prog,'u_sview'),false,reusableLightViewMat);

      renderer.render(camera, lambert, [
      plane,
    ]);

    // =============== water =====================
    glContext.enable(glContext.BLEND);
    glContext.blendFunc(glContext.SRC_ALPHA, glContext.ONE_MINUS_SRC_ALPHA);
    water.use();
    glContext.activeTexture(glContext.TEXTURE0);
    glContext.bindTexture(glContext.TEXTURE_2D,read_terrain_tex);
    PingUniform = getCachedUniformLocation(water.prog,"heightmap");
    glContext.uniform1i(PingUniform,0);

    glContext.activeTexture(glContext.TEXTURE1);
    glContext.bindTexture(glContext.TEXTURE_2D,terrain_nor);
    norUniform = getCachedUniformLocation(water.prog,"normap");
    glContext.uniform1i(norUniform,1);

    glContext.activeTexture(glContext.TEXTURE2);
    glContext.bindTexture(glContext.TEXTURE_2D,read_sediment_tex);
    sediUniform = getCachedUniformLocation(water.prog,"sedimap");
    glContext.uniform1i(sediUniform,2);

    glContext.activeTexture(glContext.TEXTURE3);
    glContext.bindTexture(glContext.TEXTURE_2D,scene_depth_tex);
    glContext.uniform1i(getCachedUniformLocation(water.prog,"sceneDepth"),3);

    glContext.activeTexture(glContext.TEXTURE4);
    glContext.bindTexture(glContext.TEXTURE_2D,color_pass_reflection_tex);
    glContext.uniform1i(getCachedUniformLocation(water.prog,"colorReflection"),4);


      renderer.render(camera, water, [
      plane,
    ]);

    glContext.bindFramebuffer(glContext.FRAMEBUFFER,null);

    glContext.blendFunc(glContext.SRC_ALPHA, glContext.ONE_MINUS_SRC_ALPHA);


    // ======================== pass 4 : back ground & post processing & rayleigh mie scattering ==================================

    glContext.bindFramebuffer(glContext.FRAMEBUFFER,deferred_frame_buffer);
    glContext.framebufferTexture2D(glContext.FRAMEBUFFER,glContext.COLOR_ATTACHMENT0,glContext.TEXTURE_2D,scatter_pass_tex,0);
    glContext.framebufferRenderbuffer(glContext.FRAMEBUFFER,glContext.DEPTH_ATTACHMENT,glContext.RENDERBUFFER,deferred_render_buffer);

    glContext.drawBuffers([glContext.COLOR_ATTACHMENT0]);

    renderer.clear();// clear when attached to scene depth map
    glContext.viewport(0,0,window.innerWidth, window.innerHeight);

    flat.use();

    glContext.enable(glContext.DEPTH_TEST);
    glContext.depthFunc(glContext.LESS);
    glContext.enable(glContext.BLEND);
    glContext.blendFunc(glContext.SRC_ALPHA, glContext.ONE_MINUS_SRC_ALPHA);

    glContext.activeTexture(glContext.TEXTURE0);
    glContext.bindTexture(glContext.TEXTURE_2D, read_sediment_tex);
    glContext.uniform1i(getCachedUniformLocation(flat.prog,"heightmap"),0);

    glContext.activeTexture(glContext.TEXTURE1);
    glContext.bindTexture(glContext.TEXTURE_2D, scene_depth_tex);
    glContext.uniform1i(getCachedUniformLocation(flat.prog,"sceneDepth"),1);

    glContext.activeTexture(glContext.TEXTURE2);
    glContext.bindTexture(glContext.TEXTURE_2D, shadowMap_tex);
    glContext.uniform1i(getCachedUniformLocation(flat.prog,"shadowMap"),2);

    glContext.uniformMatrix4fv(getCachedUniformLocation(flat.prog,'u_sproj'),false,reusableLightProjMat);
    glContext.uniformMatrix4fv(getCachedUniformLocation(flat.prog,'u_sview'),false,reusableLightViewMat);
    glContext.uniform1i(getCachedUniformLocation(flat.prog,"u_showScattering"),controls.showScattering ? 1 : 0);

    renderer.render(camera, flat, [
      square,
    ]);
    glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);


    // ======================== pass 5 : bilateral blurring pass ==================================
      if(controls.enableBilateralBlur) {
          let NumBlurPass = 4;
          for (let i = 0; i < NumBlurPass; ++i) {

              glContext.bindFramebuffer(glContext.FRAMEBUFFER, deferred_frame_buffer);
              glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, bilateral_filter_horizontal_tex, 0);
              glContext.framebufferRenderbuffer(glContext.FRAMEBUFFER, glContext.DEPTH_ATTACHMENT, glContext.RENDERBUFFER, deferred_render_buffer);

              glContext.drawBuffers([glContext.COLOR_ATTACHMENT0]);

              renderer.clear();// clear when attached to scene depth map

              bilateralBlur.use();
              glContext.activeTexture(glContext.TEXTURE0);
              if (i == 0) {
                  glContext.bindTexture(glContext.TEXTURE_2D, scatter_pass_tex);
              } else {
                  glContext.bindTexture(glContext.TEXTURE_2D, bilateral_filter_vertical_tex);
              }
              glContext.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "scatter_tex"), 0);

              glContext.activeTexture(glContext.TEXTURE1);
              glContext.bindTexture(glContext.TEXTURE_2D, scene_depth_tex);
              glContext.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "scene_depth"), 1);

              glContext.uniform1f(getCachedUniformLocation(bilateralBlur.prog, "u_far"), camera.far);
              glContext.uniform1f(getCachedUniformLocation(bilateralBlur.prog, "u_near"), camera.near);

              glContext.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "u_isHorizontal"), i % 2);


              renderer.render(camera, bilateralBlur, [
                  square,
              ]);

              swapBilateralFilterTextures();

              glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
          }
      }

    // ===================================== pass 6 : combination pass =====================================================================
    combinedShader.use();

    glContext.activeTexture(glContext.TEXTURE0);
    glContext.bindTexture(glContext.TEXTURE_2D, color_pass_tex);
    glContext.uniform1i(getCachedUniformLocation(combinedShader.prog,"color_tex"),0);

    glContext.activeTexture(glContext.TEXTURE1);
    if(controls.enableBilateralBlur)
        glContext.bindTexture(glContext.TEXTURE_2D, bilateral_filter_horizontal_tex);
    else
        glContext.bindTexture(glContext.TEXTURE_2D, scatter_pass_tex);
    glContext.uniform1i(getCachedUniformLocation(combinedShader.prog,"bi_tex"),1);

    glContext.activeTexture(glContext.TEXTURE2);
    glContext.bindTexture(glContext.TEXTURE_2D, scene_depth_tex);
    glContext.uniform1i(getCachedUniformLocation(combinedShader.prog,"sceneDepth_tex"),2);

    renderer.clear();
    renderer.render(camera, combinedShader, [
      square,
    ]);

    glContext.disable(glContext.BLEND);
    //glContext.disable(glContext.DEPTH_TEST);
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    if (isRunning) {
      animationFrameId = requestAnimationFrame(tick);
    }
  }

  // Set up resize handler
  const resizeHandler = () => {
    resizeScreenTextures();
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  };

  window.addEventListener('resize', resizeHandler, false);

  return {
    start() {
      if (!isRunning) {
        isRunning = true;
        animationFrameId = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (isRunning) {
        isRunning = false;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    },
    dispose() {
      this.stop();
      window.removeEventListener('resize', resizeHandler, false);
      if (stats.domElement.parentNode) {
        stats.domElement.parentNode.removeChild(stats.domElement);
      }
    },
  };
}
