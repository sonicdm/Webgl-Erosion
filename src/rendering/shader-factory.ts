import ShaderProgram, { Shader } from './gl/ShaderProgram';

// GLSL shader imports
import terrainVert from '../shaders/terrain-vert.glsl?raw';
import terrainFrag from '../shaders/terrain-frag.glsl?raw';
import flatVert from '../shaders/flat-vert.glsl?raw';
import flatFrag from '../shaders/flat-frag.glsl?raw';
import quadVert from '../shaders/quad-vert.glsl?raw';
import initialFrag from '../shaders/initial-frag.glsl?raw';
import flowFrag from '../shaders/flow-frag.glsl?raw';
import alterwaterhightFrag from '../shaders/alterwaterhight-frag.glsl?raw';
import sedimentFrag from '../shaders/sediment-frag.glsl?raw';
import sediadvectFrag from '../shaders/sediadvect-frag.glsl?raw';
import maccormackFrag from '../shaders/maccormack-frag.glsl?raw';
import rainFrag from '../shaders/rain-frag.glsl?raw';
import evaFrag from '../shaders/eva-frag.glsl?raw';
import averageFrag from '../shaders/average-frag.glsl?raw';
import cleanFrag from '../shaders/clean-frag.glsl?raw';
import waterVert from '../shaders/water-vert.glsl?raw';
import waterFrag from '../shaders/water-frag.glsl?raw';
import thermalterrainfluxFrag from '../shaders/thermalterrainflux-frag.glsl?raw';
import thermalapplyFrag from '../shaders/thermalapply-frag.glsl?raw';
import maxslippageheightFrag from '../shaders/maxslippageheight-frag.glsl?raw';
import shadowmapVert from '../shaders/shadowmap-vert.glsl?raw';
import shadowmapFrag from '../shaders/shadowmap-frag.glsl?raw';
import sceneDepthFrag from '../shaders/sceneDepth-frag.glsl?raw';
import combineFrag from '../shaders/combine-frag.glsl?raw';
import bilateralBlurFrag from '../shaders/bilateralBlur-frag.glsl?raw';
import veladvectFrag from '../shaders/veladvect-frag.glsl?raw';

export interface Shaders {
    lambert: ShaderProgram;
    flat: ShaderProgram;
    noiseterrain: ShaderProgram;
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

    const waterhight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, alterwaterhightFrag),
    ]);

    const sediment = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, sedimentFrag),
    ]);

    const sediadvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, sediadvectFrag),
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
        new Shader(gl_context.FRAGMENT_SHADER, evaFrag),
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
        new Shader(gl_context.FRAGMENT_SHADER, thermalterrainfluxFrag),
    ]);

    const thermalapply = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, thermalapplyFrag),
    ]);

    const maxslippageheight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, quadVert),
        new Shader(gl_context.FRAGMENT_SHADER, maxslippageheightFrag),
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
        new Shader(gl_context.FRAGMENT_SHADER, veladvectFrag),
    ]);

    return {
        lambert,
        flat,
        noiseterrain,
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
        veladvect
    };
}

