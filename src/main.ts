import {mat4, vec2, vec3, vec4} from 'gl-matrix';
// @ts-ignore
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import Plane from './geometry/Plane';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {gl, setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import {stat} from "fs";
var mouseChange = require('mouse-change');
import { getKeyAction, getMouseButtonAction, isBrushActivate, ControlsConfig, isModifierPressed } from './controls-config';
import { loadSettings } from './settings';
import { initBrushPalette, updatePaletteSelection } from './brush-palette';
import { handleBrushMouseDown, handleBrushMouseUp, updateBrushState, BrushContext, BrushControls, getOriginalBrushOperation, setOriginalBrushOperation } from './brush-handler';
import { MAX_WATER_SOURCES, waterSources, addWaterSource, removeNearestWaterSource, clearAllWaterSources, getWaterSourceCount } from './utils/water-sources';
import { rayCast } from './utils/raycast';
import { 
    simres, shadowMapResolution, SimFramecnt, TerrainGeometryDirty, PauseGeneration, 
    HightMapCpuBuf, HightMapBufCounter, MaxHightMapBufCounter, setSimRes, setGlContext, 
    setClientDimensions, setLastMousePosition, clientWidth, clientHeight, lastX, lastY,
    setPauseGeneration, setSimFramecnt, incrementSimFramecnt, setTerrainGeometryDirty
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
    'Import Height Map': loadHeightMap,
    'Clear Height Map': clearHeightMap,
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
    flattenTargetHeight : 0.0, // Target height for flatten brush (will be set to center height on Alt+click)
    slopeStartPos : vec2.fromValues(0.0, 0.0), // Start position for slope brush
    slopeEndPos : vec2.fromValues(0.0, 0.0), // End position for slope brush
    slopeActive : 0, // 0 : not active, 1 : start set, 2 : end set
    sourceCount : 0, // Number of active water sources
    rockErosionResistance : 0.1, // 0.0 = erodes normally, 1.0 = doesn't erode (multiplier for Ks/Kc)
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
        setSimRes(controls.SimulationResolution);
        resizeTextures4Simulation(gl_context, controls.SimulationResolution);
    }
    //PauseGeneration = true;
}

function setTerrainRandom() {
}

// Function to load a height map image and convert it to a texture
function loadHeightMap() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
            const img = new Image();
            img.onload = () => {
                // Create a canvas to process the image
                const canvas = document.createElement('canvas');
                canvas.width = simres;
                canvas.height = simres;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                
                // Draw and scale the image to match simulation resolution
                ctx.drawImage(img, 0, 0, simres, simres);
                const imageData = ctx.getImageData(0, 0, simres, simres);
                
                // Convert image data to height map texture
                // Use grayscale (red channel) as height, scale to terrain height range
                const heightData = new Float32Array(simres * simres * 4);
                const maxHeight = controls.TerrainHeight * 120.0;
                
                for (let i = 0; i < simres * simres; i++) {
                    const r = imageData.data[i * 4];
                    const g = imageData.data[i * 4 + 1];
                    const b = imageData.data[i * 4 + 2];
                    // Convert RGB to grayscale and normalize to 0-1, then scale
                    const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
                    const height = gray * maxHeight;
                    
                    heightData[i * 4] = height;      // R: terrain height
                    heightData[i * 4 + 1] = 0.0;   // G: water (start with no water)
                    heightData[i * 4 + 2] = 0.0;   // B: rock material
                    heightData[i * 4 + 3] = 1.0;   // A: alpha
                }
                
                // Create or update height map texture
                let heightmap_tex = getHeightMapTexture();
                if (!heightmap_tex) {
                    heightmap_tex = gl_context.createTexture();
                }
                
                gl_context.bindTexture(gl_context.TEXTURE_2D, heightmap_tex);
                gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, 
                    simres, simres, 0, gl_context.RGBA, gl_context.FLOAT, heightData);
                gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
                gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
                gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
                gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
                gl_context.bindTexture(gl_context.TEXTURE_2D, null);
                
                // Store the height map texture
                setHeightMapTexture(heightmap_tex);
                
                // Mark terrain as dirty to regenerate
                setTerrainGeometryDirty(true);
                console.log('Height map loaded successfully');
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// Function to clear the height map and use procedural generation
function clearHeightMap() {
    const heightmap_tex = getHeightMapTexture();
    if (heightmap_tex) {
        gl_context.deleteTexture(heightmap_tex);
        setHeightMapTexture(null);
        setTerrainGeometryDirty(true);
        console.log('Height map cleared, using procedural generation');
    }
}


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

    let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    rains.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(rains.prog,"readTerrain"),0);
    gl_context.uniform1f(gl_context.getUniformLocation(rains.prog,'raindeg'),controls.RainDegree);

    renderer.render(camera,rains,[square]);


    if(HightMapBufCounter % MaxHightMapBufCounter == 0) {
        gl_context.readPixels(0, 0, simres, simres, gl_context.RGBA, gl_context.FLOAT, HightMapCpuBuf);
    }
    // HightMapBufCounter is managed in simulation-state.ts

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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    shader.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(shader.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_flux_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(shader.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(shader.prog,"readSedi"),2);

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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    waterhight.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(waterhight.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_flux_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(waterhight.prog,"readFlux"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(waterhight.prog,"readSedi"),2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_vel_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(waterhight.prog,"readVel"),3);



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
    // gl_context.uniform1i(gl_context.getUniformLocation(veladvect.prog,"readVel"),0);
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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    sedi.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(sedi.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_vel_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(sedi.prog,"readVelocity"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(sedi.prog,"readSediment"),2);

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

            status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
                console.log("frame buffer status:" + status.toString());
            }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, simres, simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);


            renderer.clear();
            advect.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sediBlend"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "terrain"), 3);

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

            status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
                console.log("frame buffer status:" + status.toString());
            }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, simres, simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);


            renderer.clear();
            advect.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_a);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sediBlend"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "terrain"), 3);

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

            status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
            if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
                console.log("frame buffer status:" + status.toString());
            }

            gl_context.bindTexture(gl_context.TEXTURE_2D, null);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
            gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

            gl_context.viewport(0, 0, simres, simres);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);


            renderer.clear();
            macCormack.use();
            gl_context.activeTexture(gl_context.TEXTURE0);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(macCormack.prog, "vel"), 0);

            gl_context.activeTexture(gl_context.TEXTURE1);
            gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
            gl_context.uniform1i(gl_context.getUniformLocation(macCormack.prog, "sedi"), 1);

            gl_context.activeTexture(gl_context.TEXTURE2);
            gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_a);
            gl_context.uniform1i(gl_context.getUniformLocation(macCormack.prog, "sediadvecta"), 2);

            gl_context.activeTexture(gl_context.TEXTURE3);
            gl_context.bindTexture(gl_context.TEXTURE_2D, sediment_advect_b);
            gl_context.uniform1i(gl_context.getUniformLocation(macCormack.prog, "sediadvectb"), 3);


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

        status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
        if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
            console.log("frame buffer status:" + status.toString());
        }

        gl_context.bindTexture(gl_context.TEXTURE_2D, null);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

        gl_context.viewport(0, 0, simres, simres);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);


        renderer.clear();
        advect.use();
        gl_context.activeTexture(gl_context.TEXTURE0);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
        gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "vel"), 0);

        gl_context.activeTexture(gl_context.TEXTURE1);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
        gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sedi"), 1);

        gl_context.activeTexture(gl_context.TEXTURE2);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
        gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "sediBlend"), 2);

        gl_context.activeTexture(gl_context.TEXTURE3);
        gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
        gl_context.uniform1i(gl_context.getUniformLocation(advect.prog, "terrain"), 3);

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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    maxslippageheight.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(maxslippageheight.prog,"readTerrain"),0);



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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    thermalterrainflux.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i( gl_context.getUniformLocation(thermalterrainflux.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_maxslippage_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(thermalterrainflux.prog,"readMaxSlippage"),1);


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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);


    renderer.clear();
    thermalapply.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_flux_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(thermalapply.prog,"readTerrainFlux"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(thermalapply.prog,"readTerrain"),1);


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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    eva.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(eva.prog,"terrain"),0);
    gl_context.uniform1f(gl_context.getUniformLocation(eva.prog,'evapod'),controls.EvaporationConstant);

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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log( "frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);
    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    renderer.clear();
    ave.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(ave.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(ave.prog,"readSedi"),1);

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

function handleInteraction (buttons : number, x : number, y : number){
    setLastMousePosition(x, y);
    //console.log(x + ' ' + y);
}

// Controls configuration - can be changed at runtime if needed
// controlsConfig will be loaded from settings in main() function
let controlsConfig: ControlsConfig;

function onKeyDown(event : KeyboardEvent){
    const key = event.key.toLowerCase();
    const action = getKeyAction(key, controlsConfig);
    
    // Check if this key is brushActivate (could be keyboard key OR mouse button string)
    if (isBrushActivate(key, controlsConfig)) {
        controls.brushPressed = 1;
    } else if (action === 'brushActivate') {
        controls.brushPressed = 1;
    } else {
        // Only reset if another key is pressed (not if mouse button is the activator)
        if (controlsConfig.keys.brushActivate !== 'LEFT' && 
            controlsConfig.keys.brushActivate !== 'MIDDLE' && 
            controlsConfig.keys.brushActivate !== 'RIGHT') {
            controls.brushPressed = 0;
        }
    }
    
    // If brush is active, check if modifier is pressed to invert operation
    if (controls.brushPressed === 1) {
        const invertModifier = controlsConfig.modifiers.brushInvert;
        if (invertModifier) {
            const modifierPressed = isModifierPressed(invertModifier, event);
            
            // Check if this is the modifier key being pressed
            const isModifierKey = 
                (invertModifier === 'Ctrl' && (key === 'control' || key === 'meta')) ||
                (invertModifier === 'Shift' && key === 'shift') ||
                (invertModifier === 'Alt' && key === 'alt');
            
            if (isModifierKey && modifierPressed && getOriginalBrushOperation() === null) {
                // Modifier just pressed while brush is active - invert operation
                setOriginalBrushOperation(controls.brushOperation);
                controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
                console.log('[DEBUG] Brush operation inverted on modifier press to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
            }
        }
    }

    if (action === 'permanentWaterSource') {
        // Check if Shift is held for removal
        if (event.shiftKey) {
            // Remove nearest source to cursor
            if (removeNearestWaterSource(controls.posTemp)) {
                controls.sourceCount = getWaterSourceCount();
                console.log(`Removed water source. Remaining: ${getWaterSourceCount()}`);
            }
        } else {
            // Add new source at cursor position
            if (addWaterSource(controls.posTemp, controls.brushSize, controls.brushStrenth)) {
                controls.sourceCount = getWaterSourceCount();
                console.log(`Added water source at (${controls.posTemp[0].toFixed(3)}, ${controls.posTemp[1].toFixed(3)}). Total: ${getWaterSourceCount()}`);
            } else {
                console.log(`Maximum ${MAX_WATER_SOURCES} water sources reached`);
            }
        }
    }
    
    if (action === 'removePermanentSource') {
        // Remove all sources
        clearAllWaterSources();
        controls.sourceCount = 0;
        console.log('Removed all water sources');
    }
}

function onKeyUp(event : KeyboardEvent){
    const key = event.key.toLowerCase();
    const action = getKeyAction(key, controlsConfig);
    
    // Only deactivate if this key was the brush activator (not if mouse button is the activator)
    if (isBrushActivate(key, controlsConfig) || action === 'brushActivate') {
        controls.brushPressed = 0;
    }
    
    // If brush is active and modifier is released, restore original operation
    if (controls.brushPressed === 1) {
        const invertModifier = controlsConfig.modifiers.brushInvert;
        if (invertModifier) {
            const isModifierKey = 
                (invertModifier === 'Ctrl' && (key === 'control' || key === 'meta')) ||
                (invertModifier === 'Shift' && key === 'shift') ||
                (invertModifier === 'Alt' && key === 'alt');
            
            if (isModifierKey && getOriginalBrushOperation() !== null) {
                const original = getOriginalBrushOperation();
                if (original !== null) {
                    controls.brushOperation = original;
                    setOriginalBrushOperation(null);
                }
                console.log('[DEBUG] Brush operation restored on modifier release to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
            }
        }
    }
}

function onMouseDown(event : MouseEvent | PointerEvent){
    // ALWAYS log first thing - if this doesn't show, handler isn't being called
    const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][event.button];
    console.log('[DEBUG] onMouseDown CALLED - button:', event.button, 'buttonName:', buttonName, 'target:', event.target);
    console.log('[DEBUG] Config - keys.brushActivate:', controlsConfig.keys.brushActivate, 'mouse.brushActivate:', controlsConfig.mouse.brushActivate);
    
    const action = getMouseButtonAction(event.button, controlsConfig);
    console.log('[DEBUG] onMouseDown - action:', action, 'brushType:', controls.brushType);
    
    if (action === 'brushActivate') {
        const brushContext: BrushContext = {
            controls: controls as BrushControls,
            controlsConfig: controlsConfig,
            simres: simres,
            HightMapCpuBuf: HightMapCpuBuf
        };
        
        const result = handleBrushMouseDown(event, brushContext);
        
        if (result.shouldActivate) {
            controls.brushPressed = result.brushPressed;
            // Prevent OrbitControls from handling this event
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log('[DEBUG] brushPressed set to:', controls.brushPressed);
            return; // Exit early to prevent other handlers
        } else {
            // Brush handler already prevented default and stopped propagation
            return;
        }
    } else {
        console.log('[DEBUG] Not a brush action - button:', event.button, 'buttonName:', buttonName);
        console.log('[DEBUG] Expected - keys.brushActivate:', controlsConfig.keys.brushActivate, 'mouse.brushActivate:', controlsConfig.mouse.brushActivate);
    }
}

function onMouseUp(event : MouseEvent | PointerEvent){
    console.log('[DEBUG] onMouseUp CALLED - button:', event.button, 'target:', event.target);
    const action = getMouseButtonAction(event.button, controlsConfig);
    console.log('[DEBUG] onMouseUp - action:', action);
    
    if (action === 'brushActivate') {
        console.log('[DEBUG] Deactivating brush - setting brushPressed = 0');
        controls.brushPressed = 0;
        
        const brushContext: BrushContext = {
            controls: controls as BrushControls,
            controlsConfig: controlsConfig,
            simres: simres,
            HightMapCpuBuf: HightMapCpuBuf
        };
        
        handleBrushMouseUp(event, brushContext);
        
        // Prevent OrbitControls from handling this event
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
}

// These functions are no longer needed - we handle pointer events directly in the listeners above

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

  // Add controls to the gui
  const gui = new DAT.GUI();
    var simcontrols = gui.addFolder('Simulation Controls');
    simcontrols.add(controls,'Pause/Resume');
    simcontrols.add(controls,'SimulationSpeed',{fast:3,medium : 2, slow : 1});
    simcontrols.open();
    var terrainParameters = gui.addFolder('Terrain Parameters');
    terrainParameters.add(controls,'SimulationResolution',{256 : 256 , 512 : 512, 1024 : 1024, 2048 : 2048, 4096 : 4096} );
    terrainParameters.add(controls,'TerrainScale', 0.1, 4.0);
    terrainParameters.add(controls,'TerrainHeight', 1.0, 5.0);
    terrainParameters.add(controls,'TerrainMask',{OFF : 0 ,Sphere : 1, slope : 2});
    terrainParameters.add(controls,'TerrainBaseType', {ordinaryFBM : 0, domainWarp : 1, terrace : 2, voroni : 3, ridgeNoise : 4});
    terrainParameters.add(controls,'ResetTerrain');
    terrainParameters.add(controls,'Import Height Map');
    terrainParameters.add(controls,'Clear Height Map');
    terrainParameters.open();
    var erosionpara = gui.addFolder('Erosion Parameters');
    var RainErosionPara = erosionpara.addFolder('Rain Erosion Parameters');
    RainErosionPara.add(controls,'RainErosion');
    RainErosionPara.add(controls, 'RainErosionStrength', 0.1,3.0);
    RainErosionPara.add(controls,'RainErosionDropSize', 0.1, 3.0);
    RainErosionPara.close();
    erosionpara.add(controls, 'ErosionMode', {RiverMode : 0, MountainMode : 1, PolygonalMode : 2});
    erosionpara.add(controls, 'VelocityAdvectionMag', 0.0, 0.5);
    erosionpara.add(controls, 'EvaporationConstant', 0.0001, 0.08);
    erosionpara.add(controls,'Kc', 0.01,0.5);
    erosionpara.add(controls,'Ks', 0.001,0.2);
    erosionpara.add(controls,'Kd', 0.0001,0.1);
    //erosionpara.add(controls,'AdvectionSpeedScaling', 0.1, 1.0);
    erosionpara.add(controls, 'TerrainDebug', {noDebugView : 0, sediment : 1, velocity : 2, velocityHeatmap : 9, terrain : 3, flux : 4, terrainflux : 5, maxslippage : 6, flowMap : 7, spikeDiffusion : 8, rockMaterial : 10});
    erosionpara.add(controls, 'AdvectionMethod', {Semilagrangian : 0, MacCormack : 1});
    erosionpara.add(controls, 'VelocityMultiplier',1.0,5.0);
    erosionpara.open();
    var thermalerosionpara = gui.addFolder("Thermal Erosion Parameters");
    thermalerosionpara.add(controls, 'thermalTalusAngleScale', 1.0, 10.0);
    thermalerosionpara.add(controls,'thermalErosionScale',0.0, 5.0 );
    //thermalerosionpara.open();
    var terraineditor = gui.addFolder('Terrain Editor');
    const brushTypeController = terraineditor.add(controls,'brushType',{NoBrush : 0, TerrainBrush : 1, WaterBrush : 2, RockBrush : 3, SmoothBrush : 4, FlattenBrush : 5, SlopeBrush : 6});
    brushTypeController.onChange((value: number) => {
        // Reset slope state when switching brush types
        if (value !== 6) {
            controls.slopeActive = 0;
        }
        // Update brush palette to reflect change
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    terraineditor.add(controls,'flattenTargetHeight', 0.0, 500.0);
    terraineditor.add(controls,'rockErosionResistance', 0.0, 1.0);
    const brushSizeController = terraineditor.add(controls,'brushSize',0.1, 20.0);
    const brushStrengthController = terraineditor.add(controls,'brushStrenth',0.1,2.0);
    const brushOperationController = terraineditor.add(controls,'brushOperation', {Add : 0, Subtract : 1});
    terraineditor.open();
    
    // Initialize brush palette UI (floating palette for quick brush selection)
    const brushPalette = initBrushPalette(
        controls,
        (brushType: number) => {
            controls.brushType = brushType;
            // Reset slope state when switching brush types
            if (brushType !== 6) {
                controls.slopeActive = 0;
            }
            // Update dat-gui to reflect the change
            brushTypeController.updateDisplay();
        },
        (size: number) => {
            controls.brushSize = size;
            brushSizeController.updateDisplay();
        },
        (strength: number) => {
            controls.brushStrenth = strength;
        },
        (operation: number) => {
            controls.brushOperation = operation;
            brushOperationController.updateDisplay();
        }
    );
    (window as any).brushPalette = brushPalette; // Store reference for updates
    
    // Store brushSize controller reference for updating UI when changed via Ctrl+Scroll
    (window as any).brushSizeController = brushSizeController;
    
    // Update palette when controls change from dat-gui
    brushTypeController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushSizeController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushStrengthController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushOperationController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    var renderingpara = gui.addFolder('Rendering Parameters');
    renderingpara.add(controls, 'WaterTransparency', 0.0, 1.0);
    renderingpara.add(controls, 'TerrainPlatte', {AlpineMtn : 0, Desert : 1, Jungle : 2});
    renderingpara.add(controls, 'SnowRange', 0.0, 100.0);
    renderingpara.add(controls, 'ForestRange', 0.0, 50.0);
    renderingpara.add(controls,'ShowFlowTrace');
    renderingpara.add(controls,'SedimentTrace');
    renderingpara.add(controls,'showScattering');
    renderingpara.add(controls,'enableBilateralBlur');
    var renderingparalightpos = renderingpara.addFolder('sunPos/Dir');
    renderingparalightpos.add(controls,'lightPosX',-1.0,1.0);
    renderingparalightpos.add(controls,'lightPosY',0.0,1.0);
    renderingparalightpos.add(controls,'lightPosZ',-1.0,1.0);
    renderingparalightpos.open();
    renderingpara.open();

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  gl_context = <WebGL2RenderingContext> canvas.getContext('webgl2');
  setGlContext(gl_context);
  setClientDimensions(canvas.clientWidth, canvas.clientHeight);


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
        // Update mouse position for ray casting
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
        // Update mouse position for ray casting
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
      const sizeChange = scrollDelta * 0.01; // Much more granular: 0.01 per scroll unit
      const newSize = controls.brushSize - sizeChange; // Invert because scroll down should decrease
      
      // Clamp to valid range (0.1 to 20.0) and round to 2 decimal places for cleaner values
      controls.brushSize = Math.round(Math.max(0.1, Math.min(20.0, newSize)) * 100) / 100;
      
      // Force dat-gui controller to update the display
      const brushSizeController = (window as any).brushSizeController;
      if (brushSizeController) {
        brushSizeController.updateDisplay();
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

  // Load settings (from localStorage or defaults)
  controlsConfig = loadSettings();

  // Check if brush uses left click (either from mouse.brushActivate or keys.brushActivate)
  const brushUsesLeftClick = controlsConfig.mouse.brushActivate === 'LEFT' || 
                             (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  const camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClick);
  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.0, 0.0, 0.0, 0);
  gl_context.enable(gl_context.DEPTH_TEST);

    setupFramebufferandtextures(gl_context, simres);
    //=================================================================
    //load in the shaders

    const lambert = new ShaderProgram([
    new Shader(gl_context.VERTEX_SHADER, require('./shaders/terrain-vert.glsl')),
    new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/terrain-frag.glsl')),
    ]);

    const flat = new ShaderProgram([
    new Shader(gl_context.VERTEX_SHADER, require('./shaders/flat-vert.glsl')),
    new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/flat-frag.glsl')),
    ]);

    noiseterrain = new ShaderProgram([
      new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
      new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/initial-frag.glsl')),
    ]);

    const flow = new ShaderProgram([
      new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
      new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/flow-frag.glsl')),
    ]);

    const waterhight = new ShaderProgram([
      new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
      new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/alterwaterhight-frag.glsl')),
    ]);

    const sediment = new ShaderProgram([
      new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
      new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/sediment-frag.glsl')),
    ]);

    const sediadvect = new ShaderProgram([
      new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
      new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/sediadvect-frag.glsl')),
    ]);

    const macCormack = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/maccormack-frag.glsl')),
    ]);

    const rains = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/rain-frag.glsl')),
    ]);


    const evaporation = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/eva-frag.glsl')),
    ]);

    const average = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/average-frag.glsl')),
    ]);

    const clean = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/clean-frag.glsl')),
    ]);

    const water = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/water-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/water-frag.glsl')),
    ]);

    const thermalterrainflux = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/thermalterrainflux-frag.glsl')),
    ]);

    const thermalapply = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/thermalapply-frag.glsl')),
    ]);


    const maxslippageheight = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/maxslippageheight-frag.glsl')),
    ]);

    const shadowMapShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/shadowmap-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/shadowmap-frag.glsl')),
    ]);

    const sceneDepthShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/terrain-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/sceneDepth-frag.glsl')),
    ]);

    const combinedShader = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/combine-frag.glsl')),
    ]);

    const bilateralBlur = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/bilateralBlur-frag.glsl')),
    ]);

    const veladvect = new ShaderProgram([
        new Shader(gl_context.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
        new Shader(gl_context.FRAGMENT_SHADER, require('./shaders/veladvect-frag.glsl')),
        ]
    );


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

  function tick() {


    // ================ ray casting ===================
    //===================================================
    let iclientWidth = window.innerWidth;
    let iclientHeight = window.innerHeight;
    var screenMouseX = lastX / iclientWidth;
    var screenMouseY = lastY / iclientHeight;
    //console.log(screenMouseX + ' ' + screenMouseY);

      //console.log(clientHeight + ' ' + clientWidth);
    let viewProj = mat4.create();
    let invViewProj = mat4.create();
    mat4.multiply(viewProj, camera.projectionMatrix, camera.viewMatrix);
    mat4.invert(invViewProj,viewProj);
    let mousePoint = vec4.fromValues(2.0 * screenMouseX - 1.0, 1.0 - 2.0 * screenMouseY, -1.0, 1.0);
    let mousePointEnd = vec4.fromValues(2.0 * screenMouseX - 1.0, 1.0 - 2.0 * screenMouseY, -0.0, 1.0);

    vec4.transformMat4(mousePoint,mousePoint,invViewProj);
    vec4.transformMat4(mousePointEnd,mousePointEnd,invViewProj);
    mousePoint[0] /= mousePoint[3];
    mousePoint[1] /= mousePoint[3];
    mousePoint[2] /= mousePoint[3];
    mousePoint[3] /= mousePoint[3];
    mousePointEnd[0] /= mousePointEnd[3];
    mousePointEnd[1] /= mousePointEnd[3];
    mousePointEnd[2] /= mousePointEnd[3];
    mousePointEnd[3] /= mousePointEnd[3];
    let dir = vec3.fromValues(mousePointEnd[0] - mousePoint[0], mousePointEnd[1] - mousePoint[1], mousePointEnd[2] - mousePoint[2]);
    vec3.normalize(dir,dir);
    let ro = vec3.fromValues(mousePoint[0], mousePoint[1], mousePoint[2]);


    //==========set initial terrain uniforms=================
    timer++;
    noiseterrain.setTime(timer);
    noiseterrain.setTerrainHeight(controls.TerrainHeight);
    noiseterrain.setTerrainScale(controls.TerrainScale);
    noiseterrain.setInt(controls.TerrainMask,"u_TerrainMask");
    gl_context.uniform1i(gl_context.getUniformLocation(noiseterrain.prog,"u_terrainBaseType"),controls.TerrainBaseType);


    if(TerrainGeometryDirty){

        //=============clean up all simulation textures===================
        cleanUpTextures();
        //=============recreate base terrain textures=====================
        Render2Texture(renderer,gl_context,camera,noiseterrain,read_terrain_tex,square,noiseterrain);
        Render2Texture(renderer,gl_context,camera,noiseterrain,write_terrain_tex,square,noiseterrain);

        setTerrainGeometryDirty(false);
    }

    //ray cast happens here
    let pos = vec2.fromValues(0.0, 0.0);
    pos = rayCast(ro, dir, simres, HightMapCpuBuf);
    controls.posTemp = pos;

    //===================per tick uniforms==================


    flat.setTime(timer);

    gl_context.uniform1f(gl_context.getUniformLocation(flat.prog,"u_far"),camera.far);
    gl_context.uniform1f(gl_context.getUniformLocation(flat.prog,"u_near"),camera.near);
    gl_context.uniform3fv(gl_context.getUniformLocation(flat.prog,"unif_LightPos"),vec3.fromValues(controls.lightPosX,controls.lightPosY,controls.lightPosZ));

    water.setWaterTransparency(controls.WaterTransparency);
    water.setSimres(simres);
    gl_context.uniform1f(gl_context.getUniformLocation(water.prog,"u_far"),camera.far);
    gl_context.uniform1f(gl_context.getUniformLocation(water.prog,"u_near"),camera.near);
    gl_context.uniform3fv(gl_context.getUniformLocation(water.prog,"unif_LightPos"),vec3.fromValues(controls.lightPosX,controls.lightPosY,controls.lightPosZ));

    lambert.setTerrainDebug(controls.TerrainDebug);
    lambert.setMouseWorldPos(mousePoint);
    lambert.setMouseWorldDir(dir);
    lambert.setBrushSize(controls.brushSize);
    lambert.setBrushType(controls.brushType);
    lambert.setBrushPos(pos);
    lambert.setSimres(simres);
    lambert.setFloat(controls.SnowRange, "u_SnowRange");
    lambert.setFloat(controls.ForestRange, "u_ForestRange");
    lambert.setInt(controls.TerrainPlatte, "u_TerrainPlatte");
    lambert.setInt(controls.ShowFlowTrace ? 0 : 1,"u_FlowTrace");
    lambert.setInt(controls.SedimentTrace ? 0 : 1,"u_SedimentTrace");
    // Create arrays for shader uniforms (water sources)
    const sourcePositions = new Float32Array(MAX_WATER_SOURCES * 2);
    const sourceSizes = new Float32Array(MAX_WATER_SOURCES);
    const sourceStrengths = new Float32Array(MAX_WATER_SOURCES);

    // Fill arrays with source data
    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
        if (i < waterSources.length) {
            sourcePositions[i * 2] = waterSources[i].position[0];
            sourcePositions[i * 2 + 1] = waterSources[i].position[1];
            sourceSizes[i] = waterSources[i].size;
            sourceStrengths[i] = waterSources[i].strength;
        } else {
            // Fill with zeros for inactive sources
            sourcePositions[i * 2] = 0.0;
            sourcePositions[i * 2 + 1] = 0.0;
            sourceSizes[i] = 0.0;
            sourceStrengths[i] = 0.0;
        }
    }

    // Set source arrays for terrain shader (visualization)
    lambert.setSourceCount(getWaterSourceCount());
    lambert.setSourcePositions(sourcePositions);
    lambert.setSourceSizes(sourceSizes);
    gl_context.uniform3fv(gl_context.getUniformLocation(lambert.prog,"unif_LightPos"),vec3.fromValues(controls.lightPosX,controls.lightPosY,controls.lightPosZ));

    sceneDepthShader.setSimres(simres);

    rains.setMouseWorldPos(mousePoint);
    rains.setMouseWorldDir(dir);
    rains.setBrushSize(controls.brushSize);
    rains.setBrushStrength(controls.brushStrenth);
    rains.setBrushType(controls.brushType);
    rains.setBrushPressed(controls.brushPressed);
    rains.setSimres(simres);
    
    // Update brush state (flatten target height, slope end points, etc.)
    const brushContext: BrushContext = {
        controls: controls as BrushControls,
        controlsConfig: controlsConfig,
        simres: simres,
        HightMapCpuBuf: HightMapCpuBuf
    };
    updateBrushState(pos, brushContext);
    
    // Set brush uniforms for shader
    rains.setFloat(controls.flattenTargetHeight, 'u_FlattenTargetHeight');
    rains.setVec2(controls.slopeStartPos, 'u_SlopeStartPos');
    rains.setVec2(controls.slopeEndPos, 'u_SlopeEndPos');
    rains.setInt(controls.slopeActive, 'u_SlopeActive');
    // Set source arrays for rain shader (water emission)
    rains.setSourceCount(getWaterSourceCount());
    rains.setSourcePositions(sourcePositions);
    rains.setSourceSizes(sourceSizes);
    rains.setSourceStrengths(sourceStrengths);
    rains.setBrushPos(pos);
    // Set brush operation - this determines add vs subtract mode
    rains.setBrushOperation(controls.brushOperation);
    rains.setSpawnPos(vec2.fromValues(controls.spawnposx, controls.spawnposy));
    rains.setTime(timer);
    gl_context.uniform1i(gl_context.getUniformLocation(rains.prog,"u_RainErosion"),controls.RainErosion ? 1 : 0);
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
    gl_context.uniform1f(gl_context.getUniformLocation(thermalterrainflux.prog,"unif_thermalRate"),controls.thermalRate);

    thermalapply.setSimres(simres);
    thermalapply.setPipeLen(controls.pipelen);
    thermalapply.setTimestep(controls.timestep);
    thermalapply.setPipeArea(controls.pipeAra);
    gl_context.uniform1f(gl_context.getUniformLocation(thermalapply.prog,"unif_thermalErosionScale"),controls.thermalErosionScale);

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

    camera.update();
    stats.begin();

      //==========================  we begin simulation from now ===========================================

    for(let i = 0;i<controls.SimulationSpeed;i++) {
        SimulationStep(SimFramecnt, flow, waterhight, veladvect,sediment, sediadvect, macCormack,rains,evaporation,average,thermalterrainflux, thermalapply, maxslippageheight, renderer, gl_context, camera);
        incrementSimFramecnt();
    }

    gl_context.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();

    //========================== we enter a series of render pass from now ================================
    //========================== pass 1 : render shadow map pass=====================================


      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,shadowMap_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,shadowMap_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,shadowMap_render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

      let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
      if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
          console.log( "frame buffer status:" + status.toString());
      }

      gl_context.bindTexture(gl_context.TEXTURE_2D,null);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
      gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

      gl_context.viewport(0,0,shadowMapResolution,shadowMapResolution);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,shadowMap_frame_buffer);
      renderer.clear();// clear when attached to shadow map
      shadowMapShader.use();

      gl_context.activeTexture(gl_context.TEXTURE0);
      gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
      gl_context.uniform1i(gl_context.getUniformLocation(shadowMapShader.prog,"hightmap"),0);

      gl_context.activeTexture(gl_context.TEXTURE1);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
      gl_context.uniform1i(gl_context.getUniformLocation(shadowMapShader.prog, "sedimap"), 1);

      let lightViewMat = mat4.create();
      let lightProjMat = mat4.create();
      lightProjMat = mat4.ortho(lightProjMat,-1.6,1.6,-1.6,1.6,0,100);
      lightViewMat = mat4.lookAt(lightViewMat, [controls.lightPosX,controls.lightPosY,controls.lightPosZ],[0,0,0],[0,1,0]);

      gl_context.uniformMatrix4fv(gl_context.getUniformLocation(shadowMapShader.prog,'u_proj'),false,lightProjMat);
      gl_context.uniformMatrix4fv(gl_context.getUniformLocation(shadowMapShader.prog,'u_view'),false,lightViewMat);
      shadowMapShader.setSimres(simres);

      renderer.render(camera,shadowMapShader,[plane]);
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);


      //=========================== pass 2 :  render scene depth tex ================================
      sceneDepthShader.use();
      gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,deferred_frame_buffer);
      gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,scene_depth_tex,0);
      gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,deferred_render_buffer);

      gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

      status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
      if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
          console.log( "frame buffer status:" + status.toString());
      }

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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
      console.log( "frame buffer status:" + status.toString());
    }
    renderer.clear();

    lambert.use();
    gl_context.viewport(0,0,window.innerWidth, window.innerHeight);
    //plane.setDrawMode(gl_context.LINE_STRIP);
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    let PingUniform = gl_context.getUniformLocation(lambert.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,terrain_nor);
    let norUniform = gl_context.getUniformLocation(lambert.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    let sediUniform = gl_context.getUniformLocation(lambert.prog, "sedimap");
    gl_context.uniform1i(sediUniform, 2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_vel_tex);
    let velUniform = gl_context.getUniformLocation(lambert.prog, "velmap");
    gl_context.uniform1i(velUniform, 3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_flux_tex);
    let fluxUniform = gl_context.getUniformLocation(lambert.prog, "fluxmap");
    gl_context.uniform1i(fluxUniform, 4);

    gl_context.activeTexture(gl_context.TEXTURE5);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_flux_tex);
    let terrainfluxUniform = gl_context.getUniformLocation(lambert.prog, "terrainfluxmap");
    gl_context.uniform1i(terrainfluxUniform, 5);

    gl_context.activeTexture(gl_context.TEXTURE6);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_maxslippage_tex);
    let terrainslippageUniform = gl_context.getUniformLocation(lambert.prog, "maxslippagemap");
    gl_context.uniform1i(terrainslippageUniform, 6);

    gl_context.activeTexture(gl_context.TEXTURE7);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_blend);
    gl_context.uniform1i(gl_context.getUniformLocation(lambert.prog, "sediBlend"), 7);


    gl_context.activeTexture(gl_context.TEXTURE8);
    gl_context.bindTexture(gl_context.TEXTURE_2D, shadowMap_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(lambert.prog, "shadowMap"), 8);

    gl_context.activeTexture(gl_context.TEXTURE9);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(lambert.prog, "sceneDepth"), 9);

    gl_context.uniformMatrix4fv(gl_context.getUniformLocation(lambert.prog,'u_sproj'),false,lightProjMat);
    gl_context.uniformMatrix4fv(gl_context.getUniformLocation(lambert.prog,'u_sview'),false,lightViewMat);


      renderer.render(camera, lambert, [
      plane,
    ]);

    // =============== water =====================
    gl_context.enable(gl_context.BLEND);
    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);
    water.use();
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    PingUniform = gl_context.getUniformLocation(water.prog,"hightmap");
    gl_context.uniform1i(PingUniform,0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,terrain_nor);
    norUniform = gl_context.getUniformLocation(water.prog,"normap");
    gl_context.uniform1i(norUniform,1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_sediment_tex);
    sediUniform = gl_context.getUniformLocation(water.prog,"sedimap");
    gl_context.uniform1i(sediUniform,2);

    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,scene_depth_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(water.prog,"sceneDepth"),3);

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D,color_pass_reflection_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(water.prog,"colorReflection"),4);


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

    status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
      console.log( "frame buffer status:" + status.toString());
    }

    renderer.clear();// clear when attached to scene depth map
    gl_context.viewport(0,0,window.innerWidth, window.innerHeight);

    flat.use();

    gl_context.enable(gl_context.DEPTH_TEST);
    gl_context.depthFunc(gl_context.LESS);
    gl_context.enable(gl_context.BLEND);
    gl_context.blendFunc(gl_context.SRC_ALPHA, gl_context.ONE_MINUS_SRC_ALPHA);

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(flat.prog,"hightmap"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(flat.prog,"sceneDepth"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, shadowMap_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(flat.prog,"shadowMap"),2);

    gl_context.uniformMatrix4fv(gl_context.getUniformLocation(flat.prog,'u_sproj'),false,lightProjMat);
    gl_context.uniformMatrix4fv(gl_context.getUniformLocation(flat.prog,'u_sview'),false,lightViewMat);
    gl_context.uniform1i(gl_context.getUniformLocation(flat.prog,"u_showScattering"),controls.showScattering ? 1 : 0);

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

              status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
              if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
                  console.log("frame buffer status:" + status.toString());
              }

              renderer.clear();// clear when attached to scene depth map

              bilateralBlur.use();
              gl_context.activeTexture(gl_context.TEXTURE0);
              if (i == 0) {
                  gl_context.bindTexture(gl_context.TEXTURE_2D, scatter_pass_tex);
              } else {
                  gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_vertical_tex);
              }
              gl_context.uniform1i(gl_context.getUniformLocation(bilateralBlur.prog, "scatter_tex"), 0);

              gl_context.activeTexture(gl_context.TEXTURE1);
              gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
              gl_context.uniform1i(gl_context.getUniformLocation(bilateralBlur.prog, "scene_depth"), 1);

              gl_context.uniform1f(gl_context.getUniformLocation(bilateralBlur.prog, "u_far"), camera.far);
              gl_context.uniform1f(gl_context.getUniformLocation(bilateralBlur.prog, "u_near"), camera.near);

              gl_context.uniform1i(gl_context.getUniformLocation(bilateralBlur.prog, "u_isHorizontal"), i % 2);


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
    gl_context.uniform1i(gl_context.getUniformLocation(combinedShader.prog,"color_tex"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    if(controls.enableBilateralBlur)
        gl_context.bindTexture(gl_context.TEXTURE_2D, bilateral_filter_horizontal_tex);
    else
        gl_context.bindTexture(gl_context.TEXTURE_2D, scatter_pass_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(combinedShader.prog,"bi_tex"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(gl_context.getUniformLocation(combinedShader.prog,"sceneDepth_tex"),2);

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
