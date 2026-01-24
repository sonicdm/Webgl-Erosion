import ShaderProgram, { Shader } from './gl/ShaderProgram';

// GLSL shader imports - updated to new domain folder structure
// Terrain domain
import terrainVert from '../shaders/terrain/terrain-vert.glsl?raw';
import terrainFrag from '../shaders/terrain/terrain-frag.glsl?raw';
import initialFrag from '../shaders/terrain/initial-frag.glsl?raw';
import shadowmapVert from '../shaders/terrain/shadowmap-vert.glsl?raw';
import shadowmapFrag from '../shaders/terrain/shadowmap-frag.glsl?raw';

// Common domain
import flatVert from '../shaders/common/flat-vert.glsl?raw';
import flatFrag from '../shaders/common/flat-frag.glsl?raw';
import quadVert from '../shaders/common/quad-vert.glsl?raw';
import cleanFrag from '../shaders/common/clean-frag.glsl?raw';
import sceneDepthFrag from '../shaders/common/scene-depth-frag.glsl?raw';
import combineFrag from '../shaders/common/combine-frag.glsl?raw';
import bilateralBlurFrag from '../shaders/common/bilateral-blur-frag.glsl?raw';
import velocityAdvectFrag from '../shaders/common/velocity-advect-frag.glsl?raw';

// Water domain
import flowFrag from '../shaders/water/flow-frag.glsl?raw';
import waterHeightFrag from '../shaders/water/water-height-frag.glsl?raw';
import rainFrag from '../shaders/water/rain-frag.glsl?raw';
import evaporationFrag from '../shaders/water/evaporation-frag.glsl?raw';
import waterVert from '../shaders/water/water-vert.glsl?raw';
import waterFrag from '../shaders/water/water-frag.glsl?raw';

// Sediment domain
import sedimentFrag from '../shaders/sediment/sediment-frag.glsl?raw';
import sedimentAdvectFrag from '../shaders/sediment/sediment-advect-frag.glsl?raw';
import maccormackFrag from '../shaders/sediment/maccormack-frag.glsl?raw';
import averageFrag from '../shaders/sediment/average-frag.glsl?raw';

// Thermal domain
import thermalFluxFrag from '../shaders/thermal/thermal-flux-frag.glsl?raw';
import thermalApplyFrag from '../shaders/thermal/thermal-apply-frag.glsl?raw';
import maxSlippageHeightFrag from '../shaders/thermal/max-slippage-height-frag.glsl?raw';

// Lava domain
import lavaFlowFrag from '../shaders/lava/lava-flow-frag.glsl?raw';
import lavaUpdateFrag from '../shaders/lava/lava-update-frag.glsl?raw';
import lavaTerrainFrag from '../shaders/lava/lava-terrain-frag.glsl?raw';

export interface Shaders {
    lambert: ShaderProgram;
    flat: ShaderProgram;
    noiseterrain: ShaderProgram;
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
}

export function createShaders(gl_context: any): Shaders {
    const lambert = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, terrainVert),
        new Shader(gl_context.FRAGMENT_SHADER, terrainFrag),
    ]);

    const flat = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, flatVert),
        new Shader(gl_context.FRAGMENT_SHADER, flatFrag),
    ]);

    const noiseterrain = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, initialFrag),
    ]);

    const flow = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, flowFrag),
    ]);

    const waterHeight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, waterHeightFrag),
    ]);

    const sediment = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, sedimentFrag),
    ]);

    const sediadvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, sedimentAdvectFrag),
    ]);

    const macCormack = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, maccormackFrag),
    ]);

    const rains = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, rainFrag),
    ]);

    const evaporation = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, evaporationFrag),
    ]);

    const average = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, averageFrag),
    ]);

    const clean = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, cleanFrag),
    ]);

    const water = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, waterVert),
        new Shader(gl_context.FRAGMENT_SHADER, waterFrag),
    ]);

    const thermalterrainflux = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, thermalFluxFrag),
    ]);

    const thermalapply = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, thermalApplyFrag),
    ]);

    const maxslippageheight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, maxSlippageHeightFrag),
    ]);

    const shadowMapShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, shadowmapVert),
        new Shader(gl_context.FRAGMENT_SHADER, shadowmapFrag),
    ]);

    const sceneDepthShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, terrainVert),
        new Shader(gl_context.FRAGMENT_SHADER, sceneDepthFrag),
    ]);

    const combinedShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, combineFrag),
    ]);

    const bilateralBlur = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, bilateralBlurFrag),
    ]);

    const veladvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, velocityAdvectFrag),
    ]);

    const lavaFlow = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, lavaFlowFrag),
    ]);

    const lavaUpdate = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, lavaUpdateFrag),
    ]);

    const lavaTerrain = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, lavaTerrainFrag),
    ]);

    return {
        lambert,
        flat,
        noiseterrain,
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
        lavaTerrain
    };
}

