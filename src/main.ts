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
import { createEventHandlers, EventHandlerDependencies } from './events/event-handlers';
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
import { createApp, createAppContextSetup, setupAppGUI, createThreeRunner, createLegacyRunner, type AppContext } from './app';

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
    DebugMode: 0,
    UseSimHeightmap: false,
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

// Helper functions - will be updated in main() to use AppContext
// These are placeholders that will be replaced with AppContext-aware versions
function StartGeneration(){
    setPauseGeneration(!PauseGeneration);
}

// Reset function - receives threeRuntime via closure from main()
// This is set up after threeRuntime is created
// Note: resetWithThreeRuntime is declared at module level (line 1322)
function Reset(){
    setSimFramecnt(0);
    setTerrainRandom();
    setTerrainGeometryDirty(true);
    // Resolution change will be handled in the TerrainGeometryDirty block
    //PauseGeneration = true;
    
    // Call the injected reset handler if available
    if (resetWithThreeRuntime) {
        resetWithThreeRuntime(threeRuntime);
    }
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



// SimulatePerStep extracted to legacy-runner.ts

// Texture management functions are now imported from simulation/texture-management.ts



// SimulationStep extracted to legacy-runner.ts
// Unified coordinate normalization function
// Converts viewport coordinates (clientX/clientY) to canvas-relative normalized coordinates [0, 1]
// normalizeMousePosition imported from brush-controls
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

// Module-level variables for dependency injection and scope access
let threeRuntime: ThreeJSSimulationRuntime | undefined;
let resetWithThreeRuntime: ((rt: ThreeJSSimulationRuntime | undefined) => void) | null = null;

function main() {
  // ============================================================================
  // Stage 6: Refactored main.ts using new modules from Workstream B
  // ============================================================================
  
  // Get canvas element
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  // Get WebGL context
  gl_context = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl_context) {
    throw new Error('WebGL 2 not supported!');
  }
  setGL(gl_context);
  setGlContext(gl_context);

  // Load settings (from localStorage or defaults)
  controlsConfig = loadSettings();
  
  // Apply raycast method from settings
  controls.raycastMethod = controlsConfig.raycast.method;
  
  // Create AppContext using bootstrap
  const appContext = createApp({
    canvas,
    glContext: gl_context,
    initialSimres: simres,
    controlsConfig,
    getTerrainGeometry: () => {
      // For Three.js path, get geometry from threeRuntime
      if (threeRuntime) {
        return threeRuntime.getTerrainGeometry();
      }
      // For legacy path, get from terrainGeometry global
      return terrainGeometry;
    },
    onHeightmapChange: async (heightmap) => {
      // Handle heightmap changes
      if (threeRuntime) {
        const timer = 0;
        const terrainRandom = {
          seedOffset: [0, 0],
          duneDir: [1, 0],
          craterDensity: 1.0,
          canyonDepth: 1.0
        };
        await threeRuntime.initializeTextures(controls, timer, heightmap, terrainRandom);
        const heightData = threeRuntime.readCombinedHeight();
        threeRuntime.updateTerrainGeometry(heightData);
      }
    },
  });

  // Set up context (canvas, GL, resize handling)
  const contextSetup = createAppContextSetup(appContext);

  // Update helper functions to use AppContext state holders
  // These functions are called from the GUI, so we create wrappers that have access to appContext
  const createAppContextHelpers = (appContext: AppContext) => {
    // Update StartGeneration to use AppContext
    const startGenerationWrapper = () => {
      appContext.simulationState.pauseGeneration = !appContext.simulationState.pauseGeneration;
      // Also update global state for backward compatibility (legacy code still uses it)
      setPauseGeneration(appContext.simulationState.pauseGeneration);
    };
    
    // Update Reset to use AppContext
    const resetWrapper = () => {
      appContext.simulationState.simFramecnt = 0;
      setSimFramecnt(0); // Also update global for backward compatibility
      
      // Update terrain random
      const angle = Math.random() * Math.PI * 2.0;
      terrainRandom.duneDir[0] = Math.cos(angle);
      terrainRandom.duneDir[1] = Math.sin(angle);
      terrainRandom.craterDensity = 0.8 + Math.random() * 0.7;
      terrainRandom.canyonDepth = 0.45 + Math.random() * 0.5;
      terrainRandom.seedOffset[0] = Math.random() * 256.0;
      terrainRandom.seedOffset[1] = Math.random() * 256.0;
      
      appContext.simulationState.terrainGeometryDirty = true;
      setTerrainGeometryDirty(true); // Also update global for backward compatibility
      
      // Call the injected reset handler if available
      if (resetWithThreeRuntime) {
        resetWithThreeRuntime(threeRuntime);
      }
    };
    
    // Update setTerrainRandom to use AppContext
    const setTerrainRandomWrapper = () => {
      const angle = Math.random() * Math.PI * 2.0;
      terrainRandom.duneDir[0] = Math.cos(angle);
      terrainRandom.duneDir[1] = Math.sin(angle);
      terrainRandom.craterDensity = 0.8 + Math.random() * 0.7;
      terrainRandom.canyonDepth = 0.45 + Math.random() * 0.5;
      terrainRandom.seedOffset[0] = Math.random() * 256.0;
      terrainRandom.seedOffset[1] = Math.random() * 256.0;
      
      appContext.simulationState.terrainGeometryDirty = true;
      setTerrainGeometryDirty(true); // Also update global for backward compatibility
    };
    
    return {
      startGeneration: startGenerationWrapper,
      reset: resetWrapper,
      setTerrainRandom: setTerrainRandomWrapper,
    };
  };
  
  const helpers = createAppContextHelpers(appContext);
  
  // Update controls object with AppContext-aware helpers
  controls['Pause/Resume'] = helpers.startGeneration;
  controls['ResetTerrain'] = helpers.reset;
  controls['setTerrainRandom'] = helpers.setTerrainRandom;

  // Create camera first (needed for event handlers)
  const brushUsesLeftClickForCamera = controlsConfig.mouse.brushActivate === 'LEFT' || 
                                       (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');

  const setupInputHandlers = (camera: Camera) => {
    // Verify Camera instance matches (DI check)
    console.log('[WASD DI Check] setupInputHandlers received camera:', camera);
    console.log('[WASD DI Check] Camera instance ID/ref:', (camera as any).__id || 'no id');
    console.log('[WASD DI Check] Camera wasdCheckId:', (camera as any).__wasdCheckId || 'not set');
    
    // Verify camera matches the one from threeRuntime
    if (threeRuntime) {
      const runtimeCamera = threeRuntime.getCamera();
      if (runtimeCamera === camera) {
        console.log('[WASD DI Check] ✓ Camera instance matches threeRuntime.getCamera()');
      } else {
        console.error('[WASD DI Check] ✗ ERROR: Camera instance mismatch! setupInputHandlers camera !== threeRuntime.getCamera()');
        console.error('[WASD DI Check]   setupInputHandlers camera:', camera);
        console.error('[WASD DI Check]   threeRuntime.getCamera():', runtimeCamera);
      }
    }
    
    // Create dependency object for event handlers (dependency injection)
    const eventHandlerDeps: EventHandlerDependencies = {
      heightMapBuffer: threeRuntime?.getHeightMapCpuBuffer() || HightMapCpuBuf, // Fallback for WebGL
      threeRuntime: threeRuntime,
      camera: camera,
      controls: controls,
      controlsConfig: controlsConfig,
      simres: simres,
      // Pass state holders for new code paths
      simulationState: appContext.simulationState,
      terrainState: appContext.terrainStateHolder,
    };
    
    // Verify camera in deps matches parameter (DI consistency check)
    if (eventHandlerDeps.camera !== camera) {
      console.error('[WASD DI Check] ERROR: Camera instance mismatch! deps.camera !== camera parameter');
    } else {
      console.log('[WASD DI Check] Camera instance matches in eventHandlerDeps');
    }
    
    // Create event handlers with dependency injection
    const eventHandlers = createEventHandlers(controls, controlsConfig, camera, eventHandlerDeps);
    const { onKeyDown, onKeyUp, onMouseDown, onMouseUp } = eventHandlers;
  
    // Disabled mouseChange to prevent coordinate conflicts with pointer events
    // Pointer events now handle all mouse position tracking directly
    // mouseChange(canvas, handleInteraction);
    console.log('[WASD] Attaching event listeners - onKeyDown:', typeof onKeyDown, 'onKeyUp:', typeof onKeyUp);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    console.log('[WASD] Event listeners attached to document');
    
    // Note: controlsConfig will be loaded in main() before event listeners are set up
    window.addEventListener('pointerdown', (e) => {
      const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][e.button];
      // Check if target is canvas or contains canvas
      const target = e.target as HTMLElement;
      const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
      if (isCanvas) {
        // Always update mouse position when clicking on canvas (needed for accurate brush positioning)
        setLastMousePosition(e.clientX, e.clientY);
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
        setLastMousePosition(e.clientX, e.clientY);
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
  };

  // Check if Three.js runtime is enabled
  // Note: threeRuntime is declared at module level for Reset() function access
  
  // Setup GUI - will be called after threeRuntime is created (dependency injection)
  // Declare variables first, will be initialized after threeRuntime is available
  let gui: DAT.GUI;
  let controllers: GUIControllers;
  let brushTypeController: DAT.GUIController;
  let brushSizeController: DAT.GUIController;
  let brushStrengthController: DAT.GUIController;
  let brushOperationController: DAT.GUIController;
  
  if (THREEJS_CONFIG.USE_THREEJS_RUNTIME) {
    try {
      // Create Three.js runtime
      threeRuntime = new ThreeJSSimulationRuntime(canvas, gl_context, simres);
      threeRuntime.initializeSimulation();
      threeRuntime.setControlsConfig(controlsConfig, brushUsesLeftClickForCamera);
      
      // Update AppContext's simulationStepRunner to use this threeRuntime
      // Note: setThreeRuntime is available on the implementation, not the interface
      (appContext.simulationStepRunner as any).setThreeRuntime?.(threeRuntime);
      
      const threeCamera = threeRuntime.getCamera();
      if (threeCamera) {
        setupInputHandlers(threeCamera);
      }
      
      // Inject threeRuntime into Reset function via closure (dependency injection)
      resetWithThreeRuntime = (rt: ThreeJSSimulationRuntime | undefined) => {
        if (rt) {
          console.log('[Reset] ===== RESET BUTTON CLICKED =====');
          const terrainRandom = {
            seedOffset: [Math.random() * 256.0, Math.random() * 256.0],
            duneDir: [Math.cos(Math.random() * Math.PI * 2.0), Math.sin(Math.random() * Math.PI * 2.0)],
            craterDensity: 0.8 + Math.random() * 0.7,
            canyonDepth: 0.45 + Math.random() * 0.5
          };
          console.log('[Reset] Calling regenerateTerrain with random:', terrainRandom);
          rt.regenerateTerrain(controls, terrainRandom).catch((error) => {
            console.error('[Reset] ERROR: Failed to regenerate terrain:', error);
          });
        } else {
          console.warn('[Reset] WARNING: threeRuntime not available!');
        }
      };
      
      // Setup GUI with dependency injection (threeRuntime now available)
      const guiResult = setupAppGUI(appContext, controls, threeRuntime);
      gui = guiResult.gui;
      controllers = guiResult.controllers;
      brushTypeController = controllers.brushTypeController;
      brushSizeController = controllers.brushSizeController;
      brushStrengthController = controllers.brushStrengthController;
      brushOperationController = controllers.brushOperationController;
      
      // Create Three.js runner and start it
      const threeRunner = createThreeRunner(appContext, threeRuntime, controls, canvas);
      threeRunner.start();
      
      // Exit early - Three.js runtime handles its own loop
      return;
    } catch (error) {
      console.error('Failed to initialize Three.js runtime:', error);
      console.error('Falling back to WebGL pipeline');
      // Continue with WebGL pipeline below
    }
  }
  
  // Legacy WebGL pipeline path
  // Setup GUI without threeRuntime (WebGL pipeline)
  const guiResult = setupAppGUI(appContext, controls);
  gui = guiResult.gui;
  controllers = guiResult.controllers;
  brushTypeController = controllers.brushTypeController;
  brushSizeController = controllers.brushSizeController;
  brushStrengthController = controllers.brushStrengthController;
  brushOperationController = controllers.brushOperationController;
  
  // Legacy WebGL pipeline path
  // TODO: Extract this to createLegacyRunner() once full extraction is complete
  // For now, legacy initialization code continues below
  
  // Create heightmap loader functions
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(gl_context, simres, controls);
  controls['Import Height Map'] = loadHeightMap;
  controls['Clear Height Map'] = clearHeightMap;
  controls['Export Height Map'] = exportHeightMap;
  
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
  setupInputHandlers(camera);
  
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


    // timer is still used for threeRuntime.initializeTextures() calls
    let timer = 0;

    // cleanUpTextures and reusable variables have been moved to legacy-runner.ts
    // They are now part of the LegacyRunner implementation

  // Create legacy runner with all dependencies
  // tick(), SimulatePerStep(), and SimulationStep() have been extracted to legacy-runner.ts
  const legacyRunner = createLegacyRunner({
    appContext,
    controls,
    canvas,
    glContext: gl_context,
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
  });

  // Start the render loop using the legacy runner
  legacyRunner.start();
}

main();
