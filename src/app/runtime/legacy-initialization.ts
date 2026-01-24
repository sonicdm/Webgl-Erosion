import { vec2, vec3 } from 'gl-matrix';
import { ControlsConfig } from '../../controls-config';
import { Controls } from '../../gui/gui-setup';
import { AppContext } from '../bootstrap';
import { createHeightMapLoader } from '../../utils/heightmap-loader';
import { createShaders, Shaders } from '../../rendering/shader-factory';
import { setupFramebufferandtextures } from '../../simulation/texture-management';
import { simres } from '../../simulation/simulation-state';
import { setTerrainRandom, type TerrainRandomParams } from '../../utils/terrain-random';
import Square from '../../geometry/Square';
import Plane from '../../geometry/Plane';
import OpenGLRenderer from '../../rendering/gl/OpenGLRenderer';
import Camera from '../../Camera';
import ShaderProgram from '../../rendering/gl/ShaderProgram';
import { LegacyRunnerConfig } from './legacy-runner';

/**
 * Legacy pipeline initialization result
 */
export interface LegacyInitializationResult {
  config: LegacyRunnerConfig;
  terrainRandom: TerrainRandomParams;
}

/**
 * Initialize the legacy WebGL pipeline
 * Handles WebGL context setup, shader creation, texture setup, geometry creation, etc.
 * 
 * @param appContext - Application context
 * @param glContext - WebGL2 rendering context
 * @param canvas - Canvas element
 * @param controls - Controls object
 * @param controlsConfig - Controls configuration
 * @param camera - Camera instance
 * @returns Initialization result with config for createLegacyRunner
 */
export function initializeLegacyPipeline(
  appContext: AppContext,
  glContext: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  controls: Controls,
  controlsConfig: ControlsConfig,
  camera: Camera
): LegacyInitializationResult {
  // Validate WebGL extensions
  const extensions = glContext.getSupportedExtensions();
  for (let e in extensions) {
    console.log(e);
  }
  if (!glContext.getExtension('OES_texture_float_linear')) {
    console.log("float texture not supported");
  }
  if (!glContext.getExtension('OES_texture_float')) {
    console.log("no float texture!!!?? y am i here?");
  }
  if (!glContext.getExtension('EXT_color_buffer_float')) {
    console.log("cant render to float texture ");
  }

  // Create geometries
  const square = new Square(vec3.fromValues(0, 0, 0));
  square.create();
  const plane = new Plane(vec3.fromValues(0, 0, 0), vec2.fromValues(1, 1), 18);
  plane.create();

  // Create renderer
  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.0, 0.0, 0.0, 0);
  glContext.enable(glContext.DEPTH_TEST);

  // Setup framebuffers and textures
  setupFramebufferandtextures(glContext, simres);

  // Create all shaders
  const shaders = createShaders(glContext);
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

  // Initialize terrain random parameters
  const terrainRandom: TerrainRandomParams = {
    seedOffset: vec2.fromValues(0.0, 0.0),
    duneDir: vec2.fromValues(1.0, 0.0),
    craterDensity: 1.0,
    canyonDepth: 0.7,
  };
  setTerrainRandom(terrainRandom);

  // Create heightmap loader functions
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(glContext, simres, controls);
  controls['Import Height Map'] = loadHeightMap;
  controls['Clear Height Map'] = clearHeightMap;
  controls['Export Height Map'] = exportHeightMap;

  // Build config for legacy runner
  const config: LegacyRunnerConfig = {
    appContext,
    controls,
    canvas,
    glContext,
    renderer,
    camera,
    shaders: {
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
    },
    geometries: {
      square,
      plane,
    },
    terrainRandom: {
      seedOffset: [terrainRandom.seedOffset[0], terrainRandom.seedOffset[1]],
      duneDir: [terrainRandom.duneDir[0], terrainRandom.duneDir[1]],
      craterDensity: terrainRandom.craterDensity,
      canyonDepth: terrainRandom.canyonDepth,
    },
  };

  return {
    config,
    terrainRandom,
  };
}
