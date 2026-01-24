// @ts-ignore
import Stats from 'stats-js';
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { AppContext } from '../bootstrap';
import { calculateBrushInput } from '../input/brush-controls';
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
} from '../../simulation/texture-management';
import {
  SimFramecnt,
  TerrainGeometryDirty,
  PauseGeneration,
  HightMapCpuBuf,
  HightMapBufCounter,
  MaxHightMapBufCounter,
  shouldReadHeightmap,
  setSimRes,
  incrementSimFramecnt,
  setTerrainGeometryDirty,
  incrementHightMapBufCounter,
  resetHightMapBufCounter,
  terrainGeometry,
  terrainBVH,
  setTerrainGeometry,
  setTerrainBVH,
  terrainBVHBuildInProgress,
  setTerrainBVHBuildInProgress,
  HightMapBufIsFresh,
  setHightMapBufIsFresh,
  geometryUpdateCounter,
  geometryNeedsUpdate,
  geometryUpdateInterval,
  enableBVHUpdates,
  incrementGeometryUpdateCounter,
  resetGeometryUpdateCounter,
  setGeometryNeedsUpdate,
  shouldUpdateGeometry,
  resizeHightMapCpuBuf,
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
    waterhight: ShaderProgram;
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
    waterhight,
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

  // NOTE: SimulatePerStep() and SimulationStep() are very large functions (~900 lines total)
  // They will be extracted from main.ts in a follow-up refactoring.
  // For now, we import them from main.ts (they need to be exported first).
  // This is a placeholder structure - the actual extraction requires careful work.

  // Import SimulationStep from main.ts (needs to be exported)
  // TODO: Extract SimulatePerStep() and SimulationStep() from main.ts into this module
  // For now, we'll need to export them from main.ts temporarily
  // The full extraction will be done in a follow-up workstream

  function tick() {
    // Update camera before raycasting so matrices are in sync with rendered view
    camera.update(appContext.controlsConfig.camera);

    // Calculate brush input using brush-controls module
    const mouseX = appContext.clientState.lastX;
    const mouseY = appContext.clientState.lastY;
    const brushInput = calculateBrushInput(appContext, controls, mouseX, mouseY, canvas);

    // Convert controls to SimulationParams
    const simParams: SimulationParams = createSimulationParams(
      controls,
      appContext.simulationState.simres
    );
    simParams.timer = timer;

    // NOTE: The rest of tick() (~1200 lines) needs to be extracted from main.ts
    // This includes:
    // - Raycasting logic
    // - Terrain geometry/BVH updates
    // - Uniform setting
    // - Simulation step execution
    // - Rendering passes (shadow, depth, terrain, water, scattering, blur, combine)
    // 
    // For now, this is a placeholder structure.
    // The full extraction will be done incrementally to ensure correctness.

    // TODO: Extract full tick() implementation from main.ts (lines 1907-3121)
    // This is a large function that needs careful extraction

    stats.end();
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
