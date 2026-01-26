import { vec2, vec3 } from 'gl-matrix';
import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import OpenGLRenderer from '../rendering/gl/OpenGLRenderer';
import Camera from '../Camera';
import { ControlsConfig } from '../controls-config';
import { loadSettings } from '../settings';
import { rayCast } from '../utils/raycast';
import { rayCastBVH } from '../utils/bvh-raycast';
import { createTerrainIO, TerrainIOControls } from '../three/utils/terrain-io';
import { SimulationStateHolder } from './state/SimulationStateHolder';
import { TerrainStateHolder } from './state/TerrainStateHolder';
import { ClientStateHolder } from './state/ClientStateHolder';
import { SourceArrays } from './dto/SourceArrays';
import { SimulationParams } from './dto/SimulationParams';
import { BrushInput } from './dto/BrushInput';
import { waterSources } from '../utils/water-sources';
import { lavaSources } from '../utils/lava-sources';
import { ThreeJSSimulationRuntime } from '../three/integration';

// ============================================================================
// Service Interfaces
// ============================================================================

export interface IGLContext {
  getContext(): WebGL2RenderingContext;
}

export interface IRendererFactory {
  createRenderer(canvas: HTMLCanvasElement): OpenGLRenderer;
}

export interface IBrushState {
  getOriginalBrushOperation(): number | null;
  setOriginalBrushOperation(value: number | null): void;
}

export interface ITerrainState {
  getState(): TerrainStateHolder;
}

export interface IHeightmapIO {
  importHeightmap(): void;
  clearHeightmap(): void;
  exportHeightmap(): void;
}

export interface IRaycaster {
  raycast(
    rayOrigin: vec3,
    rayDirection: vec3,
    method: 'heightmap' | 'bvh',
    out: vec2
  ): boolean;
}

export interface ISimulationStepRunner {
  executeStep(
    params: SimulationParams,
    timer: number,
    brushInput?: BrushInput
  ): void;
}

export interface ICameraService {
  getCamera(): Camera | null;
  getThreeJSCamera(): any; // THREE.Camera
  setControlsConfig(config: ControlsConfig, brushUsesLeftClick: boolean): void;
  update(config: ControlsConfig['camera']): void;
}

// ============================================================================
// Service Implementations
// ============================================================================

class GLContextService implements IGLContext {
  constructor(private gl: WebGL2RenderingContext) {}

  getContext(): WebGL2RenderingContext {
    return this.gl;
  }
}

class RendererFactoryService implements IRendererFactory {
  createRenderer(canvas: HTMLCanvasElement): OpenGLRenderer {
    return new OpenGLRenderer(canvas);
  }
}

class BrushStateService implements IBrushState {
  private originalBrushOperation: number | null = null;

  getOriginalBrushOperation(): number | null {
    return this.originalBrushOperation;
  }

  setOriginalBrushOperation(value: number | null): void {
    this.originalBrushOperation = value;
  }
}

class TerrainStateService implements ITerrainState {
  constructor(private terrainState: TerrainStateHolder) {}

  getState(): TerrainStateHolder {
    return this.terrainState;
  }
}

class HeightmapIOService implements IHeightmapIO {
  private io: {
    importHeightmap: () => void;
    clearHeightmap: () => void;
    exportHeightmap: () => void;
  };

  constructor(
    simres: number,
    controls: TerrainIOControls,
    getTerrainGeometry: () => BufferGeometry | null,
    onHeightmapChange: (heightmap: HTMLCanvasElement | HTMLImageElement | null) => Promise<void> | void
  ) {
    this.io = createTerrainIO({
      simres,
      controls,
      getTerrainGeometry,
      onHeightmapChange,
    });
  }

  importHeightmap(): void {
    this.io.importHeightmap();
  }

  clearHeightmap(): void {
    this.io.clearHeightmap();
  }

  exportHeightmap(): void {
    this.io.exportHeightmap();
  }
}

class RaycasterService implements IRaycaster {
  constructor(
    private terrainState: TerrainStateHolder,
    private simState: SimulationStateHolder
  ) {}

  raycast(
    rayOrigin: vec3,
    rayDirection: vec3,
    method: 'heightmap' | 'bvh',
    out: vec2
  ): boolean {
    if (method === 'bvh') {
      const bvh = this.terrainState.terrainBVH;
      const geometry = this.terrainState.terrainGeometry;
      if (bvh && geometry) {
        return rayCastBVH(rayOrigin, rayDirection, bvh, geometry, out);
      }
      // Fallback to heightmap if BVH not available
      method = 'heightmap';
    }

    if (method === 'heightmap') {
      const buffer = this.terrainState.heightMapCpuBuf;
      const simres = this.simState.simres;
      rayCast(rayOrigin, rayDirection, simres, buffer, out);
      // Check if a valid hit was found (out[0] and out[1] should be in [0, 1] range)
      // rayCast sets out to [-10, -10] when no hit is found
      return out[0] >= 0 && out[0] <= 1 && out[1] >= 0 && out[1] <= 1;
    }

    return false;
  }
}

class SimulationStepRunnerService implements ISimulationStepRunner {
  private threeRuntime: ThreeJSSimulationRuntime | null = null;

  constructor(threeRuntime?: ThreeJSSimulationRuntime) {
    this.threeRuntime = threeRuntime ?? null;
  }

  /**
   * Sets the Three.js runtime to delegate to
   */
  setThreeRuntime(runtime: ThreeJSSimulationRuntime | null): void {
    this.threeRuntime = runtime;
  }

  executeStep(
    params: SimulationParams,
    timer: number,
    brushInput?: BrushInput
  ): void {
    if (this.threeRuntime) {
      // Convert BrushInput to the format expected by ThreeJSSimulationRuntime
      const brushState = brushInput ? {
        mouseWorldPos: brushInput.mouseWorldPos as [number, number, number, number] | undefined,
        mouseWorldDir: brushInput.mouseWorldDir as [number, number, number] | undefined,
        brushPos: brushInput.brushPos as [number, number] | undefined,
      } : undefined;

      // Delegate to Three.js runtime
      this.threeRuntime.executeSimulationStep(params, timer, brushState);
    } else {
      // Legacy pipeline not yet supported through this service
      // This will be implemented in Workstream B when main.ts is split
      throw new Error('SimulationStepRunner: No runtime configured. Set Three.js runtime or use legacy pipeline directly.');
    }
  }
}

class CameraService implements ICameraService {
  private camera: Camera | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private initialPosition: vec3,
    private initialTarget: vec3
  ) {}

  setControlsConfig(config: ControlsConfig, brushUsesLeftClick: boolean): void {
    this.camera = new Camera(
      this.initialPosition,
      this.initialTarget,
      config.camera,
      brushUsesLeftClick
    );

    // Ensure OrbitControls target is set
    if (this.camera.threeControls) {
      this.camera.threeControls.target.set(
        this.initialTarget[0],
        this.initialTarget[1],
        this.initialTarget[2]
      );
    }
  }

  getCamera(): Camera | null {
    return this.camera;
  }

  getThreeJSCamera(): any {
    if (this.camera) {
      return this.camera.threeCamera;
    }
    return null;
  }

  update(config: ControlsConfig['camera']): void {
    if (this.camera) {
      this.camera.update(config);
    }
  }
}

// ============================================================================
// Application Context (Composition Root)
// ============================================================================

export interface AppContext {
  // Services
  glContext: IGLContext;
  rendererFactory: IRendererFactory;
  brushState: IBrushState;
  terrainState: ITerrainState;
  heightmapIO: IHeightmapIO;
  raycaster: IRaycaster;
  simulationStepRunner: ISimulationStepRunner;
  cameraService: ICameraService;

  // State holders
  simulationState: SimulationStateHolder;
  terrainStateHolder: TerrainStateHolder;
  clientState: ClientStateHolder;

  // Configuration
  controlsConfig: ControlsConfig;
  sourceArrays: SourceArrays;

  // Initial values
  initialSimres: number;

  /** Set in legacy path only; used by resize handler for pool.resizeScreenTextures(). */
  legacyTexturePool?: { resizeScreenTextures(): void };
}

export interface BootstrapConfig {
  canvas: HTMLCanvasElement;
  glContext: WebGL2RenderingContext;
  initialSimres?: number;
  controlsConfig?: ControlsConfig;
  getTerrainGeometry?: () => BufferGeometry | null;
  onHeightmapChange?: (heightmap: HTMLCanvasElement | HTMLImageElement | null) => Promise<void> | void;
  terrainIOControls?: TerrainIOControls;
  threeRuntime?: ThreeJSSimulationRuntime; // Optional: wire up Three.js runtime for simulation steps
}

/**
 * Creates the application context (composition root)
 * Builds and wires all services together
 */
export function createApp(config: BootstrapConfig): AppContext {
  const {
    canvas,
    glContext,
    initialSimres = 1024,
    controlsConfig: providedConfig,
    getTerrainGeometry = () => null,
    onHeightmapChange = async () => {},
    terrainIOControls = { TerrainHeight: 2.0 },
    threeRuntime,
  } = config;

  // Load or use provided controls config
  const controlsConfig = providedConfig ?? loadSettings();

  // Create state holders
  const simulationState = new SimulationStateHolder(initialSimres);
  const terrainStateHolder = new TerrainStateHolder(initialSimres);
  const clientState = new ClientStateHolder();

  // Create source arrays from global state (will be migrated later)
  const sourceArrays = new SourceArrays(waterSources, lavaSources);

  // Create services
  const glContextService = new GLContextService(glContext);
  const rendererFactory = new RendererFactoryService();
  const brushState = new BrushStateService();
  const terrainState = new TerrainStateService(terrainStateHolder);
  const heightmapIO = new HeightmapIOService(
    initialSimres,
    terrainIOControls,
    getTerrainGeometry,
    onHeightmapChange
  );
  const raycaster = new RaycasterService(terrainStateHolder, simulationState);
  const simulationStepRunner = new SimulationStepRunnerService(threeRuntime);

  // Create camera service with default position
  const initialPosition = vec3.fromValues(150, 200, 150);
  const initialTarget = vec3.fromValues(0, 0, 0);
  const cameraService = new CameraService(canvas, initialPosition, initialTarget);
  cameraService.setControlsConfig(controlsConfig, controlsConfig.mouse.brushActivate === 'LEFT');

  return {
    glContext: glContextService,
    rendererFactory,
    brushState,
    terrainState,
    heightmapIO,
    raycaster,
    simulationStepRunner,
    cameraService,
    simulationState,
    terrainStateHolder,
    clientState,
    controlsConfig,
    sourceArrays,
    initialSimres,
  };
}
