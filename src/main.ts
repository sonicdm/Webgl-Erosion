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
import { createTerrainGeometry, updateTerrainGeometry } from './utils/terrain-geometry-builder';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { createHeightMapLoader } from './utils/heightmap-loader';
import { getCachedUniformLocation } from './utils/uniform-cache';
import { 
    simres, shadowMapResolution, SimFramecnt, TerrainGeometryDirty, PauseGeneration, 
    HightMapCpuBuf, HightMapBufCounter, MaxHightMapBufCounter, shouldReadHeightmap, setSimRes, setGlContext, 
    setClientDimensions, setLastMousePosition, clientWidth, clientHeight, lastX, lastY,
    setPauseGeneration, setSimFramecnt, incrementSimFramecnt, setTerrainGeometryDirty,
    resizeHightMapCpuBuf, incrementHightMapBufCounter, resetHightMapBufCounter,
    terrainGeometry, terrainBVH, setTerrainGeometry, setTerrainBVH
} from './simulation/simulation-state';
import {
    frame_buffer, shadowMap_frame_buffer, deferred_frame_buffer,
    render_buffer, shadowMap_render_buffer, deferred_render_buffer,
    shadowMap_tex, scene_depth_tex, bilateral_filter_horizontal_tex, bilateral_filter_vertical_tex,
    color_pass_tex, color_pass_reflection_tex, scatter_pass_tex,
    read_terrain_tex, write_terrain_tex, read_flux_tex, write_flux_tex,
    read_terrain_flux_tex, write_terrain_flux_tex, read_maxslippage_tex, write_maxslippage_tex,
    read_vel_tex, write_vel_tex, read_sediment_tex, write_sediment_tex,
    terrain_nor, read_sediment_blend, write_sediment_blend,
    sediment_advect_a, sediment_advect_b,
    setupFramebufferandtextures, resizeTextures4Simulation, resizeScreenTextures,
    setHeightMapTexture, getHeightMapTexture,
    swapTerrainTextures, swapFluxTextures, swapVelTextures, swapSedimentTextures,
    swapSedimentBlendTextures, swapMaxSlippageTextures, swapTerrainFluxTextures,
    swapBilateralFilterTextures
} from './simulation/texture-management';
import { Render2Texture } from './rendering/render-utils';
import { createShaders, Shaders } from './rendering/shader-factory';

// Note: Most state variables are now imported from simulation-state.ts
// Additional local variables
let speed = 3;
const enableBilateralBlur = false;
var gl_context : WebGL2RenderingContext;



//  (for backup)
const controlscomp = {


    tesselations: 5,
    pipelen:  0.8,//
    Kc : 0.10,
    Ks : 0.020,
    Kd : 0.013,
    timestep : 0.05,
    pipeAra :  0.6,
    RainErosion : false, //
    RainErosionStrength : 1.0,
    RainErosionDropSize : 1.0,
    EvaporationConstant : 0.005,
    VelocityMultiplier : 1,
    RainDegree : 4.5,
    AdvectionSpeedScaling : 1.0,
    spawnposx : 0.5,
    spawnposy : 0.5,
    posTemp : vec2.fromValues(0.0,0.0),
    'Load Scene': loadScene, // A function pointer, essentially
    'Start/Resume' :StartGeneration,
    'ResetTerrain' : Reset,
    'setTerrainRandom':setTerrainRandom,
    SimulationSpeed : 3,
    TerrainBaseMap : 0,
    TerrainBaseType : 0,//0 ordinary fbm, 1 domain warping, 2 terrace, 3 voroni
    TerrainBiomeType : 1,
    TerrainScale : 3.2,
    TerrainHeight : 2.0,
    TerrainMask : 0,//0 off, 1 sphere
    TerrainDebug : 0,
    WaterTransparency : 0.50,
    SedimentTrace : 0, // 0 on, 1 off
    TerrainPlatte : 1, // 0 normal alphine mtn, 1 desert, 2 jungle
    SnowRange : 0,
    ForestRange : 0,
    brushType : 2, // 0 : no brush, 1 : terrain, 2 : water
    brushSize : 4,
    brushStrenth : 0.40,
    brushOperation : 0, // 0 : add, 1 : subtract
    brushPressed : 0, // 0 : not pressed, 1 : pressed
    sourceCount : 0, // Number of active water sources
    thermalRate : 0.5,
    thermalErosionScale : 1.0,
    lightPosX : 0.4,
    lightPosY : 0.2,
    lightPosZ : -1.0,
    showScattering : true,
    enableBilateralBlur : true,
    AdvectionMethod : 1,
    SimulationResolution : simres,

};


const controls = {
    tesselations: 5,
    pipelen:  0.8,//
    Kc : 0.06,
    Ks : 0.036,
    Kd : 0.006,
    timestep : 0.05,
    pipeAra :  0.6,
    ErosionMode : 0, // 0 river erosion, 1 : mountain erosion, 2 : polygonal mode
    RainErosion : false, //
    RainErosionStrength : 0.2,
    RainErosionDropSize : 2.0,
    EvaporationConstant : 0.003,
    VelocityMultiplier : 1,
    RainDegree : 4.5,
    AdvectionSpeedScaling : 1.0,
    spawnposx : 0.5,
    spawnposy : 0.5,
    posTemp : vec2.fromValues(0.0,0.0),
    'Load Scene': loadScene, // A function pointer, essentially
    'Pause/Resume' :StartGeneration,
    'ResetTerrain' : Reset,
    'setTerrainRandom':setTerrainRandom,
    'Import Height Map': () => {}, // Will be set in main() after gl_context is available
    'Clear Height Map': () => {}, // Will be set in main() after gl_context is available
    SimulationSpeed : 3,
    TerrainBaseMap : 0,
    TerrainBaseType : 0,//0 ordinary fbm, 1 domain warping, 2 terrace, 3 voroni
    TerrainBiomeType : 1,
    TerrainScale : 3.2,
    TerrainHeight : 2.0,
    TerrainMask : 0,//0 off, 1 sphere
    TerrainDebug : 0,
    WaterTransparency : 0.50,
    SedimentTrace : true, // 0 on, 1 off
    ShowFlowTrace : false,
    TerrainPlatte : 1, // 0 normal alphine mtn, 1 desert, 2 jungle
    SnowRange : 0,
    ForestRange : 0,
    brushType : 2, // 0 : no brush, 1 : terrain, 2 : water, 3 : rock, 4 : smooth, 5 : flatten, 6 : slope
    brushSize : 4,
    brushStrenth : 0.25,
    brushOperation : 0, // 0 : add, 1 : subtract
    brushPressed : 0, // 0 : not pressed, 1 : pressed
    raycastMethod : 'bvh' as 'heightmap' | 'bvh', // Raycast method: 'heightmap' or 'bvh' (will be overridden by settings)
    flattenTargetHeight : 0.0, // Target height for flatten brush (will be set to center height on Alt+click)
    slopeStartPos : vec2.fromValues(0.0, 0.0), // Start position for slope brush
    slopeEndPos : vec2.fromValues(0.0, 0.0), // End position for slope brush
    slopeActive : 0, // 0 : not active, 1 : start set, 2 : end set
    sourceCount : 0, // Number of active water sources
    rockErosionResistance : 0.8, // 0.0 = erodes normally, 1.0 = doesn't erode (multiplier for Ks/Kc) - increased default so rock actually erodes much slower
    thermalTalusAngleScale : 8.0,
    thermalRate : 0.5,
    thermalErosionScale : 1.0,
    lightPosX : 0.4,
    lightPosY : 0.8,
    lightPosZ : -0.0,
    showScattering : true,
    enableBilateralBlur : true,
    AdvectionMethod : 1,
    VelocityAdvectionMag : 0.2,
    SimulationResolution : simres,
};





// ================ geometries ============
// =============================================================
let square: Square;
let plane : Plane;
let waterPlane : Plane;


// Note: All texture and framebuffer variables are now imported from texture-management.ts

// Reference to the initial terrain shader (set in main function)
let noiseterrain: ShaderProgram | null = null;

// ================ dat gui button call backs ============
// =============================================================

function loadScene() {
  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();
  plane = new Plane(vec3.fromValues(0,0,0), vec2.fromValues(1,1), 18);
  plane.create();
  waterPlane = new Plane(vec3.fromValues(0,0,0), vec2.fromValues(1,1), 18);
  waterPlane.create();
}

function StartGeneration(){
    setPauseGeneration(!PauseGeneration);
}


function Reset(){
    setSimFramecnt(0);
    setTerrainGeometryDirty(true);
    if(controls.SimulationResolution!=simres){
        const newRes = Number(controls.SimulationResolution); // Ensure it's a number, not a string
        setSimRes(newRes);
        resizeTextures4Simulation(gl_context, newRes);
        resizeHightMapCpuBuf(newRes); // Resize the CPU buffer to match new resolution
    }
    //PauseGeneration = true;
}

function setTerrainRandom() {
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


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    rains.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(rains.prog,"readTerrain"),0);
    gl_context.uniform1f(getCachedUniformLocation(rains.prog,'raindeg'),controls.RainDegree);

    renderer.render(camera,rains,[square]);


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //swap terrain tex-----------------------------------------------
    swapTerrainTextures();
    //swap terrain tex-----------------------------------------------


    //////////////////////////////////////////////////////////////////
    //1---use hight map to derive flux map : hight map -----> flux map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_flux_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    shader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(shader.prog,"readSedi"),2);

    renderer.render(camera,shader,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);



    //-----swap flux ping and pong
    swapFluxTextures();
    //-----swap flux ping and pong

    //////////////////////////////////////////////////////////////////
    //2---use flux map and hight map to derive velocity map and new hight map :
    // hight map + flux map -----> velocity map + hight map
    //////////////////////////////////////////////////////////////////


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,write_vel_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    waterhight.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterhight.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterhight.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterhight.prog,"readSedi"),2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(waterhight.prog,"readVel"),3);



    renderer.render(camera,waterhight,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //-----swap terrain ping and pong and velocity ping pong
    swapTerrainTextures();
    swapVelTextures();
    //-----swap terrain ping and pong and velocity ping pong


    // //////////////////////////////////////////////////////////////////
    // // experimental pass : self advection of velocity (potentially flux) to bring about momentum
    // // ideally :
    // // velocity map + (flux optional) ----> velocity map + (flux optional)
    // //////////////////////////////////////////////////////////////////
    //
    //
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_vel_tex,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    // gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
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
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    //
    // renderer.clear();
    // veladvect.use();
    //
    // gl_context.activeTexture(gl_context.TEXTURE0);
    // gl_context.bindTexture(gl_context.TEXTURE_2D,read_vel_tex);
    // gl_context.uniform1i(getCachedUniformLocation(veladvect.prog,"readVel"),0);
    //
    // renderer.render(camera,veladvect,[square]);
    // gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    //
    // //-----swap velocity ping pong
    //
    // tmp = read_vel_tex;
    // read_vel_tex = write_vel_tex;
    // write_vel_tex = tmp;
    //
    // //-----swap velocity ping pong

    //////////////////////////////////////////////////////////////////
    //3---use velocity map, sediment map and hight map to derive sediment map and new hight map and velocity map :
    // hight map + velocity map + sediment map -----> sediment map + hight map + terrain normal map + velocity map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,write_sediment_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,terrain_nor,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,write_vel_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    sedi.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_vel_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog,"readVelocity"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog,"readSediment"),2);

    renderer.render(camera,sedi,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


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
    if(controls.AdvectionMethod == 1) {
        //4.1  first subpass writing to the intermidiate sediment advection texture a
        {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, sediment_advect_a, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, write_sediment_blend, 0);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
            gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

            gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

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

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

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

            // Removed expensive checkFramebufferStatus call for performance
            // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            //     console.log("frame buffer status:" + status.toString());
            // }

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

    }else{
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, write_sediment_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, write_vel_tex, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, write_sediment_blend, 0);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
        gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);

        gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1, gl_context.COLOR_ATTACHMENT2]);

        // Removed expensive checkFramebufferStatus call for performance
        // status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
        // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        //     console.log("frame buffer status:" + status.toString());
        // }

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


    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_maxslippage_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    maxslippageheight.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(maxslippageheight.prog,"readTerrain"),0);



    renderer.render(camera,maxslippageheight,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------------------------
    //swap maxslippage maps
    swapMaxSlippageTextures();
    //--------------------------------


    //////////////////////////////////////////////////////////////////
    // thermal terrain flux map generation
    // 5---use velocity map, sediment map to derive new sediment map :
    // hight map -----> terrain flux map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_flux_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    thermalterrainflux.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i( getCachedUniformLocation(thermalterrainflux.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_maxslippage_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalterrainflux.prog,"readMaxSlippage"),1);


    renderer.render(camera,thermalterrainflux,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    //---------------------------------
    //swap terrain flux maps
    swapTerrainFluxTextures();


    //////////////////////////////////////////////////////////////////
    // thermal erosion apply
    // 6---use terrain flux map to derive new terrain map :
    // terrain flux map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    thermalapply.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalapply.prog,"readTerrainFlux"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(thermalapply.prog,"readTerrain"),1);


    renderer.render(camera,thermalapply,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
    //////////////////////////////////////////////////////////////////
    // water level evaporation at end of each iteration
    // 7---use terrain map to derive new terrain map :
    // terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    eva.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(eva.prog,"terrain"),0);
    gl_context.uniform1f(getCachedUniformLocation(eva.prog,'evapod'),controls.EvaporationConstant);

    renderer.render(camera,eva,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
    //---------------swap terrain mao----------------------------

    //////////////////////////////////////////////////////////////////
    // final average step : average terrain to avoid extremly sharp ridges or ravines
    // 6---use terrain map to derive new terrain map :
    //  terrain map -----> terrain map
    //////////////////////////////////////////////////////////////////
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,terrain_nor,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);

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
    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    renderer.clear();
    ave.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(ave.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(ave.prog,"readSedi"),1);

    renderer.render(camera,ave,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    //---------------swap terrain mao----------------------------
    swapTerrainTextures();
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
    if(PauseGeneration) return true;
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
    // Convert to client coordinates so normalization happens in tick()
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setLastMousePosition(rect.left + x, rect.top + y);
        }
    }
    //console.log(x + ' ' + y);
}

// Controls configuration - can be changed at runtime if needed
// controlsConfig will be loaded from settings in main() function
let controlsConfig: ControlsConfig;

function main() {

  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);


    //HightMapCpuBuf = new Float32Array(simresolution * simresolution * 4);

  // Setup GUI
  const { gui, controllers } = setupGUI(controls);
  const { brushTypeController, brushSizeController, brushStrengthController, brushOperationController } = controllers;

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  gl_context = <WebGL2RenderingContext> canvas.getContext('webgl2');
  setGlContext(gl_context);
  setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  
  // Create heightmap loader functions
  const { loadHeightMap, clearHeightMap } = createHeightMapLoader(gl_context, simres, controls);
  controls['Import Height Map'] = loadHeightMap;
  controls['Clear Height Map'] = clearHeightMap;

  // Load settings (from localStorage or defaults) - must be done before creating event handlers
  controlsConfig = loadSettings();
  
  // Apply raycast method from settings
  controls.raycastMethod = controlsConfig.raycast.method;
  
  // Heightfield raycasting uses the CPU heightmap buffer
  
  // Create camera first (needed for event handlers)
  const brushUsesLeftClickForCamera = controlsConfig.mouse.brushActivate === 'LEFT' || 
                                       (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  const camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClickForCamera);
  
  // Create event handlers (must be done after controlsConfig and camera are loaded)
  const eventHandlers = createEventHandlers(controls, controlsConfig, camera);
  const { onKeyDown, onKeyUp, onMouseDown, onMouseUp } = eventHandlers;

  mouseChange(canvas, handleInteraction);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
  
  // Note: controlsConfig will be loaded in main() before event listeners are set up
  window.addEventListener('pointerdown', (e) => {
    const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][e.button];
    console.log('[DEBUG] WINDOW pointerdown CAPTURE - button:', e.button, 'buttonName:', buttonName, 'target:', e.target);
    // Check if target is canvas or contains canvas
    const target = e.target as HTMLElement;
    const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
    console.log('[DEBUG] WINDOW pointerdown - isCanvas:', isCanvas, 'target:', target, 'canvas:', canvas);
    if (isCanvas) {
      // Check if this is a brush action BEFORE calling handler
      const action = getMouseButtonAction(e.button, controlsConfig);
      if (action === 'brushActivate') {
        console.log('[DEBUG] WINDOW pointerdown - BRUSH ACTION, stopping propagation immediately');
        // Update mouse position for ray casting (store client coordinates)
        setLastMousePosition(e.clientX, e.clientY);
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
    console.log('[DEBUG] WINDOW pointerup CAPTURE - button:', e.button, 'target:', e.target);
    const target = e.target as HTMLElement;
    if (target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas) {
      const action = getMouseButtonAction(e.button, controlsConfig);
      if (action === 'brushActivate') {
        console.log('[DEBUG] WINDOW pointerup - BRUSH ACTION, stopping propagation');
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        onMouseUp(e);
      }
    }
  }, true);
  
  // Handle pointermove to update brush position while brush is active
  window.addEventListener('pointermove', (e) => {
    if (controls.brushPressed === 1) {
      // Update lastX and lastY for ray casting when brush is active
      const target = e.target as HTMLElement;
      const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
        if (isCanvas) {
        // Update mouse position for ray casting (store client coordinates)
        setLastMousePosition(e.clientX, e.clientY);
        
        // Continuously check modifier state while brush is active
        const invertModifier = controlsConfig.modifiers.brushInvert;
        if (invertModifier) {
          const modifierPressed = isModifierPressed(invertModifier, e);
          
          if (modifierPressed && getOriginalBrushOperation() === null) {
            // Modifier is pressed but operation not inverted yet - invert it
            setOriginalBrushOperation(controls.brushOperation);
            controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
            console.log('[DEBUG] Brush operation inverted on modifier (pointermove) to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
          } else if (!modifierPressed && getOriginalBrushOperation() !== null) {
            // Modifier released - restore original operation
            const original = getOriginalBrushOperation();
            if (original !== null) {
                controls.brushOperation = original;
                setOriginalBrushOperation(null);
            }
            console.log('[DEBUG] Brush operation restored on modifier release (pointermove) to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
          }
        }
      }
    }
  }, true);
  
  // Handle pointercancel to deactivate brush if pointer is lost
  window.addEventListener('pointercancel', (e) => {
    if (controls.brushPressed === 1) {
      console.log('[DEBUG] WINDOW pointercancel - deactivating brush');
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

    if (!gl_context) {
    alert('WebGL 2 not supported!');
  }
    var extensions = gl_context.getSupportedExtensions();
    for(let e in extensions){
        console.log(e);
    }
  if(!gl_context.getExtension('OES_texture_float_linear')){
        console.log("float texture not supported");
    }
  if(!gl_context.getExtension('OES_texture_float')){
      console.log("no float texutre!!!?? y am i here?");
  }
  if(!gl_context.getExtension('EXT_color_buffer_float')) {
      console.log("cant render to float texture ");
  }
  // `setGL` is a function imported above which sets the value of `gl_context` in the `globals.ts` module.
  // Later, we can import `gl_context` from `globals.ts` to access it
  setGL(gl_context);

  // Initial call to load scene
  loadScene();

  // Camera is already created above, just check brushUsesLeftClick here for reference
  const brushUsesLeftClick = controlsConfig.mouse.brushActivate === 'LEFT' || 
                             (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.0, 0.0, 0.0, 0);
  gl_context.enable(gl_context.DEPTH_TEST);

    setupFramebufferandtextures(gl_context, simres);
    
    // Create all shaders
    const shaders = createShaders(gl_context);
    const {
        lambert, flat, flow, waterhight, sediment, sediadvect, macCormack,
        rains, evaporation, average, clean, water, thermalterrainflux,
        thermalapply, maxslippageheight, shadowMapShader, sceneDepthShader,
        combinedShader, bilateralBlur, veladvect
    } = shaders;
    noiseterrain = shaders.noiseterrain;


    let timer = 0;
    function cleanUpTextures(){
        Render2Texture(renderer, gl_context, camera, clean, read_terrain_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_vel_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_flux_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_terrain_flux_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_terrain_flux_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_maxslippage_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_maxslippage_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_sediment_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_terrain_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_vel_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_flux_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_sediment_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, terrain_nor, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_sediment_blend, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_sediment_blend, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, sediment_advect_a, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, sediment_advect_b, square, noiseterrain);
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

  function tick() {

    // Update camera before raycasting so matrices are in sync with rendered view
    camera.update(controlsConfig.camera);

    // ================ ray casting ===================
    //===================================================
    const normalizedMouse = normalizeMousePosition(canvas, lastX, lastY);
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
    noiseterrain.setTime(timer);
    noiseterrain.setTerrainHeight(controls.TerrainHeight);
    noiseterrain.setTerrainScale(controls.TerrainScale);
    noiseterrain.setInt(controls.TerrainMask,"u_TerrainMask");
    gl_context.uniform1i(getCachedUniformLocation(noiseterrain.prog,"u_terrainBaseType"),controls.TerrainBaseType);


    if(TerrainGeometryDirty){

        //=============clean up all simulation textures===================
        cleanUpTextures();
        //=============recreate base terrain textures=====================
        Render2Texture(renderer,gl_context,camera,noiseterrain,read_terrain_tex,square,noiseterrain);
        Render2Texture(renderer,gl_context,camera,noiseterrain,write_terrain_tex,square,noiseterrain);

        //=============rebuild secondary terrain mesh and BVH for raycasting===================
        // Dispose old BVH and geometry if they exist
        if (terrainBVH) {
            // BVH doesn't have explicit dispose, but we'll null the reference
            setTerrainBVH(null);
        }
        if (terrainGeometry) {
            terrainGeometry.dispose();
            setTerrainGeometry(null);
        }
        
        // Create new terrain geometry from heightmap
        // Note: HightMapCpuBuf might not be populated yet on first frame
        // The BVH will be built when the buffer is available (next frame or when heightmap is read)
        // Check if buffer has actual data (not all zeros) before creating geometry
        if (HightMapCpuBuf && HightMapCpuBuf.length >= simres * simres * 4) {
            // Check if buffer has non-zero height data (sample a few points)
            let hasData = false;
            const sampleCount = Math.min(100, simres * simres);
            for (let i = 0; i < sampleCount; i++) {
                const idx = Math.floor(Math.random() * simres * simres) * 4;
                if (HightMapCpuBuf[idx] !== 0) {
                    hasData = true;
                    break;
                }
            }
            
            if (hasData) {
                try {
                    const newGeometry = createTerrainGeometry(simres, HightMapCpuBuf, 1.0);
                setTerrainGeometry(newGeometry);
                
                // Build BVH from geometry
                const bvh = new MeshBVH(newGeometry, {
                    strategy: SAH, // Surface Area Heuristic for best performance (use constant, not string)
                    maxDepth: 40,    // Reasonable depth limit
                    indirect: false   // Direct indexed geometry
                });
                setTerrainBVH(bvh);
                    console.log('[BVH] Terrain BVH built successfully');
                } catch (error) {
                    console.warn('[BVH] Failed to build BVH (heightmap may not be ready yet):', error);
                }
            } else {
                console.log('[BVH] Heightmap buffer exists but has no data yet, will build when populated');
            }
        } else {
            console.log('[BVH] Heightmap buffer not ready yet, BVH will be built when available');
        }

        setTerrainGeometryDirty(false);
    }
    
    // Build BVH if it doesn't exist but heightmap buffer is available
    // This handles the case where terrain was dirty but buffer wasn't ready yet
    if (!terrainBVH && !terrainGeometry && HightMapCpuBuf && HightMapCpuBuf.length >= simres * simres * 4) {
        // Check if buffer has actual data (not all zeros)
        let hasData = false;
        const sampleCount = Math.min(100, simres * simres);
        for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor(Math.random() * simres * simres) * 4;
            if (HightMapCpuBuf[idx] !== 0) {
                hasData = true;
                break;
            }
        }
        
        if (hasData) {
            try {
                const newGeometry = createTerrainGeometry(simres, HightMapCpuBuf, 1.0);
                setTerrainGeometry(newGeometry);
                
                const bvh = new MeshBVH(newGeometry, {
                    strategy: SAH,
                    maxDepth: 40,
                    indirect: false
                });
                setTerrainBVH(bvh);
                console.log('[BVH] Terrain BVH built (delayed initialization)');
            } catch (error) {
                console.warn('[BVH] Failed to build BVH:', error);
            }
        }
    }

    //ray cast happens here
    reusablePos[0] = 0.0;
    reusablePos[1] = 0.0;
    
    // Toggle between heightmap and BVH raycast methods for A/B testing
    if (controls.raycastMethod === 'bvh' && terrainBVH && terrainGeometry) {
        // Use BVH raycast
        const hit = rayCastBVH(reusableRo, reusableDir, terrainBVH, terrainGeometry, reusablePos);
        if (!hit) {
            // Fallback to heightmap if BVH misses
            const heightmapPos = vec2.create();
            rayCast(reusableRo, reusableDir, simres, HightMapCpuBuf, heightmapPos);
            reusablePos[0] = heightmapPos[0];
            reusablePos[1] = heightmapPos[1];
        }
    } else {
        // Use heightmap raycast (default)
        rayCast(reusableRo, reusableDir, simres, HightMapCpuBuf, reusablePos);
    }
    
    controls.posTemp = reusablePos;

    //===================per tick uniforms==================


    flat.setTime(timer);

    gl_context.uniform1f(getCachedUniformLocation(flat.prog,"u_far"),camera.far);
    gl_context.uniform1f(getCachedUniformLocation(flat.prog,"u_near"),camera.near);
    reusableLightPos[0] = controls.lightPosX;
    reusableLightPos[1] = controls.lightPosY;
    reusableLightPos[2] = controls.lightPosZ;
    gl_context.uniform3fv(getCachedUniformLocation(flat.prog,"unif_LightPos"), reusableLightPos);

    water.setWaterTransparency(controls.WaterTransparency);
    water.setSimres(simres);
    gl_context.uniform1f(getCachedUniformLocation(water.prog,"u_far"),camera.far);
    gl_context.uniform1f(getCachedUniformLocation(water.prog,"u_near"),camera.near);
    gl_context.uniform3fv(getCachedUniformLocation(water.prog,"unif_LightPos"), reusableLightPos);

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
    gl_context.uniform3fv(getCachedUniformLocation(lambert.prog,"unif_LightPos"), reusableLightPos);

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
            controlsConfig: controlsConfig,
            simres: Number(simres), // Ensure it's a number, not a string
            HightMapCpuBuf: HightMapCpuBuf
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
    gl_context.uniform1i(getCachedUniformLocation(rains.prog,"u_RainErosion"),controls.RainErosion ? 1 : 0);
    rains.setFloat(controls.RainErosionStrength,'u_RainErosionStrength');
    rains.setFloat(controls.RainErosionDropSize,'u_RainErosionDropSize');

    flow.setPipeLen(controls.pipelen);
    flow.setSimres(simres);
    flow.setTimestep(controls.timestep);
    flow.setPipeArea(controls.pipeAra);

    waterhight.setPipeLen(controls.pipelen);
    waterhight.setSimres(simres);
    waterhight.setTimestep(controls.timestep);
    waterhight.setPipeArea(controls.pipeAra);
    waterhight.setFloat(controls.VelocityMultiplier, 'u_VelMult');
    waterhight.setFloat(controls.VelocityAdvectionMag, 'u_VelAdvMag');
    waterhight.setTime(timer);

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
    gl_context.uniform1f(getCachedUniformLocation(thermalterrainflux.prog,"unif_thermalRate"),controls.thermalRate);

    thermalapply.setSimres(simres);
    thermalapply.setPipeLen(controls.pipelen);
    thermalapply.setTimestep(controls.timestep);
    thermalapply.setPipeArea(controls.pipeAra);
    gl_context.uniform1f(getCachedUniformLocation(thermalapply.prog,"unif_thermalErosionScale"),controls.thermalErosionScale);

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
    incrementHightMapBufCounter();
    stats.begin();

      //==========================  we begin simulation from now ===========================================

    for(let i = 0;i<controls.SimulationSpeed;i++) {
        SimulationStep(SimFramecnt, flow, waterhight, veladvect,sediment, sediadvect, macCormack,rains,evaporation,average,thermalterrainflux, thermalapply, maxslippageheight, renderer, gl_context, camera);
        incrementSimFramecnt();
    }

    const mouseMoved = (lastReadMouseX < 0 || lastReadMouseY < 0) ||
        (Math.abs(lastX - lastReadMouseX) + Math.abs(lastY - lastReadMouseY) > 1);
    if ((justPressed || mouseMoved) && shouldReadHeightmap(brushPressed, brushVisible, simres)) {
        // Read full resolution for accurate raycasting
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, read_terrain_tex, 0);
        gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
        gl_context.readPixels(0, 0, simres, simres, gl_context.RGBA, gl_context.FLOAT, HightMapCpuBuf);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        lastReadMouseX = lastX;
        lastReadMouseY = lastY;
        if (!brushPressed && !brushVisible && HightMapBufCounter >= MaxHightMapBufCounter) {
            resetHightMapBufCounter();
        }
    }

    lastBrushPressed = brushPressed ? 1 : 0;

    gl_context.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();

    //========================== we enter a series of render pass from now ================================
    //========================== pass 1 : render shadow map pass=====================================


      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,shadowMap_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,shadowMap_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,shadowMap_render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

      // Removed expensive checkFramebufferStatus call for performance
      // let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
      // if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
      //     console.log( "frame buffer status:" + status.toString());
      // }

      gl_context.bindTexture(gl_context.TEXTURE_2D,null);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
      gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

      gl_context.viewport(0,0,shadowMapResolution,shadowMapResolution);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,shadowMap_frame_buffer);
      renderer.clear();// clear when attached to shadow map
      shadowMapShader.use();

      gl_context.activeTexture(gl_context.TEXTURE0);
      gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
      gl_context.uniform1i(getCachedUniformLocation(shadowMapShader.prog,"hightmap"),0);

      gl_context.activeTexture(gl_context.TEXTURE1);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
      gl_context.uniform1i(getCachedUniformLocation(shadowMapShader.prog, "sedimap"), 1);

      mat4.ortho(reusableLightProjMat, -1.6, 1.6, -1.6, 1.6, 0, 100);
      reusableLightPos[0] = controls.lightPosX;
      reusableLightPos[1] = controls.lightPosY;
      reusableLightPos[2] = controls.lightPosZ;
      mat4.lookAt(reusableLightViewMat, reusableLightPos, [0,0,0], [0,1,0]);

      gl_context.uniformMatrix4fv(getCachedUniformLocation(shadowMapShader.prog,'u_proj'),false,reusableLightProjMat);
      gl_context.uniformMatrix4fv(getCachedUniformLocation(shadowMapShader.prog,'u_view'),false,reusableLightViewMat);
      shadowMapShader.setSimres(simres);

      renderer.render(camera,shadowMapShader,[plane]);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


      //=========================== pass 2 :  render scene depth tex ================================
      sceneDepthShader.use();
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,deferred_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,scene_depth_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,deferred_render_buffer);

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
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,deferred_frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,color_pass_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,color_pass_reflection_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,deferred_render_buffer);

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
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    let PingUniform = getCachedUniformLocation(lambert.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,terrain_nor);
    let norUniform = getCachedUniformLocation(lambert.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    let sediUniform = getCachedUniformLocation(lambert.prog, "sedimap");
    gl_context.uniform1i(sediUniform, 2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
    let velUniform = getCachedUniformLocation(lambert.prog, "velmap");
    gl_context.uniform1i(velUniform, 3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_flux_tex);
    let fluxUniform = getCachedUniformLocation(lambert.prog, "fluxmap");
    gl_context.uniform1i(fluxUniform, 4);

    gl_context.activeTexture(gl_context.TEXTURE5);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_flux_tex);
    let terrainfluxUniform = getCachedUniformLocation(lambert.prog, "terrainfluxmap");
    gl_context.uniform1i(terrainfluxUniform, 5);

    gl_context.activeTexture(gl_context.TEXTURE6);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_maxslippage_tex);
    let terrainslippageUniform = getCachedUniformLocation(lambert.prog, "maxslippagemap");
    gl_context.uniform1i(terrainslippageUniform, 6);

    gl_context.activeTexture(gl_context.TEXTURE7);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
    gl_context.uniform1i(getCachedUniformLocation(lambert.prog, "sediBlend"), 7);


    gl_context.activeTexture(gl_context.TEXTURE8);
    gl_context.bindTexture(gl_context.TEXTURE_2D, shadowMap_tex);
    gl_context.uniform1i(getCachedUniformLocation(lambert.prog, "shadowMap"), 8);

    gl_context.activeTexture(gl_context.TEXTURE9);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(lambert.prog, "sceneDepth"), 9);

    gl_context.uniformMatrix4fv(getCachedUniformLocation(lambert.prog,'u_sproj'),false,reusableLightProjMat);
    gl_context.uniformMatrix4fv(getCachedUniformLocation(lambert.prog,'u_sview'),false,reusableLightViewMat);


      renderer.render(camera, lambert, [
      plane,
    ]);

    // =============== water =====================
    gl_context.enable(gl_context.BLEND);
    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);
    water.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    PingUniform = getCachedUniformLocation(water.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,terrain_nor);
    norUniform = getCachedUniformLocation(water.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    sediUniform = getCachedUniformLocation(water.prog,"sedimap");
    gl_context.uniform1i(sediUniform,2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(water.prog,"sceneDepth"),3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D,color_pass_reflection_tex);
    gl_context.uniform1i(getCachedUniformLocation(water.prog,"colorReflection"),4);


      renderer.render(camera, water, [
      plane,
    ]);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);


    // ======================== pass 4 : back ground & post processing & rayleigh mie scattering ==================================

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,deferred_frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,scatter_pass_tex,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,deferred_render_buffer);

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
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(getCachedUniformLocation(flat.prog,"hightmap"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(flat.prog,"sceneDepth"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, shadowMap_tex);
    gl_context.uniform1i(getCachedUniformLocation(flat.prog,"shadowMap"),2);

    gl_context.uniformMatrix4fv(getCachedUniformLocation(flat.prog,'u_sproj'),false,reusableLightProjMat);
    gl_context.uniformMatrix4fv(getCachedUniformLocation(flat.prog,'u_sview'),false,reusableLightViewMat);
    gl_context.uniform1i(getCachedUniformLocation(flat.prog,"u_showScattering"),controls.showScattering ? 1 : 0);

    renderer.render(camera, flat, [
      square,
    ]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);


    // ======================== pass 5 : bilateral blurring pass ==================================
      if(controls.enableBilateralBlur) {
          let NumBlurPass = 4;
          for (let i = 0; i < NumBlurPass; ++i) {

              gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, deferred_frame_buffer);
              gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, bilateral_filter_horizontal_tex, 0);
              gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, deferred_render_buffer);

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
                  gl_context.bindTexture(gl_context.TEXTURE_2D, scatter_pass_tex);
              } else {
                  gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_vertical_tex);
              }
              gl_context.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "scatter_tex"), 0);

              gl_context.activeTexture(gl_context.TEXTURE1);
              gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
              gl_context.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "scene_depth"), 1);

              gl_context.uniform1f(getCachedUniformLocation(bilateralBlur.prog, "u_far"), camera.far);
              gl_context.uniform1f(getCachedUniformLocation(bilateralBlur.prog, "u_near"), camera.near);

              gl_context.uniform1i(getCachedUniformLocation(bilateralBlur.prog, "u_isHorizontal"), i % 2);


              renderer.render(camera, bilateralBlur, [
                  square,
              ]);

              swapBilateralFilterTextures();

              gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
          }
      }

    // ===================================== pass 6 : combination pass =====================================================================
    combinedShader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, color_pass_tex);
    gl_context.uniform1i(getCachedUniformLocation(combinedShader.prog,"color_tex"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    if(controls.enableBilateralBlur)
        gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_horizontal_tex);
    else
        gl_context.bindTexture(gl_context.TEXTURE_2D, scatter_pass_tex);
    gl_context.uniform1i(getCachedUniformLocation(combinedShader.prog,"bi_tex"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(combinedShader.prog,"sceneDepth_tex"),2);

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

  window.addEventListener('resize', function() {

    resizeScreenTextures();

    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  // Start the render loop
  tick();
}

main();
