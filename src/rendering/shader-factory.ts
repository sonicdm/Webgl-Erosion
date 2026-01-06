import ShaderProgram, { Shader } from './gl/ShaderProgram';

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
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/terrain-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/terrain-frag.glsl')),
    ]);

    const flat = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/flat-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/flat-frag.glsl')),
    ]);

    const noiseterrain = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/initial-frag.glsl')),
    ]);

    const flow = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/flow-frag.glsl')),
    ]);

    const waterhight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/alterwaterhight-frag.glsl')),
    ]);

    const sediment = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/sediment-frag.glsl')),
    ]);

    const sediadvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/sediadvect-frag.glsl')),
    ]);

    const macCormack = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/maccormack-frag.glsl')),
    ]);

    const rains = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/rain-frag.glsl')),
    ]);

    const evaporation = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/eva-frag.glsl')),
    ]);

    const average = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/average-frag.glsl')),
    ]);

    const clean = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/clean-frag.glsl')),
    ]);

    const water = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/water-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/water-frag.glsl')),
    ]);

    const thermalterrainflux = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/thermalterrainflux-frag.glsl')),
    ]);

    const thermalapply = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/thermalapply-frag.glsl')),
    ]);

    const maxslippageheight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/maxslippageheight-frag.glsl')),
    ]);

    const shadowMapShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/shadowmap-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/shadowmap-frag.glsl')),
    ]);

    const sceneDepthShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/terrain-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/sceneDepth-frag.glsl')),
    ]);

    const combinedShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/combine-frag.glsl')),
    ]);

    const bilateralBlur = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/bilateralBlur-frag.glsl')),
    ]);

    const veladvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('../shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('../shaders/veladvect-frag.glsl')),
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

