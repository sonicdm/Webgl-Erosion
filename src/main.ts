import {mat4, vec2, vec3, vec4} from 'gl-matrix';
// @ts-ignore
import Stats from 'stats-js';
import Camera from './Camera';
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from './controls-config';
import { loadSettings } from './settings';
import { setupGUI, GUIControllers } from './gui/gui-setup';
import { createEventHandlers } from './events/event-handlers';
import { updateBrushState, BrushContext, BrushControls, getOriginalBrushOperation, setOriginalBrushOperation } from './brush-handler';
import { updatePaletteSelection } from './brush-palette';
import { rayCast } from './utils/raycast';
import { rayCastBVH } from './utils/bvh-raycast';
import { updateTerrainGeometry } from './utils/terrain-geometry-builder';
import { createHeightMapLoader } from './utils/heightmap-loader';
import { LoadProgressTracker, LoadPhase } from './utils/load-progress';
import { createApp, AppContext } from './app/bootstrap';
import { createControls } from './app/controls/controls-factory';
import type { IAppControls, ControlsActions } from './app/controls/types';
import { TerrainSceneService } from './app/services/TerrainSceneService';
import { TerrainGeometryUpdater } from './app/services/TerrainGeometryUpdater';
import { checkWebGPUSupport } from './rendering/webgpu/capability-check';
import { WebGPURendererWrapper } from './rendering/webgpu/WebGPURendererWrapper';
import { ComputeNodePipeline } from './rendering/webgpu/compute/ComputeNodePipeline';
import { TerrainGeneratorCompute } from './rendering/webgpu/compute/TerrainGeneratorCompute';
import { WebGPUTexturePool } from './simulation/WebGPUTexturePool';
import { WebGPUSimulationRunner } from './app/runtime/WebGPUSimulationRunner';
import { Scene, Mesh, PlaneGeometry, Color } from 'three';
import { TerrainMaterialNode } from './rendering/webgpu/materials/TerrainMaterialNode';
import { WaterMaterialNode } from './rendering/webgpu/materials/WaterMaterialNode';
import {
  createPoolSyncTextures,
  copyPoolToThreeTextures,
} from './utils/webgpu-pool-to-three-texture-copy';
import type { PoolSyncTextures } from './utils/webgpu-pool-to-three-texture-copy';

// Note: State is now managed through AppContext and state holders
let appContext: AppContext;
/** Controls built by createControls() in main(); in scope for tick/render/sim. */
let controls: IAppControls;
/** Terrain scene service (loadScene, reset, setTerrainRandom); created in main(). */
let terrainSceneService: TerrainSceneService;
/** Only writer to terrain geometry/BVH; created in main(). */
let terrainGeometryUpdater: TerrainGeometryUpdater;

// WebGPU terrain generator (module-level for access from Reset/setTerrainRandom)
let terrainGeneratorCompute: TerrainGeneratorCompute | null = null;



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
  terrainGeometryUpdater = new TerrainGeometryUpdater(
    appContext.terrainState,
    appContext.simulationState,
    appContext.configHolder
  );

  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);

  // get canvas (main canvas is used by WebGPURenderer)
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');

  // Check WebGPU capability - REQUIRED (no fallback)
  const webgpuCapability = await checkWebGPUSupport();
  
  if (!webgpuCapability.supported) {
    alert('WebGPU not supported! The application requires WebGPU for simulation. Reason: ' + (webgpuCapability.fallbackReason || 'Unknown'));
    return; // Exit early - simulation requires WebGPU
  }
  
  console.log('[WebGPU] WebGPU available - using for simulation compute shaders');
  
  // Set client dimensions regardless of context availability
  appContext.simulationState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  appContext.clientState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  
  
  // Declare WebGPU variables early (before try block)
  let webgpuDevice: GPUDevice | null = null;
  let webgpuComputePipeline: ComputeNodePipeline | null = null;
  let webgpuTexturePool: WebGPUTexturePool | null = null;
  let webgpuRendererWrapper: WebGPURendererWrapper | null = null;
  let webgpuScene: Scene | null = null;
  let webgpuTerrainMesh: Mesh | null = null;
  let webgpuWaterMesh: Mesh | null = null;
  let webgpuPoolSyncTextures: PoolSyncTextures | null = null;
  let webgpuSceneCompileDone = false;
  let webgpuSceneCompileStarted = false;


  // Initialize WebGPU renderer first; get device from it for compute and pool (single device)
  try {
    webgpuRendererWrapper = new WebGPURendererWrapper(canvas, appContext);
    await webgpuRendererWrapper.initialize();
    webgpuDevice = webgpuRendererWrapper.getDevice();
    if (!webgpuDevice) {
      throw new Error('WebGPU device not available from renderer');
    }

    webgpuComputePipeline = new ComputeNodePipeline(webgpuDevice);
    webgpuTexturePool = new WebGPUTexturePool(webgpuDevice, appContext.simulationState.simres, appContext.configHolder.shadowMapResolution);
    webgpuTexturePool.setup();

    // Initialize terrain generator compute pipeline
    terrainGeneratorCompute = new TerrainGeneratorCompute(webgpuDevice);
    await terrainGeneratorCompute.initialize();
    terrainGeneratorCompute.setRandomSeed(); // Set initial random seed

    webgpuScene = new Scene();
    // Sky background color matching legacy clear color (atmospheric blue-gray)
    webgpuScene.background = new Color(0.2, 0.25, 0.3);
    webgpuRendererWrapper.setClearColor(0.2, 0.25, 0.3, 1);
    webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);

    // Pool-sync textures: Three.js DataTextures (rgba32float) that we copy from pool each frame
    const simres = appContext.simulationState.simres;
    webgpuPoolSyncTextures = createPoolSyncTextures(simres);

    // Terrain plane with TerrainMaterialNode (samples pool via sync textures)
    // Render mesh uses fixed segment count for performance; BVH uses full simres for accuracy.
    const webgpuTerrainSegments = appContext.configHolder.raycastMeshResolution - 1;
    const webgpuTerrainGeometry = new PlaneGeometry(1, 1, webgpuTerrainSegments, webgpuTerrainSegments);
    webgpuTerrainGeometry.rotateX(-Math.PI / 2); // XZ plane, Y up
    const webgpuTerrainMaterial = new TerrainMaterialNode({
      heightmap: webgpuPoolSyncTextures.heightmap,
      normalMap: webgpuPoolSyncTextures.normalMap,
      sedimentMap: webgpuPoolSyncTextures.sedimentMap,
      velocityMap: webgpuPoolSyncTextures.velocityMap,
      fluxMap: webgpuPoolSyncTextures.fluxMap,
      terrainFluxMap: webgpuPoolSyncTextures.terrainFluxMap,
      maxSlippageMap: webgpuPoolSyncTextures.maxSlippageMap,
      sedimentBlendMap: webgpuPoolSyncTextures.sedimentBlendMap,
      simres,
      maxHeight: (controls?.TerrainHeight ?? 2) * 120,
    });
    webgpuTerrainMesh = new Mesh(webgpuTerrainGeometry, webgpuTerrainMaterial as any);
    webgpuTerrainMesh.frustumCulled = true;
    webgpuTerrainMesh.renderOrder = 0;
    webgpuScene.add(webgpuTerrainMesh);

    // Water plane: transparent so terrain shows through; render after terrain
    const webgpuWaterGeometry = new PlaneGeometry(1, 1, webgpuTerrainSegments, webgpuTerrainSegments);
    webgpuWaterGeometry.rotateX(-Math.PI / 2);
    const webgpuWaterMaterial = new WaterMaterialNode({
      heightmap: webgpuPoolSyncTextures.heightmap,
      sedimentMap: webgpuPoolSyncTextures.sedimentMap,
      simres,
    });
    webgpuWaterMesh = new Mesh(webgpuWaterGeometry, webgpuWaterMaterial as any);
    webgpuWaterMesh.frustumCulled = true;
    webgpuWaterMesh.renderOrder = 1;
    webgpuWaterMesh.visible = true; // Water visible — opacity driven by water level in heightmap G channel
    webgpuScene.add(webgpuWaterMesh);

    console.log('[WebGPU] Renderer, compute pipeline, texture pool, and terrain generator initialized');
  } catch (error) {
    console.error('[WebGPU] Failed to initialize:', error);
    alert('Failed to initialize WebGPU. The application cannot run.');
    return; // Exit early - simulation requires WebGPU
  }

  // Build controls with stable actions before GUI binds (no reassignment after setupGUI)
  let controllersRef: GUIControllers | null = null;
  const getControlsForLoader = () => controls;
  const setTerrainBaseType = (value: number) => {
    controls.TerrainBaseType = value;
    controllersRef?.terrainBaseTypeController?.setValue(value);
  };
  if (!webgpuDevice || !webgpuTexturePool) {
    console.error('[main] WebGPU device or texture pool not available for heightmap IO.');
    return;
  }
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(
    appContext.simulationState,
    webgpuDevice,
    webgpuTexturePool,
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

  // Yield so the browser can paint GUI and canvas before heavy sync work (terrain init)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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

  // Camera is already created above, just check brushUsesLeftClick here for reference
  const brushUsesLeftClick = controlsConfig.mouse.brushActivate === 'LEFT' || 
                             (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  
  if (!webgpuRendererWrapper) {
    console.error('[main] WebGPU renderer required.');
    return;
  }
  console.log('[main] Using WebGPU renderer for main view');

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
    // rayCast is now imported from utils/raycast.ts

  // Reusable objects to avoid allocations every frame
  const reusableViewProj = mat4.create();
  const reusableInvViewProj = mat4.create();
  const reusableMousePoint = vec4.create();
  const reusableMousePointEnd = vec4.create();
  const reusableDir = vec3.create();
  const reusableRo = vec3.create();
  const reusablePos = vec2.create();
  
  // Reusable buffer for heightmap copy during BVH refit (avoids GC pressure from per-frame allocations)
  let reusableHeightmapCopy: Float32Array | null = null;

  // Track brush state transitions for heightmap readback
  let lastBrushPressed = 0;
  let lastReadMouseX = -1;
  let lastReadMouseY = -1;
  // Request one initial WebGPU readback only after terrain texture has been written (avoids reading zeros)
  let initialWebGPUReadbackRequested = false;
  let webgpuTerrainGeneratedOnce = false;

  function tick() {
    stats.begin();
    
    // WebGPU renderer required
    if (!webgpuRendererWrapper) {
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
        
        // Single rAF so overlay paints, then run load immediately (double rAF was adding ~32ms for no reason)
        requestAnimationFrame(async () => {
                // Handle resolution change if needed (must happen before texture cleanup)
                const resolutionChanged = controls.SimulationResolution != appContext.simulationState.simres;
                if (resolutionChanged) {
                    const oldRes = appContext.simulationState.simres;
                    const newRes = Number(controls.SimulationResolution);
                    console.log(`[Loading] Resolution change detected: ${oldRes} -> ${newRes}`);
                    appContext.simulationState.setSimRes(newRes);
                    if (webgpuTexturePool) {
                        webgpuTexturePool.resizeSimulationTextures(newRes);
                    }
                    appContext.simulationState.resizeHeightMapCpuBuf(newRes); // Resize the CPU buffer to match new resolution

                    const oldPoolSyncTextures = webgpuPoolSyncTextures;
                    webgpuPoolSyncTextures = createPoolSyncTextures(newRes);
                    if (oldPoolSyncTextures && webgpuDevice) {
                        webgpuDevice.queue.onSubmittedWorkDone()
                            .catch(() => undefined)
                            .then(() => {
                                Object.values(oldPoolSyncTextures).forEach((tex) => tex.dispose());
                            });
                    }
                    webgpuSceneCompileStarted = false;
                    webgpuSceneCompileDone = false;

                    // Recreate materials entirely — TSL graph rebuild on a compiled material
                    // causes "Uniform string not declared" errors due to stale builder state.
                    if (webgpuTerrainMesh) {
                        (webgpuTerrainMesh.material as any)?.dispose();
                        const newTerrainMat = new TerrainMaterialNode({
                            heightmap: webgpuPoolSyncTextures.heightmap,
                            normalMap: webgpuPoolSyncTextures.normalMap,
                            sedimentMap: webgpuPoolSyncTextures.sedimentMap,
                            velocityMap: webgpuPoolSyncTextures.velocityMap,
                            fluxMap: webgpuPoolSyncTextures.fluxMap,
                            terrainFluxMap: webgpuPoolSyncTextures.terrainFluxMap,
                            maxSlippageMap: webgpuPoolSyncTextures.maxSlippageMap,
                            sedimentBlendMap: webgpuPoolSyncTextures.sedimentBlendMap,
                            simres: newRes,
                            maxHeight: (controls?.TerrainHeight ?? 2) * 120,
                        });
                        webgpuTerrainMesh.material = newTerrainMat as any;
                    }
                    if (webgpuWaterMesh) {
                        (webgpuWaterMesh.material as any)?.dispose();
                        const newWaterMat = new WaterMaterialNode({
                            heightmap: webgpuPoolSyncTextures.heightmap,
                            sedimentMap: webgpuPoolSyncTextures.sedimentMap,
                            simres: newRes,
                        });
                        webgpuWaterMesh.material = newWaterMat as any;
                    }
                    
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
                    webgpuTerrainGeneratedOnce = true;

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

                    progressTracker.updateSubPhaseProgress(1.0);
                    progressTracker.endPhase(LoadPhase.READBACK);
                }

                // Rebuild terrain mesh and BVH for raycasting
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
                }
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
        // Always compute heightmap raycast to validate BVH alignment against full-res data.
        const heightmapPos = vec2.create();
        rayCast(reusableRo, reusableDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPos);
        if (!hit) {
            // Fallback to heightmap if BVH misses
            reusablePos[0] = heightmapPos[0];
            reusablePos[1] = heightmapPos[1];
        } else {
            const dx = heightmapPos[0] - reusablePos[0];
            const dy = heightmapPos[1] - reusablePos[1];
            const uvError = Math.hypot(dx, dy);
            if (uvError > 0.02) {
                reusablePos[0] = heightmapPos[0];
                reusablePos[1] = heightmapPos[1];
            }
        }
    } else {
        // Use heightmap raycast (default)
        rayCast(reusableRo, reusableDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, reusablePos);
    }
    
    
    controls.posTemp = reusablePos;

    //===================per tick uniforms==================
    const brushContext: BrushContext = {
        controls: controls as BrushControls,
        controlsConfig: controlsConfig,
        simulationState: appContext.simulationState,
        terrainState: appContext.terrainState,
        camera: camera
    };
    updateBrushState(reusablePos, brushContext);

    const brushPressed = controls.brushPressed === 1;
    const brushVisible = Number(controls.brushType) !== 0;
    const justPressed = brushPressed && lastBrushPressed === 0;
    const justReleased = !brushPressed && lastBrushPressed === 1; // Brush was just released
    appContext.simulationState.incrementHeightMapBufCounter();

      //==========================  we begin simulation from now ===========================================

    // Use WebGPU compute pipeline (required)
    if (!webgpuComputePipeline || !webgpuTexturePool || !webgpuDevice) {
        console.error('[WebGPU] WebGPU compute pipeline not available. Simulation cannot run.');
        requestAnimationFrame(tick);
        return;
    }
    
    // Request one initial WebGPU readback so heightMapCpuBuf is populated for brush raycasting.
    // Only after terrain has been generated once, so we do not read from an empty texture (zeros).
    if (webgpuTerrainGeneratedOnce && !initialWebGPUReadbackRequested) {
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

    // WebGPU simulation path - run compute steps
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
        // WebGPU readback path (required)
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
    // This avoids extra readbacks - we piggyback on existing heightmap reads
    // Also triggers immediately on brush release to update after terrain modifications
    // IMPORTANT: Updates are deferred to avoid blocking the render loop (BVH is not visible)
    const shouldUpdateNow = appContext.simulationState.enableBVHUpdates && appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH && !appContext.terrainState.terrainBVHBuildInProgress && appContext.simulationState.heightMapBufIsFresh;
    const updateTriggeredByBrush = justReleased; // Immediate update after brush stroke
    const updateTriggeredByInterval = appContext.simulationState.shouldUpdateGeometry(); // Periodic update during erosion
    
    if (shouldUpdateNow && (updateTriggeredByBrush || updateTriggeredByInterval)) {
        // Copy heightmap data to avoid race conditions (heightmap buffer might be overwritten)
        // Reuse pre-allocated buffer to avoid GC pressure from per-frame Float32Array allocations
        const srcBuf = appContext.simulationState.heightMapCpuBuf;
        if (!reusableHeightmapCopy || reusableHeightmapCopy.length !== srcBuf.length) {
            reusableHeightmapCopy = new Float32Array(srcBuf.length);
        }
        reusableHeightmapCopy.set(srcBuf);
        const heightmapCopy = reusableHeightmapCopy;
        
        // Clear fresh flag immediately (before async work) to prevent duplicate updates
        appContext.simulationState.setHeightMapBufIsFresh(false);
        
        // Defer the actual update work to avoid blocking the render loop
        // Since BVH is only used for raycasting (not rendering), we can update it asynchronously
        const performAsyncUpdate = () => {
            if (!appContext.terrainState.terrainGeometry || !appContext.terrainState.terrainBVH || appContext.terrainState.terrainBVHBuildInProgress) {
                return; // Safety check in case BVH was cleared during async delay
            }
            
            // Update geometry positions with copied heightmap
            updateTerrainGeometry(
              appContext.terrainState.terrainGeometry,
              appContext.simulationState.simres,
              heightmapCopy,
              1.0,
              appContext.simulationState.simres
            );
            
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
        // Test BVH raycast BEFORE geometry update
        const testRayOrigin = vec3.fromValues(0, 2, 0); // Ray from above terrain
        const testRayDir = vec3.fromValues(0, -1, 0); // Ray pointing down
        const bvhPosBefore = vec2.create();
        const heightmapPosBefore = vec2.create();
        const bvhHitBefore = rayCastBVH(testRayOrigin, testRayDir, appContext.terrainState.terrainBVH!, appContext.terrainState.terrainGeometry!, bvhPosBefore);
        rayCast(testRayOrigin, testRayDir, appContext.simulationState.simres, appContext.simulationState.heightMapCpuBuf, heightmapPosBefore);
        
        // Measure performance: Update + Refit
        const updateStartTime = performance.now();
        updateTerrainGeometry(
          appContext.terrainState.terrainGeometry!,
          appContext.simulationState.simres,
          appContext.simulationState.heightMapCpuBuf,
          1.0,
          appContext.simulationState.simres
        );
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

    if (webgpuRendererWrapper && webgpuScene && webgpuTexturePool && webgpuPoolSyncTextures) {
      webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);
      const rendererThree = webgpuRendererWrapper.getRenderer() as any;
      const backend = rendererThree?.backend;
      // Force backend to create our textures (needed before copy); run once
      if (!webgpuSceneCompileStarted) {
        webgpuSceneCompileStarted = true;
        rendererThree?.compileAsync?.(webgpuScene, camera.threeCamera)?.then?.(() => {
          webgpuSceneCompileDone = true;
        })?.catch?.(() => {
          webgpuSceneCompileDone = true;
        });
        // Fallback: start copying after a short delay even if compile hasn't resolved (first render may have created textures)
        setTimeout(() => {
          webgpuSceneCompileDone = true;
        }, 500);
      }
      if (backend?.device) {
        copyPoolToThreeTextures(
          backend,
          webgpuTexturePool,
          webgpuPoolSyncTextures,
          appContext.simulationState.simres
        );
      }
      if (webgpuTerrainMesh?.material) {
        const terrainMat = webgpuTerrainMesh.material as unknown as TerrainMaterialNode;
        const brushPosValid = reusablePos[0] >= 0 && reusablePos[0] <= 1 && reusablePos[1] >= 0 && reusablePos[1] <= 1;
        // Raycast now outputs render-space UVs (PlaneGeometry v is flipped after rotateX).
        const overlayU = reusablePos[0];
        const overlayV = reusablePos[1];
        terrainMat.updateBrush(
          [overlayU, overlayV],
          brushPosValid ? controls.brushSize : 0,
          controls.brushType
        );
        // Push per-frame control values to terrain material uniforms
        terrainMat.updateUniforms({
          snowRange: controls.SnowRange,
          forestRange: controls.ForestRange,
          terrainPalette: controls.TerrainPlatte,
          maxHeight: (controls?.TerrainHeight ?? 2) * 120,
          debugMode: controls.TerrainDebug,
        });
      }
      // Push per-frame control values to water material uniforms
      if (webgpuWaterMesh?.material) {
        const waterMat = webgpuWaterMesh.material as unknown as WaterMaterialNode;
        waterMat.updateUniforms({
          waterTransparency: controls.WaterTransparency,
        });
      }
      webgpuRendererWrapper.render(webgpuScene, camera.threeCamera);
    }

    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  const runtime = {
    start(): void {
      tick();
    },
    resize(): void {
      camera.setAspectRatio(window.innerWidth / window.innerHeight);
      camera.updateProjectionMatrix();
      if (webgpuRendererWrapper) {
        webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);
      }
    },
    getControls: (): IAppControls => controls,
    getCamera: () => camera,
    getRenderer: () => webgpuRendererWrapper?.getRenderer() ?? null,
  };

  window.addEventListener('resize', runtime.resize, false);

  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();
  if (webgpuRendererWrapper) {
    webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);
  }

  runtime.start();
}

// HMR: full reload on update so main() is never run twice in the same page (avoids double WebGPU init)
const hot = (import.meta as { hot?: { accept: (cb: () => void) => void } }).hot;
if (hot) {
  hot.accept(() => {
    window.location.reload();
  });
}

main();
