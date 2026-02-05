const _moduleLoadStart = performance.now();
import { vec2, vec3 } from 'gl-matrix';
// @ts-ignore
import Stats from 'stats-js';
import Camera from './Camera';
import type { ControlsConfig } from './controls-config';
import { loadSettings } from './settings';
import { setupGUI, GUIControllers } from './gui/gui-setup';
import { createEventHandlers } from './events/event-handlers';
import { updateBrushState, BrushContext, BrushControls } from './brush-handler';
import { updateTerrainGeometry } from './utils/terrain-geometry-builder';
import { createHeightMapLoader } from './utils/heightmap-loader';
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
import { Scene, Mesh, PlaneGeometry, SphereGeometry } from 'three';
import { TerrainMaterialNode } from './rendering/webgpu/materials/TerrainMaterialNode';
import { WaterMaterialNode } from './rendering/webgpu/materials/WaterMaterialNode';
import { LavaMaterialNode } from './rendering/webgpu/materials/LavaMaterialNode';
import { SkyMaterialNode } from './rendering/webgpu/materials/SkyMaterialNode';
import { SceneLighting } from './rendering/webgpu/SceneLighting';
import { createPoolSyncTextures, type PoolSyncTextures } from './utils/webgpu-pool-to-three-texture-copy';
import { initLavaDiagnostics } from './utils/lava-diagnostics';
import { RaycastManager } from './app/runtime/RaycastManager';
import { InputManager } from './app/runtime/InputManager';
import { SceneRenderer } from './app/runtime/SceneRenderer';
import { TerrainLoadingPipeline } from './app/runtime/TerrainLoadingPipeline';

// Note: State is now managed through AppContext and state holders
let appContext: AppContext;
let controls: IAppControls;
let terrainSceneService: TerrainSceneService;
let terrainGeometryUpdater: TerrainGeometryUpdater;
let terrainGeneratorCompute: TerrainGeneratorCompute | null = null;
let controlsConfig: ControlsConfig;
let _hmrCleanup: (() => void) | null = null;

async function main() {
  const _t0 = performance.now();
  const _tlog = (label: string) => console.log(`[Init Timing] ${label}: ${(performance.now() - _t0).toFixed(0)}ms (module load: ${(_t0 - _moduleLoadStart).toFixed(0)}ms)`);

  // ── App bootstrap ──────────────────────────────────────────────────
  appContext = createApp();
  _tlog('createApp');

  const terrainRandom = {
    seedOffset: vec2.fromValues(0.0, 0.0),
    duneDir: vec2.fromValues(1.0, 0.0),
    craterDensity: 1.0,
    canyonDepth: 0.7,
  };

  terrainSceneService = new TerrainSceneService(appContext, {
    terrainRandom,
    getTerrainGeneratorCompute: () => terrainGeneratorCompute,
  });
  terrainGeometryUpdater = new TerrainGeometryUpdater(
    appContext.terrainState,
    appContext.simulationState,
    appContext.configHolder,
  );

  // Stats overlay
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);

  // ── Canvas + WebGPU capability ─────────────────────────────────────
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const webgpuCapability = await checkWebGPUSupport();
  if (!webgpuCapability.supported) {
    alert('WebGPU not supported! Reason: ' + (webgpuCapability.fallbackReason || 'Unknown'));
    return;
  }
  console.log('[WebGPU] WebGPU available — using for simulation compute shaders');
  appContext.simulationState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
  appContext.clientState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);

  // ── WebGPU renderer, compute pipeline, texture pool ────────────────
  let webgpuDevice: GPUDevice | null = null;
  let webgpuComputePipeline: ComputeNodePipeline | null = null;
  let webgpuTexturePool: WebGPUTexturePool | null = null;
  let webgpuRendererWrapper: WebGPURendererWrapper | null = null;
  let webgpuScene: Scene | null = null;
  let webgpuTerrainMesh: Mesh | null = null;
  let webgpuWaterMesh: Mesh | null = null;
  let webgpuLavaMesh: Mesh | null = null;
  let webgpuSkyMaterial: SkyMaterialNode | null = null;
  let sceneLighting: SceneLighting | null = null;
  let webgpuPoolSyncTextures: PoolSyncTextures | null = null;

  const initLoadingText = document.getElementById('loading-text');
  try {
    if (initLoadingText) initLoadingText.textContent = 'Initializing WebGPU...';
    webgpuRendererWrapper = new WebGPURendererWrapper(canvas, appContext);
    await webgpuRendererWrapper.initialize();
    _tlog('renderer.initialize()');
    _hmrCleanup = () => { webgpuRendererWrapper?.dispose(); webgpuRendererWrapper = null; };
    webgpuDevice = webgpuRendererWrapper.getDevice();
    if (!webgpuDevice) throw new Error('WebGPU device not available from renderer');

    webgpuComputePipeline = new ComputeNodePipeline(webgpuDevice);
    webgpuTexturePool = new WebGPUTexturePool(webgpuDevice, appContext.simulationState.simres, appContext.configHolder.shadowMapResolution);
    webgpuTexturePool.setup();
    _tlog('compute pipeline + texture pool');

    terrainGeneratorCompute = new TerrainGeneratorCompute(webgpuDevice);
    await terrainGeneratorCompute.initialize();
    terrainGeneratorCompute.setRandomSeed();
    _tlog('terrain generator init');

    webgpuScene = new Scene();
    webgpuRendererWrapper.setClearColor(0, 0, 0, 1);
    webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);
    sceneLighting = new SceneLighting(webgpuScene, webgpuRendererWrapper.getRenderer() ?? undefined);

    const simres = appContext.simulationState.simres;
    webgpuPoolSyncTextures = createPoolSyncTextures(simres);

    // ── Materials + meshes ─────────────────────────────────────────
    if (initLoadingText) initLoadingText.textContent = 'Building materials...';
    await new Promise<void>(r => requestAnimationFrame(() => r()));

    const segments = appContext.configHolder.raycastMeshResolution - 1;

    // Terrain
    const terrainGeo = new PlaneGeometry(1, 1, segments, segments);
    terrainGeo.rotateX(-Math.PI / 2);
    webgpuTerrainMesh = new Mesh(terrainGeo, new TerrainMaterialNode({
      heightmap: webgpuPoolSyncTextures.heightmap,
      normalMap: webgpuPoolSyncTextures.normalMap,
      sedimentMap: webgpuPoolSyncTextures.sedimentMap,
      velocityMap: webgpuPoolSyncTextures.velocityMap,
      fluxMap: webgpuPoolSyncTextures.fluxMap,
      terrainFluxMap: webgpuPoolSyncTextures.terrainFluxMap,
      maxSlippageMap: webgpuPoolSyncTextures.maxSlippageMap,
      sedimentBlendMap: webgpuPoolSyncTextures.sedimentBlendMap,
      lavaMap: webgpuPoolSyncTextures.lavaMap,
      lavaVelocityMap: webgpuPoolSyncTextures.lavaVelocityMap,
      coolLavaMap: webgpuPoolSyncTextures.coolLavaMap,
      basaltMap: webgpuPoolSyncTextures.basaltMap,
      simres,
      maxHeight: (controls?.TerrainHeight ?? 2) * 120,
    }) as any);
    webgpuTerrainMesh.frustumCulled = true;
    webgpuTerrainMesh.castShadow = true;
    webgpuTerrainMesh.receiveShadow = true;
    webgpuTerrainMesh.renderOrder = 0;
    webgpuScene.add(webgpuTerrainMesh);

    // Water
    const waterGeo = new PlaneGeometry(1, 1, segments, segments);
    waterGeo.rotateX(-Math.PI / 2);
    webgpuWaterMesh = new Mesh(waterGeo, new WaterMaterialNode({
      heightmap: webgpuPoolSyncTextures.heightmap,
      sedimentMap: webgpuPoolSyncTextures.sedimentMap,
      simres,
    }) as any);
    webgpuWaterMesh.frustumCulled = true;
    webgpuWaterMesh.renderOrder = 1;
    webgpuWaterMesh.visible = true;
    webgpuScene.add(webgpuWaterMesh);

    // Lava
    const lavaGeo = new PlaneGeometry(1, 1, segments, segments);
    lavaGeo.rotateX(-Math.PI / 2);
    webgpuLavaMesh = new Mesh(lavaGeo, new LavaMaterialNode({
      heightmap: webgpuPoolSyncTextures.heightmap,
      lavaMap: webgpuPoolSyncTextures.lavaMap,
      lavaVelocityMap: webgpuPoolSyncTextures.lavaVelocityMap,
      coolLavaMap: webgpuPoolSyncTextures.coolLavaMap,
      basaltMap: webgpuPoolSyncTextures.basaltMap,
      simres,
    }) as any);
    webgpuLavaMesh.frustumCulled = true;
    webgpuLavaMesh.renderOrder = 2;
    webgpuLavaMesh.visible = true;
    webgpuScene.add(webgpuLavaMesh);

    // Sky
    const skyGeo = new SphereGeometry(100, 32, 16);
    webgpuSkyMaterial = new SkyMaterialNode([0.4, 0.8, 0.0]);
    const skyMesh = new Mesh(skyGeo, webgpuSkyMaterial as any);
    skyMesh.renderOrder = -1;
    skyMesh.frustumCulled = false;
    webgpuScene.add(skyMesh);

    _tlog('materials + scene setup');
    console.log('[WebGPU] Renderer, compute pipeline, texture pool, and terrain generator initialized');
  } catch (error) {
    console.error('[WebGPU] Failed to initialize:', error);
    alert('Failed to initialize WebGPU. The application cannot run.');
    return;
  }

  // ── Controls + GUI ─────────────────────────────────────────────────
  let controllersRef: GUIControllers | null = null;
  const getControls = () => controls;
  const setTerrainBaseType = (value: number) => {
    controls.TerrainBaseType = value;
    controllersRef?.terrainBaseTypeController?.setValue(value);
  };
  if (!webgpuDevice || !webgpuTexturePool) {
    console.error('[main] WebGPU device or texture pool not available for heightmap IO.');
    return;
  }
  const { loadHeightMap, clearHeightMap, exportHeightMap } = createHeightMapLoader(
    appContext.simulationState, webgpuDevice, webgpuTexturePool, getControls, { setTerrainBaseType },
  );
  const resetErosionParameters = (c: IAppControls) => {
    c.Kc = 0.04; c.Ks = 0.02; c.Kd = 0.006; c.ErosionMode = 0;
    c.EvaporationConstant = 0.003; c.VelocityMultiplier = 1;
    c.VelocityAdvectionMag = 0.2; c.AdvectionMethod = 1;
    c.RainErosion = false; c.RainErosionStrength = 0.2; c.RainErosionDropSize = 2.0;
    const ec = (window as any).erosionControllers;
    if (ec) {
      ec.kcController.updateDisplay(); ec.ksController.updateDisplay();
      ec.kdController.updateDisplay(); ec.erosionModeController.updateDisplay();
      ec.evaporationController.updateDisplay(); ec.velocityMultiplierController.updateDisplay();
      ec.velocityAdvectionController.updateDisplay(); ec.advectionMethodController.updateDisplay();
      ec.rainErosionController.updateDisplay(); ec.rainErosionStrengthController.updateDisplay();
      ec.rainErosionDropSizeController.updateDisplay();
    }
  };
  const actions: ControlsActions = {
    loadScene: () => terrainSceneService.loadScene(),
    pauseResume: () => appContext.simulationState.setPauseGeneration(!appContext.simulationState.pauseGeneration),
    generateTerrain: () => terrainSceneService.reset(getControls()),
    setTerrainRandom: () => terrainSceneService.setTerrainRandom(getControls()),
    importHeightMap: loadHeightMap,
    clearHeightMap,
    exportHeightMap,
    resetErosionParameters,
  };
  controls = createControls(appContext, actions);
  const { gui, controllers } = setupGUI(controls);
  _tlog('controls + GUI setup');
  controllersRef = controllers;

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // ── Camera + Input ─────────────────────────────────────────────────
  controlsConfig = loadSettings();
  controls.raycastMethod = controlsConfig.raycast.method;

  const brushUsesLeftClick = controlsConfig.mouse.brushActivate === 'LEFT' ||
    (controlsConfig.mouse.brushActivate === null && controlsConfig.keys.brushActivate === 'LEFT');
  const camera = new Camera(vec3.fromValues(-0.18, 0.3, 0.6), vec3.fromValues(0, 0, 0), controlsConfig.camera, brushUsesLeftClick);

  (controls as any).terrainState = appContext.terrainState;

  const eventHandlers = createEventHandlers(controls, controlsConfig, camera, appContext.simulationState);
  const _inputManager = new InputManager(canvas, appContext, getControls, controlsConfig, eventHandlers);

  if (!webgpuRendererWrapper) {
    console.error('[main] WebGPU renderer required.');
    return;
  }
  console.log('[main] Using WebGPU renderer for main view');

  // ── Simulation runner ──────────────────────────────────────────────
  let timer = 0;
  const currentBrushState = {
    mouseWorldPos: [0, 0, 0, 0] as [number, number, number, number],
    mouseWorldDir: [0, 0, 0] as [number, number, number],
    brushPos: [0, 0] as [number, number],
  };
  let simRunner: WebGPUSimulationRunner | null = null;
  if (webgpuComputePipeline && webgpuTexturePool) {
    simRunner = new WebGPUSimulationRunner(
      webgpuComputePipeline, webgpuTexturePool, appContext,
      getControls, () => timer, () => currentBrushState,
    );
    if (webgpuDevice) {
      initLavaDiagnostics(webgpuDevice, webgpuTexturePool, appContext.simulationState.simres, getControls);
    }
  }

  // ── Runtime modules ────────────────────────────────────────────────
  const raycastManager = new RaycastManager(appContext);

  // Forward-declared so the resolution-change closure can reference it
  let sceneRenderer!: SceneRenderer;

  const terrainLoadingPipeline = new TerrainLoadingPipeline(appContext, terrainGeometryUpdater, {
    getDevice: () => webgpuDevice,
    getTexturePool: () => webgpuTexturePool,
    getTerrainGenerator: () => terrainGeneratorCompute,
    getControls,
    onResolutionChanged: (newRes: number) => {
      console.log(`[Loading] Resolution change: ${appContext.simulationState.simres} -> ${newRes}`);
      appContext.simulationState.setSimRes(newRes);
      webgpuTexturePool!.resizeSimulationTextures(newRes);
      appContext.simulationState.resizeHeightMapCpuBuf(newRes);

      const oldPoolSync = webgpuPoolSyncTextures;
      webgpuPoolSyncTextures = createPoolSyncTextures(newRes);
      if (oldPoolSync && webgpuDevice) {
        webgpuDevice.queue.onSubmittedWorkDone()
          .catch(() => undefined)
          .then(() => { Object.values(oldPoolSync).forEach((tex: any) => tex.dispose()); });
      }
      sceneRenderer.resetCompilationState();

      // Recreate materials — TSL graph rebuild on a compiled material
      // causes "Uniform string not declared" errors due to stale builder state.
      if (webgpuTerrainMesh) {
        (webgpuTerrainMesh.material as any)?.dispose();
        webgpuTerrainMesh.material = new TerrainMaterialNode({
          heightmap: webgpuPoolSyncTextures.heightmap,
          normalMap: webgpuPoolSyncTextures.normalMap,
          sedimentMap: webgpuPoolSyncTextures.sedimentMap,
          velocityMap: webgpuPoolSyncTextures.velocityMap,
          fluxMap: webgpuPoolSyncTextures.fluxMap,
          terrainFluxMap: webgpuPoolSyncTextures.terrainFluxMap,
          maxSlippageMap: webgpuPoolSyncTextures.maxSlippageMap,
          sedimentBlendMap: webgpuPoolSyncTextures.sedimentBlendMap,
          lavaMap: webgpuPoolSyncTextures.lavaMap,
          lavaVelocityMap: webgpuPoolSyncTextures.lavaVelocityMap,
          coolLavaMap: webgpuPoolSyncTextures.coolLavaMap,
          basaltMap: webgpuPoolSyncTextures.basaltMap,
          simres: newRes,
          maxHeight: (controls?.TerrainHeight ?? 2) * 120,
        }) as any;
      }
      if (webgpuWaterMesh) {
        (webgpuWaterMesh.material as any)?.dispose();
        webgpuWaterMesh.material = new WaterMaterialNode({
          heightmap: webgpuPoolSyncTextures.heightmap,
          sedimentMap: webgpuPoolSyncTextures.sedimentMap,
          simres: newRes,
        }) as any;
      }
      if (webgpuLavaMesh) {
        (webgpuLavaMesh.material as any)?.dispose();
        webgpuLavaMesh.material = new LavaMaterialNode({
          heightmap: webgpuPoolSyncTextures.heightmap,
          lavaMap: webgpuPoolSyncTextures.lavaMap,
          lavaVelocityMap: webgpuPoolSyncTextures.lavaVelocityMap,
          coolLavaMap: webgpuPoolSyncTextures.coolLavaMap,
          basaltMap: webgpuPoolSyncTextures.basaltMap,
          simres: newRes,
        }) as any;
      }

      // Clear old BVH/geometry (invalid for new resolution)
      if (appContext.terrainState.terrainBVH) appContext.terrainState.setTerrainBVH(null);
      if (appContext.terrainState.terrainGeometry) {
        appContext.terrainState.terrainGeometry.dispose();
        appContext.terrainState.setTerrainGeometry(null);
      }
      if (appContext.terrainState.terrainBVHBuildInProgress) {
        appContext.terrainState.setTerrainBVHBuildInProgress(false);
      }
    },
  });

  sceneRenderer = new SceneRenderer(webgpuRendererWrapper, webgpuScene!, {
    getTerrainMesh: () => webgpuTerrainMesh,
    getWaterMesh: () => webgpuWaterMesh,
    getLavaMesh: () => webgpuLavaMesh,
    getSkyMaterial: () => webgpuSkyMaterial,
    getSceneLighting: () => sceneLighting,
    getPoolSyncTextures: () => webgpuPoolSyncTextures,
    getTexturePool: () => webgpuTexturePool,
    getSimres: () => appContext.simulationState.simres,
  });

  // ── Tick-local state ───────────────────────────────────────────────
  let reusableHeightmapCopy: Float32Array | null = null;
  let lastBrushPressed = 0;
  let lastReadMouseX = -1;
  let lastReadMouseY = -1;

  _tlog('tick() defined — starting render loop');

  // ── Render loop ────────────────────────────────────────────────────
  function tick() {
    stats.begin();
    if (!webgpuRendererWrapper) { requestAnimationFrame(tick); return; }

    camera.update(controlsConfig.camera);

    // ── Raycast ──────────────────────────────────────────────────
    const normalizedMouse = RaycastManager.normalizeMousePosition(
      canvas, appContext.simulationState.lastX, appContext.simulationState.lastY,
    );
    const rayResult = raycastManager.update(
      camera, normalizedMouse.x, normalizedMouse.y, controls.raycastMethod,
    );
    controls.posTemp = rayResult.uvPos;

    timer++;

    // ── Terrain loading (generate → readback → BVH) ─────────────
    terrainLoadingPipeline.checkAndRun();

    // ── Brush state ──────────────────────────────────────────────
    const brushContext: BrushContext = {
      controls: controls as BrushControls,
      controlsConfig,
      simulationState: appContext.simulationState,
      terrainState: appContext.terrainState,
      camera,
    };
    updateBrushState(rayResult.uvPos, brushContext);

    const brushPressed = controls.brushPressed === 1;
    const brushVisible = Number(controls.brushType) !== 0;
    const justPressed = brushPressed && lastBrushPressed === 0;
    const justReleased = !brushPressed && lastBrushPressed === 1;
    appContext.simulationState.incrementHeightMapBufCounter();

    // ── Simulation ───────────────────────────────────────────────
    if (!webgpuComputePipeline || !webgpuTexturePool || !webgpuDevice) {
      console.error('[WebGPU] Compute pipeline not available.');
      requestAnimationFrame(tick);
      return;
    }

    // One-shot initial readback so heightMapCpuBuf is populated for brush raycasting
    terrainLoadingPipeline.requestInitialReadback();

    // Push world-space ray info for simulation brush uniforms
    currentBrushState.mouseWorldPos[0] = rayResult.worldOrigin[0];
    currentBrushState.mouseWorldPos[1] = rayResult.worldOrigin[1];
    currentBrushState.mouseWorldPos[2] = rayResult.worldOrigin[2];
    currentBrushState.mouseWorldPos[3] = 1;
    currentBrushState.mouseWorldDir[0] = rayResult.worldDir[0];
    currentBrushState.mouseWorldDir[1] = rayResult.worldDir[1];
    currentBrushState.mouseWorldDir[2] = rayResult.worldDir[2];
    currentBrushState.brushPos[0] = rayResult.uvPos[0];
    currentBrushState.brushPos[1] = rayResult.uvPos[1];

    for (let i = 0; i < controls.SimulationSpeed; i++) {
      if (simRunner) simRunner.step();
      appContext.simulationState.incrementSimFrameCount();
    }
    if (appContext.simulationState.enableBVHUpdates && controls.SimulationSpeed > 0 && !appContext.simulationState.pauseGeneration) {
      appContext.simulationState.incrementGeometryUpdateCounter();
    }

    // ── Heightmap readback throttling ────────────────────────────
    const mouseMoved = (lastReadMouseX < 0 || lastReadMouseY < 0) ||
      (Math.abs(appContext.simulationState.lastX - lastReadMouseX) + Math.abs(appContext.simulationState.lastY - lastReadMouseY) > 1);
    const shouldRead = (justPressed || mouseMoved) &&
      appContext.configHolder.shouldReadHeightmap(brushPressed, brushVisible, appContext.simulationState.simres, appContext.simulationState.heightMapBufCounter);
    const shouldReadForBVH = appContext.simulationState.enableBVHUpdates && justReleased &&
      appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH;

    if (shouldRead || shouldReadForBVH) {
      appContext.simulationState.readHeightmapFromWebGPU(webgpuDevice, webgpuTexturePool.readTerrainTexture)
        .then(() => {
          lastReadMouseX = appContext.simulationState.lastX;
          lastReadMouseY = appContext.simulationState.lastY;
          if (!brushPressed && !brushVisible && appContext.simulationState.heightMapBufCounter >= appContext.configHolder.maxHeightmapBufCounter) {
            appContext.simulationState.resetHeightMapBufCounter();
          }
        })
        .catch((error) => console.error('[WebGPU] Readback failed:', error));
    }

    // ── BVH geometry refit ───────────────────────────────────────
    const shouldUpdateNow = appContext.simulationState.enableBVHUpdates &&
      appContext.terrainState.terrainGeometry && appContext.terrainState.terrainBVH &&
      !appContext.terrainState.terrainBVHBuildInProgress && appContext.simulationState.heightMapBufIsFresh;
    const updateTriggeredByBrush = justReleased;
    const updateTriggeredByInterval = appContext.simulationState.shouldUpdateGeometry();

    if (shouldUpdateNow && (updateTriggeredByBrush || updateTriggeredByInterval)) {
      const srcBuf = appContext.simulationState.heightMapCpuBuf;
      if (!reusableHeightmapCopy || reusableHeightmapCopy.length !== srcBuf.length) {
        reusableHeightmapCopy = new Float32Array(srcBuf.length);
      }
      reusableHeightmapCopy.set(srcBuf);
      const heightmapCopy = reusableHeightmapCopy;
      appContext.simulationState.setHeightMapBufIsFresh(false);

      const performAsyncUpdate = () => {
        if (!appContext.terrainState.terrainGeometry || !appContext.terrainState.terrainBVH || appContext.terrainState.terrainBVHBuildInProgress) return;
        updateTerrainGeometry(
          appContext.terrainState.terrainGeometry,
          appContext.simulationState.simres,
          heightmapCopy, 1.0,
          appContext.simulationState.simres,
        );
        appContext.terrainState.terrainBVH.refit();
        appContext.simulationState.resetGeometryUpdateCounter();
        appContext.simulationState.setGeometryNeedsUpdate(false);
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(performAsyncUpdate, { timeout: 100 });
      } else {
        setTimeout(performAsyncUpdate, 0);
      }
    }

    lastBrushPressed = brushPressed ? 1 : 0;

    // ── Render ───────────────────────────────────────────────────
    sceneRenderer.render({ camera, controls, brushPos: rayResult.uvPos, timer });

    stats.end();
    requestAnimationFrame(tick);
  }

  // ── Runtime API ────────────────────────────────────────────────────
  const runtime = {
    start(): void { tick(); },
    resize(): void {
      camera.setAspectRatio(window.innerWidth / window.innerHeight);
      camera.updateProjectionMatrix();
      if (webgpuRendererWrapper) webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);
    },
    getControls: (): IAppControls => controls,
    getCamera: () => camera,
    getRenderer: () => webgpuRendererWrapper?.getRenderer() ?? null,
  };

  window.addEventListener('resize', runtime.resize, false);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();
  if (webgpuRendererWrapper) webgpuRendererWrapper.setSize(window.innerWidth, window.innerHeight);

  runtime.start();
}

// HMR: clean up WebGPU resources before full reload to avoid device lost errors
const hot = (import.meta as { hot?: { accept: (cb: () => void) => void; dispose?: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose?.(() => { _hmrCleanup?.(); });
  hot.accept(() => { window.location.reload(); });
}

main();
