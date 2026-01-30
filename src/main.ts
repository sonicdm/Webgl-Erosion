import {mat4, vec2, vec3, vec4} from 'gl-matrix';
// @ts-ignore
import Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import Plane from './geometry/Plane';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {gl, setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import {stat} from "fs";
import mouseChange from 'mouse-change';
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from './controls-config';
import { loadSettings } from './settings';
import { setupGUI, GUIControllers } from './gui/gui-setup';
import { createEventHandlers } from './events/event-handlers';
import { updateBrushState, BrushContext, BrushControls, getOriginalBrushOperation, setOriginalBrushOperation } from './brush-handler';
import { updatePaletteSelection } from './brush-palette';
import { MAX_WATER_SOURCES, waterSources, getWaterSourceCount } from './utils/water-sources';
import { rayCast } from './utils/raycast';
import { rayCastBVH } from './utils/bvh-raycast';
import { updateTerrainGeometry } from './utils/terrain-geometry-builder';
import { createHeightMapLoader } from './utils/heightmap-loader';
import { getCachedUniformLocation } from './utils/uniform-cache';
import { LoadProgressTracker, LoadPhase } from './utils/load-progress';
import { createApp, AppContext } from './app/bootstrap';
import { createControls } from './app/controls/controls-factory';
import type { IAppControls, ControlsActions } from './app/controls/types';
import { TerrainSceneService } from './app/services/TerrainSceneService';
import { TerrainGeometryUpdater } from './app/services/TerrainGeometryUpdater';
import { LegacyTexturePool } from './simulation/LegacyTexturePool';
import { Render2Texture } from './rendering/render-utils';
import { createShaders, Shaders } from './rendering/shader-factory';
import { checkWebGPUSupport } from './rendering/webgpu/capability-check';
import { WebGPURendererWrapper } from './rendering/webgpu/WebGPURendererWrapper';
import { ComputeNodePipeline } from './rendering/webgpu/compute/ComputeNodePipeline';
import { TerrainGeneratorCompute } from './rendering/webgpu/compute/TerrainGeneratorCompute';
import { WebGPUTexturePool } from './simulation/WebGPUTexturePool';
import { SimulatePerStepWebGPU } from './simulation/SimulatePerStepWebGPU';
import { WebGPUSimulationRunner } from './app/runtime/WebGPUSimulationRunner';
import { readHeightmapFromTexture } from './utils/webgpu-terrain-readback';
import { copyWebGPUTerrainToWebGL } from './utils/webgpu-to-webgl-texture-copy';

// Note: State is now managed through AppContext and state holders
// Additional local variables
let speed = 3;
const enableBilateralBlur = false;
var gl_context : WebGL2RenderingContext;
let appContext: AppContext;
let texturePool: LegacyTexturePool;
/** Controls built by createControls() in main(); in scope for tick/render/sim. */
let controls: IAppControls;
/** Terrain scene service (loadScene, reset, setTerrainRandom); created in main(). */
let terrainSceneService: TerrainSceneService;
/** Only writer to terrain geometry/BVH; created in main(). */
let terrainGeometryUpdater: TerrainGeometryUpdater;

// WebGPU terrain generator (module-level for access from Reset/setTerrainRandom)
let terrainGeneratorCompute: TerrainGeneratorCompute | null = null;








// ================ geometries ============
// =============================================================
let square: Square;
let plane : Plane;
let waterPlane : Plane;


// Note: All texture and framebuffer variables are now imported from texture-management.ts

// Reference to the initial terrain shader (set in main function)
let noiseterrain: ShaderProgram | null = null;
const terrainRandom = {
    seedOffset: vec2.fromValues(0.0, 0.0),
    duneDir: vec2.fromValues(1.0, 0.0),
    craterDensity: 1.0,
    canyonDepth: 0.7
};

// ================ dat gui button call backs ============
// =============================================================

function StartGeneration(){
    appContext.simulationState.setPauseGeneration(!appContext.simulationState.pauseGeneration);
}

// Heightmap loading functions are now created via createHeightMapLoader in main()


// Render2Texture is now imported from rendering/render-utils.ts



function SimulatePerStep(renderer:OpenGLRenderer,
                         gl_context:WebGL2RenderingContext,
                         camera:Camera,
                         shader:ShaderProgram,
                         waterhight:ShaderProgram,
                         veladvect : ShaderProgram,
                         sedi:ShaderProgram,
                         advect:ShaderProgram,
                         macCormack : ShaderProgram,
                         rains:ShaderProgram,
                         eva:ShaderProgram,
                         ave:ShaderProgram,
                         thermalterrainflux:ShaderProgram,
                         thermalapply:ShaderProgram,
                         maxslippageheight:ShaderProgram) {


    //////////////////////////////////////////////////////////////////
    //rain precipitation
    //0---use hight map to derive hight map : hight map -----> hight map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);

    renderer.clear();
    rains.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,rains.prog,"readTerrain"),0);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,rains.prog,'raindeg'),controls.RainDegree);

    renderer.render(camera,rains,[square]);


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //swap terrain tex-----------------------------------------------
    texturePool.swapTerrainTextures();
    //swap terrain tex-----------------------------------------------


    //////////////////////////////////////////////////////////////////
    //1---use hight map to derive flux map : hight map -----> flux map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_flux_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);

    renderer.clear();
    shader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,shader.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,shader.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,shader.prog,"readSedi"),2);

    renderer.render(camera,shader,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);



    //-----swap flux ping and pong
    texturePool.swapFluxTextures();
    //-----swap flux ping and pong

    //////////////////////////////////////////////////////////////////
    //2---use flux map and hight map to derive velocity map and new hight map :
    // hight map + flux map -----> velocity map + hight map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,texturePool.write_vel_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0,gl_context.COLOR_ATTACHMENT1]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);

    renderer.clear();
    waterhight.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,waterhight.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,waterhight.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,waterhight.prog,"readSedi"),2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,waterhight.prog,"readVel"),3);



    renderer.render(camera,waterhight,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //-----swap terrain ping and pong and velocity ping pong
    texturePool.swapTerrainTextures();
    texturePool.swapVelTextures();
    //-----swap terrain ping and pong and velocity ping pong


    // //////////////////////////////////////////////////////////////////
    // // experimental pass : self advection of velocity (potentially flux) to bring about momentum
    // // ideally :
    // // velocity map + (flux optional) ----> velocity map + (flux optional)
    // //////////////////////////////////////////////////////////////////
    //
    //
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_vel_tex,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);
    //
    // gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);
    //
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if(status !== gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER)){
    //     console.log("frame buffer status" + status.toString());
    // }
    //
    // gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    // gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);
    //
    // gl_context.viewport(0, 0, simres, simres);
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
    //
    // renderer.clear();
    // veladvect.use();
    //
    // gl_context.activeTexture(gl_context.TEXTURE0);
    // gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_vel_tex);
    // gl_context.uniform1i(getCachedUniformLocation(gl_context,veladvect.prog,"readVel"),0);
    //
    // renderer.render(camera,veladvect,[square]);
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    //
    // //-----swap velocity ping pong
    //
    // tmp = texturePool.read_vel_tex;
    // texturePool.read_vel_tex = texturePool.write_vel_tex;
    // texturePool.write_vel_tex = tmp;
    //
    // //-----swap velocity ping pong

    //////////////////////////////////////////////////////////////////
    //3---use velocity map, sediment map and hight map to derive sediment map and new hight map and velocity map :
    // hight map + velocity map + sediment map -----> sediment map + hight map + terrain normal map + velocity map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,texturePool.write_sediment_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,texturePool.terrain_nor,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,texturePool.write_vel_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0,gl_context.COLOR_ATTACHMENT1,gl_context.COLOR_ATTACHMENT2, gl_context.COLOR_ATTACHMENT3]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);

    renderer.clear();
    sedi.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,sedi.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,sedi.prog,"readVelocity"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,sedi.prog,"readSediment"),2);

    renderer.render(camera,sedi,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //----------swap terrain and sediment map---------
    texturePool.swapSedimentTextures();
    texturePool.swapTerrainTextures();
    texturePool.swapVelTextures();
    //----------swap terrain and sediment map---------



    //////////////////////////////////////////////////////////////////
    // semi-lagrangian advection for sediment transportation
    // 4---use velocity map, sediment map to derive new sediment map :
    // velocity map + sediment map -----> sediment map
    //////////////////////////////////////////////////////////////////
    if(controls.AdvectionMethod == 1) {
        //4.1  first subpass writing to the intermidiate sediment advection texture a
        {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.sediment_advect_a, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, texturePool.write_vel_tex, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, texturePool.write_sediment_blend, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, texturePool.render_buffer);

            gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, appContext.simulationState.simres, appContext.simulationState.simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);


            renderer.clear();
            advect.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_vel_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_blend);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sediBlend"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_terrain_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "terrain"), 3);

            advect.setFloat(1, "unif_advectMultiplier");

            renderer.render(camera, advect, [square]);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

        }
        //4.2  second subpass writing to the intermidiate sediment advection texture b using a
        {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.sediment_advect_b, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, texturePool.write_vel_tex, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, texturePool.write_sediment_blend, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, texturePool.render_buffer);

            gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, appContext.simulationState.simres, appContext.simulationState.simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);


            renderer.clear();
            advect.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_vel_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.sediment_advect_a);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_blend);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sediBlend"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_terrain_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "terrain"), 3);

            advect.setFloat(-1, "unif_advectMultiplier");

            renderer.render(camera, advect, [square]);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

        }
        //4.3 thrid subpass : mac cormack advection writing to actual sediment using intermidiate advection textures
        {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.write_sediment_tex, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, texturePool.render_buffer);

            gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, appContext.simulationState.simres, appContext.simulationState.simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);


            renderer.clear();
            macCormack.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_vel_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,macCormack.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,macCormack.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.sediment_advect_a);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,macCormack.prog, "sediadvecta"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.sediment_advect_b);
            gl_context.uniform1i(getCachedUniformLocation(gl_context,macCormack.prog, "sediadvectb"), 3);


            renderer.render(camera, macCormack, [square]);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

        }

    }else{
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.write_sediment_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, texturePool.write_vel_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, texturePool.write_sediment_blend, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, texturePool.render_buffer);

        gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

        // Removed expensive checkFramebufferStatus call for performance
        // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
        // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        //     console.log("frame buffer status:" + status.toString());
        // }

        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

        gl_context.viewport(0, 0, appContext.simulationState.simres, appContext.simulationState.simres);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);


        renderer.clear();
        advect.use();
        gl_context.activeTexture(gl_context.TEXTURE0);
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_vel_tex);
        gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "vel"), 0);

        gl_context.activeTexture(gl_context.TEXTURE1);
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
        gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sedi"), 1);

        gl_context.activeTexture(gl_context.TEXTURE2);
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_blend);
        gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "sediBlend"), 2);

        gl_context.activeTexture(gl_context.TEXTURE3);
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_terrain_tex);
        gl_context.uniform1i(getCachedUniformLocation(gl_context,advect.prog, "terrain"), 3);

        advect.setFloat(1, "unif_advectMultiplier");

        renderer.render(camera, advect, [square]);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    }
    //----------swap sediment map---------
    texturePool.swapSedimentBlendTextures();
    texturePool.swapSedimentTextures();
    texturePool.swapVelTextures();
    //----------swap sediment map---------

    //////////////////////////////////////////////////////////////////
    // maxslippage map generation
    // 4.5---use terrain map to derive new maxslippage map :
    // hight map -----> max slippage  map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_maxslippage_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);


    renderer.clear();
    maxslippageheight.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,maxslippageheight.prog,"readTerrain"),0);



    renderer.render(camera,maxslippageheight,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------------------------
    //swap maxslippage maps
    texturePool.swapMaxSlippageTextures();
    //--------------------------------


    //////////////////////////////////////////////////////////////////
    // thermal terrain flux map generation
    // 5---use velocity map, sediment map to derive new sediment map :
    // hight map -----> terrain flux map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_flux_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);


    renderer.clear();
    thermalterrainflux.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i( getCachedUniformLocation(gl_context,thermalterrainflux.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_maxslippage_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,thermalterrainflux.prog,"readMaxSlippage"),1);


    renderer.render(camera,thermalterrainflux,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    //---------------------------------
    //swap terrain flux maps
    texturePool.swapTerrainFluxTextures();


    //////////////////////////////////////////////////////////////////
    // thermal erosion apply
    // 6---use terrain flux map to derive new terrain map :
    // terrain flux map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);


    renderer.clear();
    thermalapply.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,thermalapply.prog,"readTerrainFlux"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,thermalapply.prog,"readTerrain"),1);


    renderer.render(camera,thermalapply,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------swap terrain mao----------------------------
    texturePool.swapTerrainTextures();
    //////////////////////////////////////////////////////////////////
    // water level evaporation at end of each iteration
    // 7---use terrain map to derive new terrain map :
    // terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);

    renderer.clear();
    eva.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,eva.prog,"terrain"),0);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,eva.prog,'evapod'),controls.EvaporationConstant);

    renderer.render(camera,eva,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------swap terrain mao----------------------------
    texturePool.swapTerrainTextures();
    //---------------swap terrain mao----------------------------

    //////////////////////////////////////////////////////////////////
    // final average step : average terrain to avoid extremly sharp ridges or ravines
    // 6---use terrain map to derive new terrain map :
    //  terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,texturePool.terrain_nor,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0,gl_context.COLOR_ATTACHMENT1]);

    // Removed expensive checkFramebufferStatus call for performance
    // Only enable in debug builds if needed
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //     console.log( "frame buffer status:" + status.toString());
    // }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);
    gl_context.viewport(0,0,appContext.simulationState.simres,appContext.simulationState.simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.frame_buffer);
    renderer.clear();
    ave.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,ave.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,ave.prog,"readSedi"),1);

    renderer.render(camera,ave,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    //---------------swap terrain mao----------------------------
    texturePool.swapTerrainTextures();
    //---------------swap terrain mao----------------------------
}

// Texture management functions are now imported from simulation/texture-management.ts



function SimulationStep(curstep:number,
                        flow:ShaderProgram,
                        waterhight : ShaderProgram,
                        veladvect : ShaderProgram,
                        sediment : ShaderProgram,
                        advect:ShaderProgram,
                        macCormack : ShaderProgram,
                        rains:ShaderProgram,
                        evapo:ShaderProgram,
                        average:ShaderProgram,
                        thermalterrainflux:ShaderProgram,
                        thermalapply:ShaderProgram,
                        maxslippageheight : ShaderProgram,
                        renderer:OpenGLRenderer,
                        gl_context:WebGL2RenderingContext,camera:Camera){
    if(appContext.simulationState.pauseGeneration) return true;
    else{
        SimulatePerStep(renderer,
            gl_context,camera,flow,waterhight,veladvect,sediment,advect, macCormack,rains,evapo,average,thermalterrainflux,thermalapply, maxslippageheight);
    }
    return false;
}

// Unified coordinate normalization function
// Converts viewport coordinates (clientX/clientY) to canvas-relative normalized coordinates [0, 1]
function normalizeMousePosition(canvas: HTMLCanvasElement, clientX: number, clientY: number): {x: number, y: number} {
    if (!canvas) {
        return {x: 0, y: 0};
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return {x: 0, y: 0};
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return {x, y};
}

function handleInteraction (buttons : number, x : number, y : number){
    // mouseChange provides element-local coordinates (relative to canvas)
    // NOTE: This function may be interfering with pointer events
    // Disabled to prevent coordinate conflicts - pointer events handle mouse position directly
    // const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    // if (canvas) {
    //     const rect = canvas.getBoundingClientRect();
    //     if (rect.width > 0 && rect.height > 0) {
    //         setLastMousePosition(rect.left + x, rect.top + y);
    //     }
    // }
    //console.log(x + ' ' + y);
}

// Controls configuration - can be changed at runtime if needed
// controlsConfig will be loaded from settings in main() function
let controlsConfig: ControlsConfig;

async function main() {

  // Create application context with state holders (composition root)
  appContext = createApp();

  // Terrain scene service: loadScene, reset, setTerrainRandom (stable actions for createControls)
  terrainSceneService = new TerrainSceneService(appContext, {
    terrainRandom,
    getTerrainGeneratorCompute: () => terrainGeneratorCompute,
  });
  const loadSceneImpl = (gl: WebGL2RenderingContext) => {
    square = new Square(gl, vec3.fromValues(0, 0, 0));
    square.create();
    plane = new Plane(gl, vec3.fromValues(0, 0, 0), vec2.fromValues(1, 1), 18);
    plane.create();
    waterPlane = new Plane(gl, vec3.fromValues(0, 0, 0), vec2.fromValues(1, 1), 18);
    waterPlane.create();
  };
  terrainSceneService.setLoadSceneImpl(loadSceneImpl);
  terrainGeometryUpdater = new TerrainGeometryUpdater(appContext.terrainState, appContext.simulationState);

  // Create texture pool (gl_context will be set below)
  texturePool = new LegacyTexturePool(null as any, appContext.simulationState.simres, appContext.configHolder.shadowMapResolution);

  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);

  // get canvas
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  
  // Get WebGL2 context for rendering (Phase 3: rendering still uses WebGL2, simulation uses WebGPU)
  gl_context = <WebGL2RenderingContext> canvas.getContext('webgl2');
  
  if (!gl_context) {
    alert('WebGL 2 not supported! The application requires WebGL2 for rendering.');
    return; // Exit early - rendering cannot work without WebGL2
  }
  
  // Check WebGPU capability - REQUIRED for simulation (no fallback)
  const webgpuCapability = await checkWebGPUSupport();
  
  if (!webgpuCapability.supported) {
    alert('WebGPU not supported! The application requires WebGPU for simulation. Reason: ' + (webgpuCapability.fallbackReason || 'Unknown'));
    return; // Exit early - simulation requires WebGPU
  }
  
  console.log('[WebGPU] WebGPU available - using for simulation compute shaders');
  
  // Set client dimensions regardless of context availability
  appContext.simulationState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  appContext.clientState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  
  if (gl_context) {
    appContext.simulationState.setGlContext(gl_context);
    // Update texture pool with gl context
    texturePool = new LegacyTexturePool(gl_context, appContext.simulationState.simres, appContext.configHolder.shadowMapResolution);
  }
  
  // Declare WebGPU variables early (before try block)
  let webgpuDevice: GPUDevice | null = null;
  let webgpuComputePipeline: ComputeNodePipeline | null = null;
  let webgpuTexturePool: WebGPUTexturePool | null = null;

  // Initialize WebGPU compute pipeline and texture pool (REQUIRED - no fallback)
  try {
    // Get WebGPU device directly (not through renderer wrapper)
    // WebGL2 needs the canvas for rendering, so we get WebGPU device separately for compute
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    webgpuDevice = await adapter.requestDevice();
    if (!webgpuDevice) {
      throw new Error('Failed to get WebGPU device');
    }

    webgpuComputePipeline = new ComputeNodePipeline(webgpuDevice);
    webgpuTexturePool = new WebGPUTexturePool(webgpuDevice, appContext.simulationState.simres, appContext.configHolder.shadowMapResolution);
    webgpuTexturePool.setup();

    // Initialize terrain generator compute pipeline
    terrainGeneratorCompute = new TerrainGeneratorCompute(webgpuDevice);
    await terrainGeneratorCompute.initialize();
    terrainGeneratorCompute.setRandomSeed(); // Set initial random seed

    console.log('[WebGPU] Compute pipeline, texture pool, and terrain generator initialized');
  } catch (error) {
    console.error('[WebGPU] Failed to initialize compute pipeline:', error);
    alert('Failed to initialize WebGPU compute pipeline. The application cannot run.');
    return; // Exit early - simulation requires WebGPU
  }

  // Build controls with stable actions before GUI binds (no reassignment after setupGUI)
  let controllersRef: GUIControllers | null = null;
  const getControlsForLoader = () => controls;
  const setTerrainBaseType = (value: number) => {
    controls.TerrainBaseType = value;
    controllersRef?.terrainBaseTypeController?.setValue(value);
  };
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(
    gl_context,
    appContext.simulationState,
    texturePool,
    getControlsForLoader,
    { setTerrainBaseType }
  );
  const resetErosionParameters = (c: IAppControls) => {
    c.Kc = 0.06;
    c.Ks = 0.036;
    c.Kd = 0.006;
    c.ErosionMode = 0;
    c.EvaporationConstant = 0.003;
    c.VelocityMultiplier = 1;
    c.VelocityAdvectionMag = 0.2;
    c.AdvectionMethod = 1;
    c.RainErosion = false;
    c.RainErosionStrength = 0.2;
    c.RainErosionDropSize = 2.0;
    const erosionControllers = (window as any).erosionControllers;
    if (erosionControllers) {
      erosionControllers.kcController.updateDisplay();
      erosionControllers.ksController.updateDisplay();
      erosionControllers.kdController.updateDisplay();
      erosionControllers.erosionModeController.updateDisplay();
      erosionControllers.evaporationController.updateDisplay();
      erosionControllers.velocityMultiplierController.updateDisplay();
      erosionControllers.velocityAdvectionController.updateDisplay();
      erosionControllers.advectionMethodController.updateDisplay();
      erosionControllers.rainErosionController.updateDisplay();
      erosionControllers.rainErosionStrengthController.updateDisplay();
      erosionControllers.rainErosionDropSizeController.updateDisplay();
    }
  };
  const getControls = () => controls;
  const actions: ControlsActions = {
    loadScene: () => terrainSceneService.loadScene(),
    pauseResume: StartGeneration,
    generateTerrain: () => terrainSceneService.reset(getControls()),
    setTerrainRandom: () => terrainSceneService.setTerrainRandom(getControls()),
    importHeightMap: loadHeightMap,
    clearHeightMap,
    exportHeightMap,
    resetErosionParameters
  };
  controls = createControls(appContext, actions);
  const { gui, controllers } = setupGUI(controls);
  const { brushTypeController, brushSizeController, brushStrengthController, brushOperationController } = controllers;
  controllersRef = controllers;

  // Load settings (from localStorage or defaults) - must be done before creating event handlers
  controlsConfig = loadSettings();
  
  // Apply raycast method from settings
  controls.raycastMethod = controlsConfig.raycast.method;
  
  // Heightfield raycasting uses the CPU heightmap buffer
  
  // Create camera first (needed for event handlers)
  const brushUsesLeftClickForCamera = controlsConfig.mouse.brushActivate === 'LEFT' || 
                                       (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  const camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClickForCamera);
  
  // Store terrainState in controls for event handlers to access
  (controls as any).terrainState = appContext.terrainState;
  
  // Create event handlers (must be done after controlsConfig and camera are loaded)
  const eventHandlers = createEventHandlers(controls, controlsConfig, camera, appContext.simulationState);
  const { onKeyDown, onKeyUp, onMouseDown, onMouseUp } = eventHandlers;

  // Disabled mouseChange to prevent coordinate conflicts with pointer events
  // Pointer events now handle all mouse position tracking directly
  // mouseChange(canvas, handleInteraction);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
  
  // Note: controlsConfig will be loaded in main() before event listeners are set up
  window.addEventListener('pointerdown', (e) => {
    const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][e.button];
    // Check if target is canvas or contains canvas
    const target = e.target as HTMLElement;
    const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
    if (isCanvas) {
      // Always update mouse position when clicking on canvas (needed for accurate brush positioning)
      appContext.simulationState.setLastMousePosition(e.clientX, e.clientY);
      appContext.clientState.setLastMousePosition(e.clientX, e.clientY);
      
      // Check if this is a brush action BEFORE calling handler
      const action = getMouseButtonAction(e.button, controlsConfig);
      if (action === 'brushActivate') {
        // Stop propagation IMMEDIATELY to prevent OrbitControls from seeing it
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        // Now call our handler
        onMouseDown(e);
        return;
      }
    }
  }, true);
  window.addEventListener('pointerup', (e) => {
    const target = e.target as HTMLElement;
    if (target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas) {
      const action = getMouseButtonAction(e.button, controlsConfig);
      if (action === 'brushActivate') {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        onMouseUp(e);
      }
    }
  }, true);
  
  // Handle pointermove to update brush position (both when active and for preview)
  window.addEventListener('pointermove', (e) => {
    const target = e.target as HTMLElement;
    const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
    if (isCanvas) {
      // Always update mouse position for ray casting (needed for brush preview circle)
      // Store client coordinates directly
      appContext.simulationState.setLastMousePosition(e.clientX, e.clientY);
      appContext.clientState.setLastMousePosition(e.clientX, e.clientY);
      
      // Only check modifier state when brush is actively pressed
      if (controls.brushPressed === 1) {
        // Continuously check modifier state while brush is active
        const invertModifier = controlsConfig.modifiers.brushInvert;
        if (invertModifier) {
          const modifierPressed = isModifierPressed(invertModifier, e);
          
          if (modifierPressed && getOriginalBrushOperation() === null) {
            // Modifier is pressed but operation not inverted yet - invert it
            setOriginalBrushOperation(controls.brushOperation);
            controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
          } else if (!modifierPressed && getOriginalBrushOperation() !== null) {
            // Modifier released - restore original operation
            const original = getOriginalBrushOperation();
            if (original !== null) {
                controls.brushOperation = original;
                setOriginalBrushOperation(null);
            }
          }
        }
      }
    }
  }, true);
  
  // Handle pointercancel to deactivate brush if pointer is lost
  window.addEventListener('pointercancel', (e) => {
    if (controls.brushPressed === 1) {
      controls.brushPressed = 0;
    }
  }, true);
  
  // Handle wheel events for brush size adjustment (configurable modifier + Scroll)
  // Attach to canvas in capture phase to intercept before OrbitControls
  canvas.addEventListener('wheel', (e) => {
    const scrollModifier = controlsConfig.modifiers.brushSizeScroll;
    if (!scrollModifier) {
      // Brush size scroll is disabled, let OrbitControls handle all scroll events
      return;
    }
    
    // Check if the configured modifier is pressed
      const modifierPressed = isModifierPressed(scrollModifier, e);
    
    if (modifierPressed) {
      // Prevent default zoom behavior so OrbitControls doesn't zoom
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Adjust brush size based on scroll direction with very fine granularity
      // deltaY > 0 means scrolling down (decrease size), < 0 means scrolling up (increase size)
      const scrollDelta = e.deltaY;
      const sizeChange = scrollDelta * 0.002; // Even more granular: 0.002 per scroll unit (reduced from 0.01)
      const newSize = controls.brushSize - sizeChange; // Invert because scroll down should decrease
      
      // Clamp to valid range (0.1 to 20.0) and round to 2 decimal places for cleaner values
      controls.brushSize = Math.round(Math.max(0.1, Math.min(20.0, newSize)) * 100) / 100;
      
      // Force dat-gui controller to update the display
      const brushSizeController = (window as any).brushSizeController;
      if (brushSizeController) {
        brushSizeController.updateDisplay();
      }
      
      // Update brush palette slider and label
      const brushPalette = (window as any).brushPalette;
      if (brushPalette) {
        updatePaletteSelection(brushPalette, controls);
      }
    }
    // If modifier is not pressed, do nothing - let OrbitControls handle zoom normally
  }, { capture: true, passive: false }); // capture: true to intercept before OrbitControls, passive: false allows preventDefault

  // Check WebGL2 context availability (already checked above, but verify here)
  if (!gl_context) {
    // This should not happen if we got here, but double-check
    console.error('[WebGL] WebGL2 context is null - some features may not work');
  } else {
    var extensions = gl_context.getSupportedExtensions();
    // for(let e in extensions){
    // //   console.log(e);
      
    // }
    if (!gl_context.getExtension('OES_texture_float_linear')) {
      console.warn('[WebGL] OES_texture_float_linear not supported; float texture filtering may be limited.');
    }
    if (!gl_context.getExtension('OES_texture_float')) {
      console.warn('[WebGL] OES_texture_float not supported; simulation may use half-float or be limited.');
    }
    if (!gl_context.getExtension('EXT_color_buffer_float')) {
      console.warn('[WebGL] EXT_color_buffer_float not supported; rendering to float textures may be limited.');
    }
    // `setGL` is a function imported above which sets the value of `gl_context` in the `globals.ts` module.
    // Later, we can import `gl_context` from `globals.ts` to access it
    setGL(gl_context);
  }

  // Initial call to load scene
  terrainSceneService.loadScene();

  // Camera is already created above, just check brushUsesLeftClick here for reference
  const brushUsesLeftClick = controlsConfig.mouse.brushActivate === 'LEFT' || 
                             (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  
  // Create renderer - use WebGL2 for rendering (WebGPU rendering will be Phase 4+)
  let renderer: OpenGLRenderer | null = null;
  
  // Note: webgpuDevice, webgpuComputePipeline, and webgpuTexturePool are declared above (line 1105-1107)
  
  if (gl_context) {
    // WebGL2 path: traditional rendering
    console.log('[main] Using WebGL2 renderer');
    renderer = new OpenGLRenderer(canvas, gl_context);
    renderer.setClearColor(0.0, 0.0, 0.0, 0);
    gl_context.enable(gl_context.DEPTH_TEST);
  } else {
    // Neither available
    console.error('[main] WebGL2 required for rendering. Cannot proceed.');
    return;
  }

  // WebGL2-specific setup (texture pool, shaders)
  let lambert: any, flat: any, flow: any, waterhight: any, sediment: any, sediadvect: any, macCormack: any;
  let rains: any, evaporation: any, average: any, clean: any, water: any, thermalterrainflux: any;
  let thermalapply: any, maxslippageheight: any, shadowMapShader: any, sceneDepthShader: any;
  let combinedShader: any, bilateralBlur: any, veladvect: any;
  
  if (renderer && gl_context) {
    texturePool.setup();
    
    // Create all shaders
    const shaders = createShaders(gl_context);
    ({
        lambert, flat, flow, waterhight, sediment, sediadvect, macCormack,
        rains, evaporation, average, clean, water, thermalterrainflux,
        thermalapply, maxslippageheight, shadowMapShader, sceneDepthShader,
        combinedShader, bilateralBlur, veladvect
    } = shaders);
    noiseterrain = shaders.noiseterrain;
    terrainSceneService.setTerrainRandom(controls);
  } else {
    // WebGL2 context not available - cannot proceed without it
    console.error('[main] WebGL2 context required for terrain rendering. WebGPU path will be implemented in Phase 3.');
  }

    let timer = 0;
    const currentBrushState = {
        mouseWorldPos: [0, 0, 0, 0] as [number, number, number, number],
        mouseWorldDir: [0, 0, 0] as [number, number, number],
        brushPos: [0, 0] as [number, number],
    };
    let simRunner: WebGPUSimulationRunner | null = null;
    if (webgpuComputePipeline && webgpuTexturePool) {
        simRunner = new WebGPUSimulationRunner(
            webgpuComputePipeline,
            webgpuTexturePool,
            appContext,
            getControls,
            () => timer,
            () => currentBrushState
        );
    }
    function cleanUpTextures(){
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_terrain_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_vel_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_flux_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_terrain_flux_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_terrain_flux_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_maxslippage_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_maxslippage_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_sediment_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_terrain_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_vel_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_flux_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_sediment_tex, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.terrain_nor, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.read_sediment_blend, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.write_sediment_blend, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.sediment_advect_a, square, noiseterrain, appContext.simulationState.simres, texturePool);
        Render2Texture(renderer, gl_context, camera, clean, texturePool.sediment_advect_b, square, noiseterrain, appContext.simulationState.simres, texturePool);
    }

    // rayCast is now imported from utils/raycast.ts

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
  
  // Reusable arrays for water sources (reused instead of creating new ones)
  const reusableSourcePositions = new Float32Array(MAX_WATER_SOURCES * 2);
  const reusableSourceSizes = new Float32Array(MAX_WATER_SOURCES);
  const reusableSourceStrengths = new Float32Array(MAX_WATER_SOURCES);

  // Track brush state transitions for heightmap readback
  let lastBrushPressed = 0;
  let lastReadMouseX = -1;
  let lastReadMouseY = -1;
  // Request one initial WebGPU readback so heightMapCpuBuf is populated for brush raycasting
  let initialWebGPUReadbackRequested = false;

  function tick() {
    stats.begin();
    
    // WebGL2 render path (normal terrain pipeline)
    if (!renderer || !gl_context) {
      requestAnimationFrame(tick);
      return;
    }

    // Update camera before raycasting so matrices are in sync with rendered view
    camera.update(controlsConfig.camera);

    // ================ ray casting ===================
    //===================================================
    const normalizedMouse = normalizeMousePosition(canvas, appContext.simulationState.lastX, appContext.simulationState.lastY);
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
        gl_context.uniform1i(getCachedUniformLocation(gl_context,noiseterrain.prog,"u_terrainBaseType"),controls.TerrainBaseType);
        gl_context.uniform2fv(getCachedUniformLocation(gl_context,noiseterrain.prog,"u_TerrainSeedOffset"), terrainRandom.seedOffset);
        gl_context.uniform2fv(getCachedUniformLocation(gl_context,noiseterrain.prog,"u_DuneDir"), terrainRandom.duneDir);
        gl_context.uniform1f(getCachedUniformLocation(gl_context,noiseterrain.prog,"u_CraterDensity"), terrainRandom.craterDensity);
        gl_context.uniform1f(getCachedUniformLocation(gl_context,noiseterrain.prog,"u_CanyonDepth"), terrainRandom.canyonDepth);
    }


    if (appContext.simulationState.terrainGeometryDirty) {
        // Clear dirty immediately so we only run the pipeline once per "request"
        // (prevents double generation when tick runs again before the async callback completes)
        appContext.simulationState.setTerrainGeometryDirty(false);

        const loadingOverlay = document.getElementById('terrain-loading-overlay');
        const progressText = document.getElementById('loading-progress-text');
        const progressBar = document.getElementById('loading-progress-bar');

        // Check if a build is already in progress - if so, don't reset the UI
        const buildInProgress = appContext.terrainState.terrainBVHBuildInProgress || (loadingOverlay && loadingOverlay.classList.contains('visible'));

        if (buildInProgress) {
            // Still need to process the loading, but don't reset UI
        } else {
            if (loadingOverlay) {
                loadingOverlay.classList.add('visible');
                // Force initial render of overlay
                void loadingOverlay.offsetHeight;
            } else {
                console.warn('[Loading] Overlay element not found!');
            }
            
            // Initialize progress bar to 0% to ensure it's visible
            if (progressBar) {
                progressBar.style.width = '0%';
                void progressBar.offsetHeight; // Force reflow
            } else {
                console.warn('[Loading] Progress bar element not found!');
            }
            if (progressText) {
                progressText.textContent = 'Initializing...';
            } else {
                console.warn('[Loading] Progress text element not found!');
            }
        }
        
        // Create progress tracker with UI update callback
        const progressTracker = new LoadProgressTracker((progress, phase) => {
            const progressPercent = progress * 100;

            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
                // Force a reflow to ensure the browser renders the update
                void progressBar.offsetHeight;
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
            } else {
                console.warn('[Loading] Progress text not available in callback!');
            }
        });
        
        // Use requestAnimationFrame to ensure overlay is rendered before blocking operations
        requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
                // Handle resolution change if needed (must happen before texture cleanup)
                const resolutionChanged = controls.SimulationResolution != appContext.simulationState.simres;
                if(resolutionChanged){
                    const oldRes = appContext.simulationState.simres;
                    let newRes = Number(controls.SimulationResolution); // Ensure it's a number, not a string
                    const maxHybridSimRes = 1024;
                    if (newRes > maxHybridSimRes) {
                        console.warn(`[Loading] Requested simres ${newRes} exceeds hybrid limit ${maxHybridSimRes}. Clamping to ${maxHybridSimRes} to avoid GPU context loss.`);
                        newRes = maxHybridSimRes;
                        controls.SimulationResolution = maxHybridSimRes;
                        if (controllers.simulationResolutionController) {
                            controllers.simulationResolutionController.setValue(maxHybridSimRes);
                        }
                    }
                    console.log(`[Loading] Resolution change detected: ${oldRes} -> ${newRes}`);
                    appContext.simulationState.setSimRes(newRes);
                    if (texturePool) {
                        texturePool.resizeTextures4Simulation(newRes);
                    }
                    if (webgpuTexturePool) {
                        webgpuTexturePool.resizeSimulationTextures(newRes);
                    }
                    appContext.simulationState.resizeHeightMapCpuBuf(newRes); // Resize the CPU buffer to match new resolution
                    
                    // Clear old BVH and geometry when resolution changes (they're invalid for new resolution)
                    if (appContext.terrainState.terrainBVH) {
                        appContext.terrainState.setTerrainBVH(null);
                    }
                    if (appContext.terrainState.terrainGeometry) {
                        appContext.terrainState.terrainGeometry?.dispose();
                        appContext.terrainState.setTerrainGeometry(null);
                    }
                    if (appContext.terrainState.terrainBVHBuildInProgress) {
                        appContext.terrainState.setTerrainBVHBuildInProgress(false);
                    }
                }
                
                //=============clean up all simulation textures===================
                cleanUpTextures();
                //=============recreate base terrain textures=====================

                // WebGPU compute terrain generation path
                if (terrainGeneratorCompute && webgpuTexturePool && webgpuDevice) {
                    progressTracker.startPhase(LoadPhase.GPU_UPLOAD);
                    progressTracker.updateSubPhaseProgress(0.0);

                    // Update terrain generator with current controls
                    terrainGeneratorCompute.updateParams(controls);
                    progressTracker.updateSubPhaseProgress(0.3);

                    // Generate terrain directly into WebGPU textures
                    terrainGeneratorCompute.generate(
                        webgpuTexturePool.readTerrainTexture,
                        webgpuTexturePool.writeTerrainTexture,
                        appContext.simulationState.simres
                    );

                    // Clear auxiliary textures (flux, velocity, sediment, etc.)
                    webgpuTexturePool.clearAuxiliaryTextures();
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.GPU_UPLOAD);

                    // Readback from WebGPU to CPU for BVH building
                    progressTracker.startPhase(LoadPhase.READBACK);
                    progressTracker.updateSubPhaseProgress(0.0);

                    // Async readback from WebGPU texture
                    await appContext.simulationState.readHeightmapFromWebGPU(
                        webgpuDevice,
                        webgpuTexturePool.readTerrainTexture
                    );

                    // Also seed legacy WebGL textures if available (for legacy rendering path)
                    if (texturePool && gl_context && texturePool.read_terrain_tex) {
                        const simres = appContext.simulationState.simres;
                        const cpuBuf = appContext.simulationState.heightMapCpuBuf;

                        // Upload CPU heightmap data to WebGL textures
                        for (const tex of [texturePool.read_terrain_tex, texturePool.write_terrain_tex]) {
                            if (!tex) continue;
                            gl_context.bindTexture(gl_context.TEXTURE_2D, tex);
                            gl_context.texImage2D(
                                gl_context.TEXTURE_2D, 0, gl_context.RGBA32F,
                                simres, simres, 0,
                                gl_context.RGBA, gl_context.FLOAT, cpuBuf
                            );
                        }
                        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
                    }

                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.READBACK);
                } else if (noiseterrain) {
                    // Legacy GLSL terrain generation fallback
                    progressTracker.startPhase(LoadPhase.GPU_UPLOAD);
                    progressTracker.updateSubPhaseProgress(0.0);
                    Render2Texture(renderer,gl_context,camera,noiseterrain,texturePool.read_terrain_tex,square,noiseterrain, appContext.simulationState.simres, texturePool);
                    progressTracker.updateSubPhaseProgress(0.5);
                    Render2Texture(renderer,gl_context,camera,noiseterrain,texturePool.write_terrain_tex,square,noiseterrain, appContext.simulationState.simres, texturePool);
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.GPU_UPLOAD);

                    // Readback phase
                    progressTracker.startPhase(LoadPhase.READBACK);
                    progressTracker.updateSubPhaseProgress(0.0);
                    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
                    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.read_terrain_tex, 0);
                    gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
                    progressTracker.updateSubPhaseProgress(0.5);
                    gl_context.readPixels(0, 0, appContext.simulationState.simres, appContext.simulationState.simres, gl_context.RGBA, gl_context.FLOAT, appContext.simulationState.heightMapCpuBuf);
                    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
                    if (webgpuTexturePool) {
                        webgpuTexturePool.seedTerrainFromHeightmap(appContext.simulationState.heightMapCpuBuf, true);
                    }
                    appContext.simulationState.setHeightMapBufIsFresh(true); // Mark buffer as fresh
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.READBACK);
                }

                //=============rebuild secondary terrain mesh and BVH for raycasting===================
                // Guard: Don't rebuild if BVH build is already in progress (prevents duplicate builds)
                // But allow rebuild if resolution changed (old BVH was cleared above)
                console.log('[BVH] Checking build conditions:', {
                    terrainBVH: !!appContext.terrainState.terrainBVH,
                    terrainBVHBuildInProgress: appContext.terrainState.terrainBVHBuildInProgress,
                    terrainGeometry: !!appContext.terrainState.terrainGeometry,
                    HightMapBufIsFresh: appContext.simulationState.heightMapBufIsFresh,
                    bufferLength: appContext.simulationState.heightMapCpuBuf?.length,
                    requiredLength: appContext.simulationState.simres * appContext.simulationState.simres * 4
                });
                
                if (appContext.terrainState.terrainBVHBuildInProgress) {
                    console.log('[BVH] BVH build already in progress, skipping duplicate build');
                    // Don't set TerrainGeometryDirty to false yet - wait for build to complete
                    // Don't hide overlay - it should stay visible until build completes
                    return;
                }
                
                // Only build BVH if buffer is fresh (just read after terrain generation)
                if (appContext.simulationState.heightMapBufIsFresh && appContext.simulationState.heightMapCpuBuf && appContext.simulationState.heightMapCpuBuf.length >= appContext.simulationState.simres * appContext.simulationState.simres * 4) {
                    let hasData = false;
                    const sampleCount = Math.min(100, appContext.simulationState.simres * appContext.simulationState.simres);
                    for (let i = 0; i < sampleCount; i++) {
                        const idx = Math.floor(Math.random() * appContext.simulationState.simres * appContext.simulationState.simres) * 4;
                        if (appContext.simulationState.heightMapCpuBuf[idx] !== 0) {
                            hasData = true;
                            break;
                        }
                    }
                    if (hasData) {
                        console.log('[BVH] Heightmap buffer has valid data, starting geometry and BVH build');
                        try {
                            appContext.terrainState.setTerrainBVHBuildInProgress(true);
                            appContext.simulationState.setTerrainGeometryDirty(false);
                            progressTracker.startPhase(LoadPhase.GEOMETRY);
                            progressTracker.startPhase(LoadPhase.BVH);
                            if (progressBar) {
                                progressBar.style.width = `70%`;
                                progressBar.offsetHeight;
                            }
                            requestAnimationFrame(() => {
                                terrainGeometryUpdater.update(appContext.simulationState.heightMapCpuBuf, appContext.simulationState.simres, 1.0);
                                progressTracker.updateSubPhaseProgress(1.0);
                                progressTracker.endPhase(LoadPhase.BVH);
                                progressTracker.endPhase(LoadPhase.GEOMETRY);
                                if (loadingOverlay) loadingOverlay.classList.remove('visible');
                            });
                        } catch (error) {
                            console.error('[BVH] Failed to build BVH:', error);
                            appContext.terrainState.setTerrainBVHBuildInProgress(false);
                            appContext.simulationState.setHeightMapBufIsFresh(false);
                            appContext.simulationState.setTerrainGeometryDirty(false);
                            if (loadingOverlay) loadingOverlay.classList.remove('visible');
                        }
                    } else {
                        console.log('[BVH] Heightmap buffer has no valid data');
                        appContext.simulationState.setHeightMapBufIsFresh(false); // Mark as consumed
                        appContext.simulationState.setTerrainGeometryDirty(true); // Retry on next tick
                        if (progressText) {
                            progressText.textContent = 'Waiting for valid heightmap data...';
                        }
                    }
                } else {
                    console.log('[BVH] Heightmap buffer not fresh yet, will build when available');
                    if (progressText) {
                        progressText.textContent = 'Waiting for heightmap readback...';
                    }
                    // Keep overlay visible and retry on next tick
                }
            });
        });
    }

    //ray cast happens here
    // Initialize to invalid values so we can detect misses
    reusablePos[0] = -10.0;
    reusablePos[1] = -10.0;
    
    
    // Toggle between heightmap and BVH raycast methods for A/B testing
    if (controls.raycastMethod === 'bvh' && appContext.terrainState.terrainBVH && appContext.terrainState.terrainGeometry) {
        // Use BVH raycast
        const hit = rayCastBVH(reusableRo, reusableDir, appContext.terrainState.terrainBVH!, appContext.terrainState.terrainGeometry!, reusablePos);
        if (!hit) {
            // Fallback to heightmap if BVH misses
            const heightmapPos = vec2.create();
            rayCast(reusableRo, reusableDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPos);
            reusablePos[0] = heightmapPos[0];
            reusablePos[1] = heightmapPos[1];
        }
    } else {
        // Use heightmap raycast (default)
        rayCast(reusableRo, reusableDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, reusablePos);
    }
    
    
    controls.posTemp = reusablePos;

    //===================per tick uniforms==================


    flat.setTime(timer);

    gl_context.uniform1f(getCachedUniformLocation(gl_context,flat.prog,"u_far"),camera.far);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,flat.prog,"u_near"),camera.near);
    reusableLightPos[0] = controls.lightPosX;
    reusableLightPos[1] = controls.lightPosY;
    reusableLightPos[2] = controls.lightPosZ;
    gl_context.uniform3fv(getCachedUniformLocation(gl_context,flat.prog,"unif_LightPos"), reusableLightPos);

    water.setWaterTransparency(controls.WaterTransparency);
    water.setSimres(appContext.simulationState.simres);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,water.prog,"u_far"),camera.far);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,water.prog,"u_near"),camera.near);
    gl_context.uniform3fv(getCachedUniformLocation(gl_context,water.prog,"unif_LightPos"), reusableLightPos);

    lambert.setTerrainDebug(controls.TerrainDebug);
    lambert.setMouseWorldPos(reusableMousePoint);
    lambert.setMouseWorldDir(reusableDir);
    lambert.setBrushSize(controls.brushSize);
    lambert.setBrushType(controls.brushType);
    lambert.setBrushPos(reusablePos);
    lambert.setSimres(appContext.simulationState.simres);
    lambert.setFloat(controls.SnowRange, "u_SnowRange");
    lambert.setFloat(controls.ForestRange, "u_ForestRange");
    lambert.setInt(controls.TerrainPlatte, "u_TerrainPlatte");
    lambert.setInt(controls.ShowFlowTrace ? 0 : 1,"u_FlowTrace");
    lambert.setInt(controls.SedimentTrace ? 0 : 1,"u_SedimentTrace");
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
    reusableLightPos[0] = controls.lightPosX;
    reusableLightPos[1] = controls.lightPosY;
    reusableLightPos[2] = controls.lightPosZ;
    gl_context.uniform3fv(getCachedUniformLocation(gl_context,lambert.prog,"unif_LightPos"), reusableLightPos);

    sceneDepthShader.setSimres(appContext.simulationState.simres);

    rains.setMouseWorldPos(reusableMousePoint);
    rains.setMouseWorldDir(reusableDir);
    rains.setBrushSize(controls.brushSize);
    rains.setBrushStrength(controls.brushStrenth);
    rains.setBrushType(controls.brushType);
    rains.setBrushPressed(controls.brushPressed);
    rains.setSimres(appContext.simulationState.simres);
    
    // Update brush state (flatten target height, slope end points, etc.)
        const brushContext: BrushContext = {
            controls: controls as BrushControls,
            controlsConfig: controlsConfig,
            simulationState: appContext.simulationState,
            terrainState: appContext.terrainState,
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
    gl_context.uniform1i(getCachedUniformLocation(gl_context,rains.prog,"u_RainErosion"),controls.RainErosion ? 1 : 0);
    rains.setFloat(controls.RainErosionStrength,'u_RainErosionStrength');
    rains.setFloat(controls.RainErosionDropSize,'u_RainErosionDropSize');

    flow.setPipeLen(controls.pipelen);
    flow.setSimres(appContext.simulationState.simres);
    flow.setTimestep(controls.timestep);
    flow.setPipeArea(controls.pipeAra);

    waterhight.setPipeLen(controls.pipelen);
    waterhight.setSimres(appContext.simulationState.simres);
    waterhight.setTimestep(controls.timestep);
    waterhight.setPipeArea(controls.pipeAra);
    waterhight.setFloat(controls.VelocityMultiplier, 'u_VelMult');
    waterhight.setFloat(controls.VelocityAdvectionMag, 'u_VelAdvMag');
    waterhight.setTime(timer);

    sediment.setSimres(appContext.simulationState.simres);
    sediment.setPipeLen(controls.pipelen);
    sediment.setKc(controls.Kc);
    sediment.setKs(controls.Ks);
    sediment.setKd(controls.Kd);
    sediment.setRockErosionResistance(controls.rockErosionResistance);
    sediment.setTimestep(controls.timestep);
    sediment.setTime(timer);

    sediadvect.setSimres(appContext.simulationState.simres);
    sediadvect.setPipeLen(controls.pipelen);
    sediadvect.setKc(controls.Kc);
    sediadvect.setKs(controls.Ks);
    sediadvect.setKd(controls.Kd);
    sediadvect.setTimestep(controls.timestep);
    sediadvect.setFloat(controls.AdvectionSpeedScaling, "unif_advectionSpeedScale");

    veladvect.setSimres(appContext.simulationState.simres);
    veladvect.setPipeLen(controls.pipelen);
    veladvect.setKc(controls.Kc);
    veladvect.setKs(controls.Ks);
    veladvect.setKd(controls.Kd);
    veladvect.setTimestep(controls.timestep);

    macCormack.setSimres(appContext.simulationState.simres);
    macCormack.setPipeLen(controls.pipelen);
    macCormack.setKc(controls.Kc);
    macCormack.setKs(controls.Ks);
    macCormack.setKd(controls.Kd);
    macCormack.setTimestep(controls.timestep);
    macCormack.setFloat(controls.AdvectionSpeedScaling, "unif_advectionSpeedScale");

    thermalterrainflux.setSimres(appContext.simulationState.simres);
    thermalterrainflux.setPipeLen(controls.pipelen);
    thermalterrainflux.setTimestep(controls.timestep);
    thermalterrainflux.setPipeArea(controls.pipeAra);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,thermalterrainflux.prog,"unif_thermalRate"),controls.thermalRate);

    thermalapply.setSimres(appContext.simulationState.simres);
    thermalapply.setPipeLen(controls.pipelen);
    thermalapply.setTimestep(controls.timestep);
    thermalapply.setPipeArea(controls.pipeAra);
    gl_context.uniform1f(getCachedUniformLocation(gl_context,thermalapply.prog,"unif_thermalErosionScale"),controls.thermalErosionScale);

    maxslippageheight.setSimres(appContext.simulationState.simres);
    maxslippageheight.setPipeLen(controls.pipelen);
    maxslippageheight.setTimestep(controls.timestep);
    maxslippageheight.setPipeArea(controls.pipeAra);
    maxslippageheight.setFloat(controls.thermalTalusAngleScale, "unif_TalusScale");
      if(controls.RainErosion){
          maxslippageheight.setInt(1, 'unif_rainMode');
      }else{
          maxslippageheight.setInt(0,'unif_rainMode');
      }

    average.setSimres(appContext.simulationState.simres);
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
    appContext.simulationState.incrementHeightMapBufCounter();
    stats.begin();

      //==========================  we begin simulation from now ===========================================

    // Use WebGPU compute pipeline (required - no WebGL2 fallback)
    if (!webgpuComputePipeline || !webgpuTexturePool || !webgpuDevice) {
        console.error('[WebGPU] WebGPU compute pipeline not available. Simulation cannot run.');
        requestAnimationFrame(tick);
        return;
    }
    
    if (!gl_context || !texturePool) {
        console.error('[WebGL] WebGL2 context or texture pool not available. Rendering cannot work.');
        requestAnimationFrame(tick);
        return;
    }

    // Request one initial WebGPU readback so heightMapCpuBuf is populated for brush raycasting.
    // Without this, brushPos stays (-10,-10) until the user moves the mouse (which triggers
    // shouldRead); by then the same-frame raycast already used stale buffer, so brushes do nothing.
    if (!initialWebGPUReadbackRequested) {
        initialWebGPUReadbackRequested = true;
        appContext.simulationState.readHeightmapFromWebGPU(webgpuDevice, webgpuTexturePool.readTerrainTexture)
            .then(() => {
                appContext.simulationState.setHeightMapBufIsFresh(true);
            })
            .catch((err) => {
                console.warn('[WebGPU] Initial heightmap readback failed:', err);
                initialWebGPUReadbackRequested = false; // allow retry
            });
    }

    // WebGPU simulation path - copy results to WebGL textures for rendering
    currentBrushState.mouseWorldPos[0] = reusableMousePoint[0];
    currentBrushState.mouseWorldPos[1] = reusableMousePoint[1];
    currentBrushState.mouseWorldPos[2] = reusableMousePoint[2];
    currentBrushState.mouseWorldPos[3] = reusableMousePoint[3];
    currentBrushState.mouseWorldDir[0] = reusableDir[0];
    currentBrushState.mouseWorldDir[1] = reusableDir[1];
    currentBrushState.mouseWorldDir[2] = reusableDir[2];
    currentBrushState.brushPos[0] = reusablePos[0];
    currentBrushState.brushPos[1] = reusablePos[1];

    for (let i = 0; i < controls.SimulationSpeed; i++) {
        if (simRunner) simRunner.step();
        appContext.simulationState.incrementSimFrameCount();
    }
    
    // Copy WebGPU simulation results to WebGL textures for rendering
    // This is temporary until rendering is also ported to WebGPU (Phase 4+)
    copyWebGPUTerrainToWebGL(webgpuDevice, webgpuTexturePool.readTerrainTexture, gl_context, texturePool.read_terrain_tex, appContext.simulationState.simres)
        .catch((error) => {
            console.error('[WebGPU] Failed to copy terrain texture to WebGL:', error);
        });
    
    // Only track update counter if BVH updates are enabled
    // This avoids unnecessary overhead when updates are disabled
    if (appContext.simulationState.enableBVHUpdates && controls.SimulationSpeed > 0 && !appContext.simulationState.pauseGeneration) {
        appContext.simulationState.incrementGeometryUpdateCounter();
    }

    const mouseMoved = (lastReadMouseX < 0 || lastReadMouseY < 0) ||
        (Math.abs(appContext.simulationState.lastX - lastReadMouseX) + Math.abs(appContext.simulationState.lastY - lastReadMouseY) > 1);
    
    // Trigger heightmap read for brush raycasting (and BVH updates)
    const shouldRead = (justPressed || mouseMoved) && appContext.configHolder.shouldReadHeightmap(brushPressed, brushVisible, appContext.simulationState.simres, appContext.simulationState.heightMapBufCounter);
    // Also read when brush is released to update BVH after brush stroke
    const shouldReadForBVH = appContext.simulationState.enableBVHUpdates && justReleased && appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH;
    
    if (shouldRead || shouldReadForBVH) {
        // Read full resolution for accurate raycasting
        // Note: This is throttled by shouldReadHeightmap to avoid blocking
        // WebGPU readback path (required - no WebGL2 fallback)
        if (!webgpuTexturePool || !webgpuDevice) {
            console.error('[WebGPU] Readback failed - WebGPU texture pool or device not available');
            return;
        }
        
        // Async readback - will mark as fresh when complete
        appContext.simulationState.readHeightmapFromWebGPU(webgpuDevice, webgpuTexturePool.readTerrainTexture)
            .then(() => {
                lastReadMouseX = appContext.simulationState.lastX;
                lastReadMouseY = appContext.simulationState.lastY;
                if (!brushPressed && !brushVisible && appContext.simulationState.heightMapBufCounter >= appContext.configHolder.maxHeightmapBufCounter) {
                    appContext.simulationState.resetHeightMapBufCounter();
                }
            })
            .catch((error) => {
                console.error('[WebGPU] Readback failed:', error);
            });
    }

    // ========== BVH Geometry Update Mechanism ==========
    // Periodically update terrain geometry and refit BVH to keep it synchronized with erosion
    // This avoids full BVH rebuilds (2+ seconds) by using fast refit operations (~50ms)
    // CRITICAL: Only updates when heightmap is already fresh (from brush raycasting)
    // This avoids expensive readPixels calls - we piggyback on existing heightmap reads
    // Also triggers immediately on brush release to update after terrain modifications
    // IMPORTANT: Updates are deferred to avoid blocking the render loop (BVH is not visible)
    const shouldUpdateNow = appContext.simulationState.enableBVHUpdates && appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH && !appContext.terrainState.terrainBVHBuildInProgress && appContext.simulationState.heightMapBufIsFresh;
    const updateTriggeredByBrush = justReleased; // Immediate update after brush stroke
    const updateTriggeredByInterval = appContext.simulationState.shouldUpdateGeometry(); // Periodic update during erosion
    
    if (shouldUpdateNow && (updateTriggeredByBrush || updateTriggeredByInterval)) {
        // Copy heightmap data to avoid race conditions (heightmap buffer might be overwritten)
        const heightmapCopy = new Float32Array(appContext.simulationState.heightMapCpuBuf);
        
        // Clear fresh flag immediately (before async work) to prevent duplicate updates
        appContext.simulationState.setHeightMapBufIsFresh(false);
        
        // Defer the actual update work to avoid blocking the render loop
        // Since BVH is only used for raycasting (not rendering), we can update it asynchronously
        const performAsyncUpdate = () => {
            if (!appContext.terrainState.terrainGeometry || !appContext.terrainState.terrainBVH || appContext.terrainState.terrainBVHBuildInProgress) {
                return; // Safety check in case BVH was cleared during async delay
            }
            
            // Update geometry positions with copied heightmap
            updateTerrainGeometry(appContext.terrainState.terrainGeometry, appContext.simulationState.simres, heightmapCopy, 1.0);
            
            // Refit BVH bounding volumes to match updated geometry
            // This is much faster than a full rebuild (~50ms vs 2000-5000ms)
            appContext.terrainState.terrainBVH.refit();
            
            // Reset update tracking
            appContext.simulationState.resetGeometryUpdateCounter();
            appContext.simulationState.setGeometryNeedsUpdate(false);
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
    
    if (ENABLE_BVH_ACCURACY_TEST && appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH && appContext.simulationState.simFrameCount % BVH_TEST_INTERVAL === 0 && appContext.simulationState.simFrameCount > 0) {
        // Read heightmap if not already fresh
        if (!appContext.simulationState.heightMapBufIsFresh) {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.read_terrain_tex, 0);
            gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
            gl_context.readPixels(0, 0, appContext.simulationState.simres, appContext.simulationState.simres, gl_context.RGBA, gl_context.FLOAT, appContext.simulationState.heightMapCpuBuf);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        }
        
        // Test BVH raycast BEFORE geometry update
        const testRayOrigin = vec3.fromValues(0, 2, 0); // Ray from above terrain
        const testRayDir = vec3.fromValues(0, -1, 0); // Ray pointing down
        const bvhPosBefore = vec2.create();
        const heightmapPosBefore = vec2.create();
        const bvhHitBefore = rayCastBVH(testRayOrigin, testRayDir, appContext.terrainState.terrainBVH!, appContext.terrainState.terrainGeometry!, bvhPosBefore);
        rayCast(testRayOrigin, testRayDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPosBefore);
        
        // Measure performance: Update + Refit
        const updateStartTime = performance.now();
        updateTerrainGeometry(appContext.terrainState.terrainGeometry!, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, 1.0);
        const updateTime = performance.now() - updateStartTime;
        
        const refitStartTime = performance.now();
        // Refit BVH to update bounding volumes after geometry changes
        // Note: BVH stores references to geometry position buffer, so refit() recalculates bounding volumes
        appContext.terrainState.terrainBVH!.refit();
        const refitTime = performance.now() - refitStartTime;
        
        // Measure performance: Full rebuild (for comparison, but don't actually rebuild)
        // This would be: const rebuildStartTime = performance.now(); new MeshBVH(terrainGeometry); const rebuildTime = performance.now() - rebuildStartTime;
        // Skipping actual rebuild to avoid blocking, but documenting expected time
        
        // Test BVH raycast AFTER geometry update and refit
        const bvhPosAfter = vec2.create();
        const heightmapPosAfter = vec2.create();
        const bvhHitAfter = rayCastBVH(testRayOrigin, testRayDir, appContext.terrainState.terrainBVH!, appContext.terrainState.terrainGeometry!, bvhPosAfter);
        rayCast(testRayOrigin, testRayDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPosAfter);
        
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
            const bvhHit = rayCastBVH(testRay.origin, testRay.dir, appContext.terrainState.terrainBVH!, appContext.terrainState.terrainGeometry!, bvhPos);
            rayCast(testRay.origin, testRay.dir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPos);
            
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
        
        console.log('[BVH Accuracy Test] Frame:', appContext.simulationState.simFrameCount, 'Resolution:', appContext.simulationState.simres);
        console.log('  Steps since last update:', appContext.simulationState.geometryUpdateCounter);
        console.log('  Update interval:', appContext.simulationState.geometryUpdateInterval);
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

    gl_context.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();

    //========================== we enter a series of render pass from now ================================
    //========================== pass 1 : render shadow map pass=====================================


      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.shadowMap_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.shadowMap_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.shadowMap_render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

      // Removed expensive checkFramebufferStatus call for performance
      // let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
      // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
      //     console.log( "frame buffer status:" + status.toString());
      // }

      gl_context.bindTexture(gl_context.TEXTURE_2D,null);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
      gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

      gl_context.viewport(0,0,appContext.configHolder.shadowMapResolution,appContext.configHolder.shadowMapResolution);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.shadowMap_frame_buffer);
      renderer.clear();// clear when attached to shadow map
      shadowMapShader.use();

      gl_context.activeTexture(gl_context.TEXTURE0);
      gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
      gl_context.uniform1i(getCachedUniformLocation(gl_context,shadowMapShader.prog,"hightmap"),0);

      gl_context.activeTexture(gl_context.TEXTURE1);
      gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
      gl_context.uniform1i(getCachedUniformLocation(gl_context,shadowMapShader.prog, "sedimap"), 1);

      mat4.ortho(reusableLightProjMat, -1.6, 1.6, -1.6, 1.6, 0, 100);
      reusableLightPos[0] = controls.lightPosX;
      reusableLightPos[1] = controls.lightPosY;
      reusableLightPos[2] = controls.lightPosZ;
      mat4.lookAt(reusableLightViewMat, reusableLightPos, [0,0,0], [0,1,0]);

      gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,shadowMapShader.prog,'u_proj'),false,reusableLightProjMat);
      gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,shadowMapShader.prog,'u_view'),false,reusableLightViewMat);
      shadowMapShader.setSimres(appContext.simulationState.simres);

      renderer.render(camera,shadowMapShader,[plane]);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


      //=========================== pass 2 :  render scene depth tex ================================
      sceneDepthShader.use();
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.deferred_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.scene_depth_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.deferred_render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

      // Removed expensive checkFramebufferStatus call for performance
      // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
      // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
      //     console.log( "frame buffer status:" + status.toString());
      // }

      renderer.clear();// clear when attached to scene depth map
      gl_context.viewport(0,0,window.innerWidth, window.innerHeight);
      renderer.render(camera, sceneDepthShader, [
          plane,
      ]);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    //============================= pass 3 : render terrain and water geometry ================================================
    //============ terrain geometry =========
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.deferred_frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.color_pass_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,texturePool.color_pass_reflection_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.deferred_render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1]);

    // Removed expensive checkFramebufferStatus call for performance
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //   console.log( "frame buffer status:" + status.toString());
    // }
    renderer.clear();

    lambert.use();
    gl_context.viewport(0,0,window.innerWidth, window.innerHeight);
    //plane.setDrawMode(gl_context.LINE_STRIP);
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    let PingUniform = getCachedUniformLocation(gl_context,lambert.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.terrain_nor);
    let norUniform = getCachedUniformLocation(gl_context,lambert.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
    let sediUniform = getCachedUniformLocation(gl_context,lambert.prog, "sedimap");
    gl_context.uniform1i(sediUniform, 2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_vel_tex);
    let velUniform = getCachedUniformLocation(gl_context,lambert.prog, "velmap");
    gl_context.uniform1i(velUniform, 3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_flux_tex);
    let fluxUniform = getCachedUniformLocation(gl_context,lambert.prog, "fluxmap");
    gl_context.uniform1i(fluxUniform, 4);

    gl_context.activeTexture(gl_context.TEXTURE5);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_terrain_flux_tex);
    let terrainfluxUniform = getCachedUniformLocation(gl_context,lambert.prog, "terrainfluxmap");
    gl_context.uniform1i(terrainfluxUniform, 5);

    gl_context.activeTexture(gl_context.TEXTURE6);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_maxslippage_tex);
    let terrainslippageUniform = getCachedUniformLocation(gl_context,lambert.prog, "maxslippagemap");
    gl_context.uniform1i(terrainslippageUniform, 6);

    gl_context.activeTexture(gl_context.TEXTURE7);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_blend);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,lambert.prog, "sediBlend"), 7);


    gl_context.activeTexture(gl_context.TEXTURE8);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.shadowMap_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,lambert.prog, "shadowMap"), 8);

    gl_context.activeTexture(gl_context.TEXTURE9);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,lambert.prog, "sceneDepth"), 9);

    gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,lambert.prog,'u_sproj'),false,reusableLightProjMat);
    gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,lambert.prog,'u_sview'),false,reusableLightViewMat);


      renderer.render(camera, lambert, [
      plane,
    ]);

    // =============== water =====================
    gl_context.enable(gl_context.BLEND);
    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);
    water.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_terrain_tex);
    PingUniform = getCachedUniformLocation(gl_context,water.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.terrain_nor);
    norUniform = getCachedUniformLocation(gl_context,water.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.read_sediment_tex);
    sediUniform = getCachedUniformLocation(gl_context,water.prog,"sedimap");
    gl_context.uniform1i(sediUniform,2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,water.prog,"sceneDepth"),3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D,texturePool.color_pass_reflection_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,water.prog,"colorReflection"),4);


      renderer.render(camera, water, [
      plane,
    ]);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);


    // ======================== pass 4 : back ground & post processing & rayleigh mie scattering ==================================

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,texturePool.deferred_frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,texturePool.scatter_pass_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,texturePool.deferred_render_buffer);

    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    // Removed expensive checkFramebufferStatus call for performance
    // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
    //   console.log( "frame buffer status:" + status.toString());
    // }

    renderer.clear();// clear when attached to scene depth map
    gl_context.viewport(0,0,window.innerWidth, window.innerHeight);

    flat.use();

    gl_context.enable(gl_context.DEPTH_TEST);
    gl_context.depthFunc(gl_context.LESS);
    gl_context.enable(gl_context.BLEND);
    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,flat.prog,"hightmap"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,flat.prog,"sceneDepth"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.shadowMap_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,flat.prog,"shadowMap"),2);

    gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,flat.prog,'u_sproj'),false,reusableLightProjMat);
    gl_context.uniformMatrix4fv(getCachedUniformLocation(gl_context,flat.prog,'u_sview'),false,reusableLightViewMat);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,flat.prog,"u_showScattering"),controls.showScattering ? 1 : 0);

    renderer.render(camera, flat, [
      square,
    ]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);


    // ======================== pass 5 : bilateral blurring pass ==================================
      if(controls.enableBilateralBlur) {
          let NumBlurPass = 4;
          for (let i = 0; i < NumBlurPass; ++i) {

              gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.deferred_frame_buffer);
              gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.bilateral_filter_horizontal_tex, 0);
              gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, texturePool.deferred_render_buffer);

              gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

              // Removed expensive checkFramebufferStatus call for performance
              // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
              // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
              //     console.log("frame buffer status:" + status.toString());
              // }

              renderer.clear();// clear when attached to scene depth map

              bilateralBlur.use();
              gl_context.activeTexture(gl_context.TEXTURE0);
              if (i == 0) {
                  gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scatter_pass_tex);
              } else {
                  gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.bilateral_filter_vertical_tex);
              }
              gl_context.uniform1i(getCachedUniformLocation(gl_context,bilateralBlur.prog, "scatter_tex"), 0);

              gl_context.activeTexture(gl_context.TEXTURE1);
              gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scene_depth_tex);
              gl_context.uniform1i(getCachedUniformLocation(gl_context,bilateralBlur.prog, "scene_depth"), 1);

              gl_context.uniform1f(getCachedUniformLocation(gl_context,bilateralBlur.prog, "u_far"), camera.far);
              gl_context.uniform1f(getCachedUniformLocation(gl_context,bilateralBlur.prog, "u_near"), camera.near);

              gl_context.uniform1i(getCachedUniformLocation(gl_context,bilateralBlur.prog, "u_isHorizontal"), i % 2);


              renderer.render(camera, bilateralBlur, [
                  square,
              ]);

              texturePool.swapBilateralFilterTextures();

              gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
          }
      }

    // ===================================== pass 6 : combination pass =====================================================================
    combinedShader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.color_pass_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,combinedShader.prog,"color_tex"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    if(controls.enableBilateralBlur)
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.bilateral_filter_horizontal_tex);
    else
        gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scatter_pass_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,combinedShader.prog,"bi_tex"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, texturePool.scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(gl_context,combinedShader.prog,"sceneDepth_tex"),2);

    renderer.clear();
    renderer.render(camera, combinedShader, [
      square,
    ]);

    gl_context.disable(gl_context.BLEND);
    //gl_context.disable(gl_context.DEPTH_TEST);
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  const runtime = {
    start(): void {
      tick();
    },
    resize(): void {
      if (renderer && gl_context) {
        texturePool.resizeScreenTextures();
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.setAspectRatio(window.innerWidth / window.innerHeight);
        camera.updateProjectionMatrix();
      }
    },
    getControls: (): IAppControls => controls,
    getCamera: () => camera,
    getRenderer: () => renderer,
  };

  window.addEventListener('resize', runtime.resize, false);

  if (renderer) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  }

  runtime.start();
}

main();
