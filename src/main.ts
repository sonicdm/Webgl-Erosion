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
import { MAX_LAVA_SOURCES, lavaSources, getLavaSourceCount } from './utils/lava-sources';
import { rayCast } from './utils/raycast';
import { rayCastBVH } from './utils/bvh-raycast';
import { createTerrainGeometry, updateTerrainGeometry } from './utils/terrain-geometry-builder';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { createHeightMapLoader } from './utils/heightmap-loader';
import { getCachedUniformLocation } from './utils/uniform-cache';
import { LoadProgressTracker, LoadPhase } from './utils/load-progress';
import { 
    simres, shadowMapResolution, SimFramecnt, TerrainGeometryDirty, PauseGeneration, 
    HightMapCpuBuf, HightMapBufCounter, MaxHightMapBufCounter, shouldReadHeightmap, setSimRes, setGlContext, 
    setClientDimensions, setLastMousePosition, clientWidth, clientHeight, lastX, lastY,
    setPauseGeneration, setSimFramecnt, incrementSimFramecnt, setTerrainGeometryDirty,
    resizeHightMapCpuBuf, incrementHightMapBufCounter, resetHightMapBufCounter,
    terrainGeometry, terrainBVH, setTerrainGeometry, setTerrainBVH,
    terrainBVHBuildInProgress, setTerrainBVHBuildInProgress,
    HightMapBufIsFresh, setHightMapBufIsFresh,
    geometryUpdateCounter, geometryNeedsUpdate, geometryUpdateInterval, enableBVHUpdates,
    incrementGeometryUpdateCounter, resetGeometryUpdateCounter,
    setGeometryNeedsUpdate, shouldUpdateGeometry, setEnableBVHUpdates
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
    read_lava_tex, write_lava_tex, read_lava_flux_tex, write_lava_flux_tex,
    setupFramebufferandtextures, resizeTextures4Simulation, resizeScreenTextures,
    setHeightMapTexture, getHeightMapTexture,
    swapTerrainTextures, swapFluxTextures, swapVelTextures, swapSedimentTextures,
    swapSedimentBlendTextures, swapMaxSlippageTextures, swapTerrainFluxTextures,
    swapBilateralFilterTextures, swapLavaTextures, swapLavaFluxTextures
} from './simulation/texture-management';
import { Render2Texture } from './rendering/render-utils';
import { createShaders, Shaders } from './rendering/shader-factory';
import { THREEJS_CONFIG } from './three/config';
import { ThreeJSSimulationRuntime } from './three/integration';
import { createTerrainIO } from './three/utils/terrain-io';

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
    'Export Height Map': () => {}, // Will be set in main() after gl_context is available
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
    // Lava physics parameters
    LavaViscosityPreExp : 1e-5,
    LavaActivationEnergy : 200000.0,
    LavaDensity : 2700.0,
    LavaSpecificHeat : 1200.0,
    LavaAirHeatTransfer : 200.0, // Increased from 30.0 (6-7x faster cooling)
    LavaWaterHeatTransfer : 2000.0,
    LavaAmbientTemp : 20.0,
    LavaWaterTemp : 10.0,
    LavaContactHeatTransfer : 200.0,
    LavaMeltThreshold : 1200.0,
    LavaLatentHeatFusion : 400000.0,
    LavaSolidificationTemp : 800.0,
    LavaInitialTemp : 1200.0,
    LavaGlowIntensity : 2.0,
    LavaPatternFrequency : 8.0, // Pattern frequency/scale for lava texture detail
    LavaSourceCount : 0, // Number of active lava sources
    'Reset Erosion Parameters': () => {
        // Reset all erosion parameters to defaults
        controls.Kc = 0.06;
        controls.Ks = 0.036;
        controls.Kd = 0.006;
        controls.ErosionMode = 0;
        controls.EvaporationConstant = 0.003;
        controls.VelocityMultiplier = 1;
        controls.VelocityAdvectionMag = 0.2;
        controls.AdvectionMethod = 1;
        controls.RainErosion = false;
        controls.RainErosionStrength = 0.2;
        controls.RainErosionDropSize = 2.0;
        
        // Update GUI controllers to reflect the changes
        const controllers = (window as any).erosionControllers;
        if (controllers) {
            controllers.kcController.updateDisplay();
            controllers.ksController.updateDisplay();
            controllers.kdController.updateDisplay();
            controllers.erosionModeController.updateDisplay();
            controllers.evaporationController.updateDisplay();
            controllers.velocityMultiplierController.updateDisplay();
            controllers.velocityAdvectionController.updateDisplay();
            controllers.advectionMethodController.updateDisplay();
            controllers.rainErosionController.updateDisplay();
            controllers.rainErosionStrengthController.updateDisplay();
            controllers.rainErosionDropSizeController.updateDisplay();
        }
    },
};





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
    setTerrainRandom();
    setTerrainGeometryDirty(true);
    // Resolution change will be handled in the TerrainGeometryDirty block
    //PauseGeneration = true;
}

function setTerrainRandom() {
    const angle = Math.random() * Math.PI * 2.0;
    terrainRandom.duneDir[0] = Math.cos(angle);
    terrainRandom.duneDir[1] = Math.sin(angle);

    terrainRandom.craterDensity = 0.8 + Math.random() * 0.7;
    terrainRandom.canyonDepth = 0.45 + Math.random() * 0.5;
    terrainRandom.seedOffset[0] = Math.random() * 256.0;
    terrainRandom.seedOffset[1] = Math.random() * 256.0;

    setTerrainGeometryDirty(true);
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
                         maxslippageheight:ShaderProgram,
                         lavaFlow:ShaderProgram,
                         lavaUpdate:ShaderProgram,
                         lavaTerrain:ShaderProgram,
                         lavaSourcePositions:Float32Array,
                         lavaSourceSizes:Float32Array,
                         lavaSourceStrengths:Float32Array,
                         lavaSourceCount:number,
                         controls:any,
                         reusableMousePoint:vec4,
                         reusableDir:vec3,
                         reusablePos:vec2) {


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

    gl_context.activeTexture(gl_context.TEXTURE4);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(sedi.prog,"readLava"),4);

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
    // Lava Flow Calculation
    // 7.1---use terrain map and lava map to derive lava flux map :
    // terrain map + lava map -----> lava flux map
    //////////////////////////////////////////////////////////////////

    // Unbind all textures first to avoid feedback loops
    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.activeTexture(gl_context.TEXTURE3);
    gl_context.bindTexture(gl_context.TEXTURE_2D,null);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_lava_flux_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    lavaFlow.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog,"readLava"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog,"readLavaFlux"),2);

    lavaFlow.setSimres(simres);
    lavaFlow.setPipeLen(controls.pipelen);
    lavaFlow.setTimestep(controls.timestep);
    lavaFlow.setPipeArea(controls.pipeAra);
    // Physics constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaViscosityPreExp"), controls.LavaViscosityPreExp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaActivationEnergy"), controls.LavaActivationEnergy);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaGasConstant"), 8.314); // Gas constant R = 8.314 J/(mol·K)
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceSizes"), lavaSourceSizes);

    renderer.render(camera,lavaFlow,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    //-----swap lava flux ping and pong
    swapLavaFluxTextures();
    //-----swap lava flux ping and pong

    //////////////////////////////////////////////////////////////////
    // Lava Volume Update
    // 7.2---use lava flux map and lava map to derive new lava map :
    // lava map + lava flux map -----> lava map (with temperature updates)
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_lava_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    lavaUpdate.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog,"readLava"),1);

    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog,"readLavaFlux"),2);

    lavaUpdate.setSimres(simres);
    lavaUpdate.setPipeLen(controls.pipelen);
    lavaUpdate.setTimestep(controls.timestep);
    lavaUpdate.setPipeArea(controls.pipeAra);
    // Heat transfer constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAirHeatTransfer"), controls.LavaAirHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterHeatTransfer"), controls.LavaWaterHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAmbientTemp"), controls.LavaAmbientTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSpecificHeat"), controls.LavaSpecificHeat);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSourceSizes"), lavaSourceSizes);
    gl_context.uniform1fv(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSourceStrengths"), lavaSourceStrengths);
    
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

    renderer.render(camera,lavaUpdate,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

    //-----swap lava ping and pong
    swapLavaTextures();
    //-----swap lava ping and pong

    //////////////////////////////////////////////////////////////////
    // Lava-Terrain Interaction (Melting and Solidification)
    // 7.3---use lava map and terrain map to derive new terrain map :
    // terrain map + lava map -----> terrain map (with melting and solidification)
    // Also updates lava map (removes solidified parts)
    //////////////////////////////////////////////////////////////////

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT0,gl_context.TEXTURE_2D,write_terrain_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT1,gl_context.TEXTURE_2D,write_lava_tex,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT2,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER,gl_context.COLOR_ATTACHMENT3,gl_context.TEXTURE_2D,null,0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER,gl_context.DEPTH_ATTACHMENT,gl_context.RENDERBUFFER,render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0, gl_context.COLOR_ATTACHMENT1]);

    gl_context.bindTexture(gl_context.TEXTURE_2D,null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER,null);

    gl_context.viewport(0,0,simres,simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,frame_buffer);

    renderer.clear();
    lavaTerrain.use();

    gl_context.activeTexture(gl_context.TEXTURE0);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_terrain_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog,"readTerrain"),0);

    gl_context.activeTexture(gl_context.TEXTURE1);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog,"readLava"),1);
    gl_context.activeTexture(gl_context.TEXTURE2);
    gl_context.bindTexture(gl_context.TEXTURE_2D,read_lava_flux_tex);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog,"readLavaFlux"),2);

    lavaTerrain.setSimres(simres);
    lavaTerrain.setTimestep(controls.timestep);
    // Thermal erosion and solidification constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaContactHeatTransfer"), controls.LavaContactHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaMeltThreshold"), controls.LavaMeltThreshold);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaLatentHeatFusion"), controls.LavaLatentHeatFusion);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSourceCount"), lavaSourceCount);
    gl_context.uniform2fv(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSourcePositions"), lavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSourceSizes"), lavaSourceSizes);

    renderer.render(camera,lavaTerrain,[square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER,null);

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
                        lavaFlow:ShaderProgram,
                        lavaUpdate:ShaderProgram,
                        lavaTerrain:ShaderProgram,
                        lavaSourcePositions:Float32Array,
                        lavaSourceSizes:Float32Array,
                        lavaSourceStrengths:Float32Array,
                        lavaSourceCount:number,
                        controls:any,
                        renderer:OpenGLRenderer,
                        gl_context:WebGL2RenderingContext,
                        camera:Camera,
                        reusableMousePoint:vec4,
                        reusableDir:vec3,
                        reusablePos:vec2){
    if(PauseGeneration) return true;
    else{
        SimulatePerStep(renderer,
            gl_context,camera,flow,waterhight,veladvect,sediment,advect, macCormack,rains,evapo,average,thermalterrainflux,thermalapply, maxslippageheight, lavaFlow, lavaUpdate, lavaTerrain, lavaSourcePositions, lavaSourceSizes, lavaSourceStrengths, lavaSourceCount, controls, reusableMousePoint, reusableDir, reusablePos);
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

  // Check if Three.js runtime is enabled
  let threeRuntime: ThreeJSSimulationRuntime | undefined;
  if (THREEJS_CONFIG.USE_THREEJS_RUNTIME) {
    try {
      threeRuntime = new ThreeJSSimulationRuntime(canvas, gl_context, simres);
      threeRuntime.initializeSimulation();
      
      // Set controls config on threeRuntime (must be done before creating event handlers)
      // This will be set later when controlsConfig is loaded, but we need to prepare it
      
      // Initialize terrain textures with procedural generation (async)
      const timer = 0;
      const terrainRandom = {
        seedOffset: [0, 0],
        duneDir: [1, 0],
        craterDensity: 1.0,
        canyonDepth: 1.0
      };

      const { importHeightmap, clearHeightmap, exportHeightmap } = createTerrainIO({
        simres,
        controls,
        getTerrainGeometry: () => threeRuntime.getTerrainGeometry(),
        onHeightmapChange: async (heightmap) => {
          await threeRuntime.initializeTextures(controls, timer, heightmap, terrainRandom);
          const heightData = threeRuntime.readCombinedHeight();
          threeRuntime.updateTerrainGeometry(heightData);
        }
      });

      controls['Import Height Map'] = importHeightmap;
      controls['Clear Height Map'] = clearHeightmap;
      controls['Export Height Map'] = exportHeightmap;
      
      // Use async IIFE to handle async operations
      (async () => {
        try {
          // Initialize terrain textures with procedural generation (await to ensure THREE.Terrain loads)
          console.log('Starting texture initialization...');
          await threeRuntime.initializeTextures(controls, timer, null, terrainRandom);
          console.log('Texture initialization complete');
          
          // Wait a frame for GPU to finish processing
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          // Read initial height data and create terrain geometry immediately
          let terrainInitialized = false;
          try {
            console.log('Reading combined height data...');
            const initialHeightData = threeRuntime.readCombinedHeight();
            console.log('Height data read, length:', initialHeightData.length, 'first 16 values:', Array.from(initialHeightData.slice(0, 16)));
            threeRuntime.updateTerrainGeometry(initialHeightData);
            terrainInitialized = true;
            console.log('Terrain geometry initialized successfully');
          } catch (error) {
            console.error('Failed to create initial terrain geometry:', error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
          }
          
          // Set up animation loop that runs simulation and updates terrain
          // Don't call threeRuntime.start() - we handle the loop ourselves
          let frameCount = 0;
          const animate = () => {
            requestAnimationFrame(animate);
            
            // Only run simulation and render if terrain is initialized
            if (!terrainInitialized) {
              // Try to initialize terrain on first few frames
              if (frameCount < 10) {
                try {
                  const heightData = threeRuntime.readCombinedHeight();
                  threeRuntime.updateTerrainGeometry(heightData);
                  terrainInitialized = true;
                } catch (error) {
                  // Still initializing, skip this frame
                  return;
                }
              } else {
                // Give up after 10 frames
                console.error('Failed to initialize terrain after 10 frames');
                return;
              }
            }
            
            // Run simulation steps
            for (let i = 0; i < controls.SimulationSpeed; i++) {
              threeRuntime.executeSimulationStep(controls);
            }
            
            // Update terrain geometry periodically
            frameCount++;
            if (frameCount % 60 === 0) { // Update every 60 frames
              try {
                const heightData = threeRuntime.readCombinedHeight();
                threeRuntime.updateTerrainGeometry(heightData);
              } catch (error) {
                console.error('Failed to update terrain geometry:', error);
              }
            }
            
            // Render the scene (only if terrain is initialized)
            if (terrainInitialized) {
              threeRuntime.render();
            }
          };
          
          animate();
          console.log('Three.js runtime started successfully');
        } catch (error) {
          console.error('Failed to initialize textures:', error);
        }
      })();
      
      return; // Exit early - Three.js runtime handles its own loop
    } catch (error) {
      console.error('Failed to initialize Three.js runtime:', error);
      console.error('Falling back to WebGL pipeline');
      // Continue with WebGL pipeline below
    }
  }
  
  // Create heightmap loader functions
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(gl_context, simres, controls);
  controls['Import Height Map'] = loadHeightMap;
  controls['Clear Height Map'] = clearHeightMap;
  controls['Export Height Map'] = exportHeightMap;

  // Load settings (from localStorage or defaults) - must be done before creating event handlers
  controlsConfig = loadSettings();
  
  // Apply raycast method from settings
  controls.raycastMethod = controlsConfig.raycast.method;
  
  // Heightfield raycasting uses the CPU heightmap buffer
  
  // Create camera first (needed for event handlers)
  const brushUsesLeftClickForCamera = controlsConfig.mouse.brushActivate === 'LEFT' || 
                                       (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  
  // Use Three.js runtime camera if available, otherwise create WebGL camera
  let camera: Camera;
  if (typeof threeRuntime !== 'undefined' && threeRuntime) {
    // Set controls config on Three.js runtime and get its camera
    threeRuntime.setControlsConfig(controlsConfig, brushUsesLeftClickForCamera);
    const threeCamera = threeRuntime.getCamera();
    if (threeCamera) {
      camera = threeCamera;
    } else {
      // Fallback: create WebGL camera if Three.js camera not ready
      camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClickForCamera);
    }
  } else {
    // WebGL pipeline: create camera normally
    camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClickForCamera);
  }
  
  // Create event handlers (must be done after controlsConfig and camera are loaded)
  const eventHandlers = createEventHandlers(controls, controlsConfig, camera);
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
      setLastMousePosition(e.clientX, e.clientY);
      
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
      setLastMousePosition(e.clientX, e.clientY);
      
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
        combinedShader, bilateralBlur, veladvect, lavaFlow, lavaUpdate, lavaTerrain
    } = shaders;
    noiseterrain = shaders.noiseterrain;
    setTerrainRandom();


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
        // CRITICAL: Initialize lava textures to zero to prevent ghosting from uninitialized data
        // The vertex shader reads from lavamap, so it must contain valid (zero) data
        Render2Texture(renderer, gl_context, camera, clean, read_lava_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_lava_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, read_lava_flux_tex, square, noiseterrain);
        Render2Texture(renderer, gl_context, camera, clean, write_lava_flux_tex, square, noiseterrain);
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
  
  const reusableLavaSourcePositions = new Float32Array(MAX_LAVA_SOURCES * 2);
  const reusableLavaSourceSizes = new Float32Array(MAX_LAVA_SOURCES);
  const reusableLavaSourceStrengths = new Float32Array(MAX_LAVA_SOURCES);

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
    if (noiseterrain) {
        noiseterrain.setTime(timer);
        noiseterrain.setTerrainHeight(controls.TerrainHeight);
        noiseterrain.setTerrainScale(controls.TerrainScale);
        noiseterrain.setInt(controls.TerrainMask,"u_TerrainMask");
        gl_context.uniform1i(getCachedUniformLocation(noiseterrain.prog,"u_terrainBaseType"),controls.TerrainBaseType);
        gl_context.uniform2fv(getCachedUniformLocation(noiseterrain.prog,"u_TerrainSeedOffset"), terrainRandom.seedOffset);
        gl_context.uniform2fv(getCachedUniformLocation(noiseterrain.prog,"u_DuneDir"), terrainRandom.duneDir);
        gl_context.uniform1f(getCachedUniformLocation(noiseterrain.prog,"u_CraterDensity"), terrainRandom.craterDensity);
        gl_context.uniform1f(getCachedUniformLocation(noiseterrain.prog,"u_CanyonDepth"), terrainRandom.canyonDepth);
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
                    resizeTextures4Simulation(gl_context, newRes);
                    resizeHightMapCpuBuf(newRes); // Resize the CPU buffer to match new resolution
                    
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
                    Render2Texture(renderer,gl_context,camera,noiseterrain,read_terrain_tex,square,noiseterrain);
                    progressTracker.updateSubPhaseProgress(0.5);
                    Render2Texture(renderer,gl_context,camera,noiseterrain,write_terrain_tex,square,noiseterrain);
                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.GPU_UPLOAD);
                    
                    // Readback phase
                    progressTracker.startPhase(LoadPhase.READBACK);
                    progressTracker.updateSubPhaseProgress(0.0);
                    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
                    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, read_terrain_tex, 0);
                    gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
                    progressTracker.updateSubPhaseProgress(0.5);
                    gl_context.readPixels(0, 0, simres, simres, gl_context.RGBA, gl_context.FLOAT, HightMapCpuBuf);
                    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
                    setHightMapBufIsFresh(true); // Mark buffer as fresh
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
                    HightMapBufIsFresh,
                    bufferLength: HightMapCpuBuf?.length,
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
                if (HightMapBufIsFresh && HightMapCpuBuf && HightMapCpuBuf.length >= simres * simres * 4) {
                    // Verify buffer has actual data (not all zeros)
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
                                    HightMapCpuBuf, 
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
                                        setHightMapBufIsFresh(false); // Mark as consumed
                                        
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
                            setHightMapBufIsFresh(false); // Mark as consumed even on error
                            setTerrainGeometryDirty(false);
                            if (loadingOverlay) {
                                loadingOverlay.classList.remove('visible');
                                console.log('[Loading] Overlay hidden (error)');
                            }
                        }
                    } else {
                        console.log('[BVH] Heightmap buffer has no valid data');
                        setHightMapBufIsFresh(false); // Mark as consumed
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
    gl_context.uniform1i(getCachedUniformLocation(lambert.prog,"u_LavaSourceCount"), getLavaSourceCount());
    gl_context.uniform2fv(getCachedUniformLocation(lambert.prog,"u_LavaSourcePositions"), reusableLavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lambert.prog,"u_LavaSourceSizes"), reusableLavaSourceSizes);
    
    // Note: Lava source arrays for lava update shader are set in SimulatePerStep function
    // They need to be set there because that's where the shader is used
    
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
            HightMapCpuBuf: HightMapCpuBuf,
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
    gl_context.uniform1i(getCachedUniformLocation(rains.prog,"u_RainErosion"),controls.RainErosion ? 1 : 0);
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
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaViscosityPreExp"), controls.LavaViscosityPreExp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaActivationEnergy"), controls.LavaActivationEnergy);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaGasConstant"), 8.314); // Gas constant R = 8.314 J/(mol·K)
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaFlow.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1i(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceCount"), getLavaSourceCount());
    gl_context.uniform2fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourcePositions"), reusableLavaSourcePositions);
    gl_context.uniform1fv(getCachedUniformLocation(lavaFlow.prog,"u_LavaSourceSizes"), reusableLavaSourceSizes);

    lavaUpdate.setSimres(simres);
    lavaUpdate.setPipeLen(controls.pipelen);
    lavaUpdate.setTimestep(controls.timestep);
    lavaUpdate.setPipeArea(controls.pipeAra);
    // Heat transfer constants from controls
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAirHeatTransfer"), controls.LavaAirHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterHeatTransfer"), controls.LavaWaterHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaAmbientTemp"), controls.LavaAmbientTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaSpecificHeat"), controls.LavaSpecificHeat);
    gl_context.uniform1f(getCachedUniformLocation(lavaUpdate.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    
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
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaContactHeatTransfer"), controls.LavaContactHeatTransfer);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaMeltThreshold"), controls.LavaMeltThreshold);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaLatentHeatFusion"), controls.LavaLatentHeatFusion);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaSolidificationTemp"), controls.LavaSolidificationTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaInitialTemp"), controls.LavaInitialTemp);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaDensity"), controls.LavaDensity);
    gl_context.uniform1f(getCachedUniformLocation(lavaTerrain.prog,"u_LavaWaterTemp"), controls.LavaWaterTemp);

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
    const justReleased = !brushPressed && lastBrushPressed === 1; // Brush was just released
    incrementHightMapBufCounter();
    stats.begin();

      //==========================  we begin simulation from now ===========================================

    for(let i = 0;i<controls.SimulationSpeed;i++) {
        SimulationStep(SimFramecnt, flow, waterhight, veladvect,sediment, sediadvect, macCormack,rains,evaporation,average,thermalterrainflux, thermalapply, maxslippageheight, lavaFlow, lavaUpdate, lavaTerrain, reusableLavaSourcePositions, reusableLavaSourceSizes, reusableLavaSourceStrengths, getLavaSourceCount(), controls, renderer, gl_context, camera, reusableMousePoint, reusableDir, reusablePos);
        incrementSimFramecnt();
    }
    
    // Only track update counter if BVH updates are enabled
    // This avoids unnecessary overhead when updates are disabled
    if (enableBVHUpdates && controls.SimulationSpeed > 0 && !PauseGeneration) {
        incrementGeometryUpdateCounter();
    }

    const mouseMoved = (lastReadMouseX < 0 || lastReadMouseY < 0) ||
        (Math.abs(lastX - lastReadMouseX) + Math.abs(lastY - lastReadMouseY) > 1);
    
    // Trigger heightmap read for brush raycasting (and BVH updates)
    const shouldRead = (justPressed || mouseMoved) && shouldReadHeightmap(brushPressed, brushVisible, simres);
    // Also read when brush is released to update BVH after brush stroke
    const shouldReadForBVH = enableBVHUpdates && justReleased && terrainGeometry && terrainBVH;
    
    if (shouldRead || shouldReadForBVH) {
        // Read full resolution for accurate raycasting
        // Note: This is throttled by shouldReadHeightmap to avoid blocking
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, read_terrain_tex, 0);
        gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
        gl_context.readPixels(0, 0, simres, simres, gl_context.RGBA, gl_context.FLOAT, HightMapCpuBuf);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        // Mark as fresh so BVH updates can piggyback on this read (no extra readPixels cost)
        setHightMapBufIsFresh(true);
        lastReadMouseX = lastX;
        lastReadMouseY = lastY;
        if (!brushPressed && !brushVisible && HightMapBufCounter >= MaxHightMapBufCounter) {
            resetHightMapBufCounter();
        }
    }

    // ========== BVH Geometry Update Mechanism ==========
    // Periodically update terrain geometry and refit BVH to keep it synchronized with erosion
    // This avoids full BVH rebuilds (2+ seconds) by using fast refit operations (~50ms)
    // CRITICAL: Only updates when heightmap is already fresh (from brush raycasting)
    // This avoids expensive readPixels calls - we piggyback on existing heightmap reads
    // Also triggers immediately on brush release to update after terrain modifications
    // IMPORTANT: Updates are deferred to avoid blocking the render loop (BVH is not visible)
    const shouldUpdateNow = enableBVHUpdates && terrainGeometry && terrainBVH && !terrainBVHBuildInProgress && HightMapBufIsFresh;
    const updateTriggeredByBrush = justReleased; // Immediate update after brush stroke
    const updateTriggeredByInterval = shouldUpdateGeometry(); // Periodic update during erosion
    
    if (shouldUpdateNow && (updateTriggeredByBrush || updateTriggeredByInterval)) {
        // Copy heightmap data to avoid race conditions (heightmap buffer might be overwritten)
        const heightmapCopy = new Float32Array(HightMapCpuBuf);
        
        // Clear fresh flag immediately (before async work) to prevent duplicate updates
        setHightMapBufIsFresh(false);
        
        // Defer the actual update work to avoid blocking the render loop
        // Since BVH is only used for raycasting (not rendering), we can update it asynchronously
        const performAsyncUpdate = () => {
            if (!terrainGeometry || !terrainBVH || terrainBVHBuildInProgress) {
                return; // Safety check in case BVH was cleared during async delay
            }
            
            // Update geometry positions with copied heightmap
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
    
    if (ENABLE_BVH_ACCURACY_TEST && terrainGeometry && terrainBVH && SimFramecnt % BVH_TEST_INTERVAL === 0 && SimFramecnt > 0) {
        // Read heightmap if not already fresh
        if (!HightMapBufIsFresh) {
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
            gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, read_terrain_tex, 0);
            gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
            gl_context.readPixels(0, 0, simres, simres, gl_context.RGBA, gl_context.FLOAT, HightMapCpuBuf);
            gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
        }
        
        // Test BVH raycast BEFORE geometry update
        const testRayOrigin = vec3.fromValues(0, 2, 0); // Ray from above terrain
        const testRayDir = vec3.fromValues(0, -1, 0); // Ray pointing down
        const bvhPosBefore = vec2.create();
        const heightmapPosBefore = vec2.create();
        const bvhHitBefore = rayCastBVH(testRayOrigin, testRayDir, terrainBVH, terrainGeometry, bvhPosBefore);
        rayCast(testRayOrigin, testRayDir, simres, HightMapCpuBuf, heightmapPosBefore);
        
        // Measure performance: Update + Refit
        const updateStartTime = performance.now();
        updateTerrainGeometry(terrainGeometry, simres, HightMapCpuBuf, 1.0);
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
        rayCast(testRayOrigin, testRayDir, simres, HightMapCpuBuf, heightmapPosAfter);
        
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
            rayCast(testRay.origin, testRay.dir, simres, HightMapCpuBuf, heightmapPos);
            
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
        
        console.log('[BVH Accuracy Test] Frame:', SimFramecnt, 'Resolution:', simres);
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
      // Bind terrain textures for the depth pass so vertex displacement matches terrain render.
      gl_context.activeTexture(gl_context.TEXTURE0);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_terrain_tex);
      gl_context.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "hightmap"), 0);

      gl_context.activeTexture(gl_context.TEXTURE1);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_sediment_tex);
      gl_context.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "sedimap"), 1);

      gl_context.activeTexture(gl_context.TEXTURE2);
      gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
      gl_context.uniform1i(getCachedUniformLocation(sceneDepthShader.prog, "lavamap"), 2);
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


    gl_context.activeTexture(gl_context.TEXTURE0 + 8);
    gl_context.bindTexture(gl_context.TEXTURE_2D, shadowMap_tex);
    const shadowMapUniformLoc = getCachedUniformLocation(lambert.prog, "shadowMap");
    gl_context.uniform1i(shadowMapUniformLoc, 8);

    gl_context.activeTexture(gl_context.TEXTURE9);
    gl_context.bindTexture(gl_context.TEXTURE_2D, scene_depth_tex);
    gl_context.uniform1i(getCachedUniformLocation(lambert.prog, "sceneDepth"), 9);

    // Bind lava texture for vertex shader pooling (like water)
    // CRITICAL: Use TEXTURE11 to avoid conflicts with TEXTURE10 (used for heightmap)
    // Must bind to a texture unit that's not used by fragment shader
    gl_context.activeTexture(gl_context.TEXTURE0 + 11);
    gl_context.bindTexture(gl_context.TEXTURE_2D, read_lava_tex);
    const lavamapUniformLoc = getCachedUniformLocation(lambert.prog, "lavamap");
    if (lavamapUniformLoc) {
        gl_context.uniform1i(lavamapUniformLoc, 11);
    }

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
