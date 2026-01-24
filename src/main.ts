import {vec2, vec3} from 'gl-matrix';
import * as DAT from 'dat-gui';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram from './rendering/gl/ShaderProgram';
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from './controls-config';
import { loadSettings } from './settings';
import { GUIControllers } from './gui/gui-setup';
import { type Controls } from './app';
import { createEventHandlers, EventHandlerDependencies } from './events/event-handlers';
import { getOriginalBrushOperation, setOriginalBrushOperation } from './brush-handler';
import { updatePaletteSelection } from './brush-palette';
// Removed unused imports: MAX_WATER_SOURCES, waterSources, getWaterSourceCount, MAX_LAVA_SOURCES, lavaSources, getLavaSourceCount, rayCast, rayCastBVH, createTerrainGeometry, MeshBVH, SAH
import { createHeightMapLoader } from './utils/heightmap-loader';
// Removed unused imports: getCachedUniformLocation, LoadProgressTracker, LoadPhase
import { 
    simres, PauseGeneration,
    HightMapCpuBuf, setGlContext, 
    setLastMousePosition,
    setPauseGeneration, setSimFramecnt, setTerrainGeometryDirty,
    terrainGeometry
} from './simulation/simulation-state';
// Removed unused texture-management imports (all textures/framebuffers now used in legacy-runner.ts)
// Removed unused Render2Texture import (only in comment)
// Removed unused createShaders, Shaders imports (shaders created in initializeLegacyPipeline)
import { THREEJS_CONFIG } from './three/config';
import { ThreeJSSimulationRuntime } from './three/integration';
// Removed unused createTerrainIO import
import { createApp, createAppContextSetup, setupAppGUI, createThreeRunner, createLegacyRunner, initializeLegacyPipeline, createControls, type AppContext } from './app';
import { setTerrainRandom, type TerrainRandomParams } from './utils/terrain-random';

// Note: Most state variables are now imported from simulation-state.ts
// Removed unused variables: speed, enableBilateralBlur (now handled in legacy-runner.ts)
var gl_context : WebGL2RenderingContext;



// Controls object is now created via createControls() factory function in main()
let controls: Controls;





// Note: All texture and framebuffer variables are now imported from texture-management.ts
// Geometries (square, plane) are now created in initializeLegacyPipeline()

// Reference to the initial terrain shader (set in main function)
let noiseterrain: ShaderProgram | null = null;
const terrainRandom = {
    seedOffset: vec2.fromValues(0.0, 0.0),
    duneDir: vec2.fromValues(1.0, 0.0),
    craterDensity: 1.0,
    canyonDepth: 0.7
};

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
    setTerrainRandom(terrainRandom);
    setTerrainGeometryDirty(true);
    // Resolution change will be handled in the TerrainGeometryDirty block
    //PauseGeneration = true;
    
    // Call the injected reset handler if available
    if (resetWithThreeRuntime) {
        resetWithThreeRuntime(threeRuntime);
    }
}

// setTerrainRandom extracted to utils/terrain-random.ts

// Heightmap loading functions are now created via createHeightMapLoader in main()


// Render2Texture is now imported from rendering/render-utils.ts



// SimulatePerStep extracted to legacy-runner.ts

// Texture management functions are now imported from simulation/texture-management.ts



// handleInteraction removed - was disabled/unused, pointer events handle mouse position directly

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
  
  // Create controls object using factory function
  // Callbacks will be set up after helpers are created
  controls = createControls({
    callbacks: {
      startGeneration: StartGeneration,
      resetTerrain: Reset,
      setTerrainRandom: () => setTerrainRandom(terrainRandom),
      // Heightmap loader functions will be set later in main()
    },
  });
  
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
      setTerrainRandom(terrainRandom);
      
      appContext.simulationState.terrainGeometryDirty = true;
      setTerrainGeometryDirty(true); // Also update global for backward compatibility
      
      // Call the injected reset handler if available
      if (resetWithThreeRuntime) {
        resetWithThreeRuntime(threeRuntime);
      }
    };
    
    // Update setTerrainRandom to use AppContext
    const setTerrainRandomWrapper = () => {
      setTerrainRandom(terrainRandom);
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

  // Initialize legacy WebGL pipeline
  // This handles WebGL extension validation, geometry creation, renderer setup,
  // texture/framebuffer setup, shader creation, and terrain random initialization
  const legacyInit = initializeLegacyPipeline(
    appContext,
    gl_context,
    canvas,
    controls,
    controlsConfig,
    camera
  );

  // Store terrainRandom for helper functions (Reset, setTerrainRandom)
  terrainRandom.seedOffset = legacyInit.terrainRandom.seedOffset;
  terrainRandom.duneDir = legacyInit.terrainRandom.duneDir;
  terrainRandom.craterDensity = legacyInit.terrainRandom.craterDensity;
  terrainRandom.canyonDepth = legacyInit.terrainRandom.canyonDepth;
  noiseterrain = legacyInit.config.shaders.noiseterrain;

  // Create legacy runner with initialized config
  const legacyRunner = createLegacyRunner(legacyInit.config);

  // Start the render loop using the legacy runner
  legacyRunner.start();
}

main();
