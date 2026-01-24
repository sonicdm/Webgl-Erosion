import { vec2, vec3, vec4 } from 'gl-matrix';
import { rayCast } from '../../utils/raycast';
import { rayCastBVH } from '../../utils/bvh-raycast';

jest.mock('../../rendering/gl/OpenGLRenderer', () =>
  jest.fn().mockImplementation(() => ({ mockedRenderer: true }))
);

jest.mock('../../three/terrain/THREE.Terrain', () => ({
  ensureTerrainLibrary: jest.fn(),
  toHeightmap: jest.fn(),
}));

import { createApp } from '../bootstrap';
import { SimulationParams } from '../dto/SimulationParams';
import { BrushInput } from '../dto/BrushInput';

jest.mock('../../utils/raycast', () => ({
  rayCast: jest.fn(),
}));

jest.mock('../../utils/bvh-raycast', () => ({
  rayCastBVH: jest.fn(),
}));

const mockControlsConfig = {
  mouse: { brushActivate: 'LEFT' },
  camera: {
    movementSpeed: 1,
    rotateSpeed: 1,
    zoomSpeed: 1,
  },
};

jest.mock('../../settings', () => ({
  loadSettings: () => mockControlsConfig,
}));

// Mock Camera to avoid touching real three.js internals
jest.mock('../../Camera', () => {
  return jest.fn().mockImplementation(() => ({
    threeCamera: { mocked: true },
    threeControls: { target: { set: jest.fn() } },
    update: jest.fn(),
    setAspectRatio: jest.fn(),
    updateProjectionMatrix: jest.fn(),
  }));
});

// Helper to build a complete SimulationParams object with default numbers
const buildParams = (simres: number): SimulationParams => ({
  simres,
  speed: 1,
  timer: 0,
  Kc: 0,
  Ks: 0,
  Kd: 0,
  ErosionMode: 0,
  EvaporationConstant: 0,
  VelocityMultiplier: 0,
  VelocityAdvectionMag: 0,
  AdvectionMethod: 0,
  AdvectionSpeedScaling: 0,
  RainErosion: false,
  RainErosionStrength: 0,
  RainErosionDropSize: 0,
  RainDegree: 0,
  thermalRate: 0,
  thermalErosionScale: 0,
  thermalTalusAngleScale: 0,
  TerrainBaseMap: 0,
  TerrainBaseType: 0,
  TerrainBiomeType: 0,
  TerrainScale: 1,
  TerrainHeight: 1,
  TerrainMask: 0,
  TerrainDebug: 0,
  TerrainPlatte: 0,
  SnowRange: 0,
  ForestRange: 0,
  WaterTransparency: 0,
  SedimentTrace: false,
  ShowFlowTrace: false,
  pipelen: 0,
  timestep: 0,
  pipeAra: 0,
  LavaViscosityPreExp: 0,
  LavaActivationEnergy: 0,
  LavaDensity: 0,
  LavaSpecificHeat: 0,
  LavaAirHeatTransfer: 0,
  LavaWaterHeatTransfer: 0,
  LavaAmbientTemp: 0,
  LavaWaterTemp: 0,
  LavaContactHeatTransfer: 0,
  LavaMeltThreshold: 0,
  LavaLatentHeatFusion: 0,
  LavaSolidificationTemp: 0,
  LavaInitialTemp: 0,
  LavaGlowIntensity: 0,
  LavaPatternFrequency: 0,
  rockErosionResistance: 0,
  spawnposx: 0,
  spawnposy: 0,
  posTemp: vec2.fromValues(0, 0),
  lightPosX: 0,
  lightPosY: 0,
  lightPosZ: 0,
  showScattering: false,
  enableBilateralBlur: false,
  tesselations: 0,
  raycastMethod: 'heightmap',
  sourceCount: 0,
  LavaSourceCount: 0,
});

describe('bootstrap services (Workstream A)', () => {
  const glMock = {
    getSupportedExtensions: () => [],
    getExtension: () => ({}),
  } as unknown as WebGL2RenderingContext;

  const canvas = document.createElement('canvas') as HTMLCanvasElement;
  (canvas as any).getContext = () => glMock;
  Object.defineProperty(canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas, 'clientHeight', { value: 600 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an app context with services wired and camera initialized', () => {
    const app = createApp({
      canvas,
      glContext: glMock,
      initialSimres: 4,
    });

    // GL context service returns the provided context
    expect(app.glContext.getContext()).toBe(glMock);

    // Camera service is initialized via loadSettings and exposes a camera
    expect(app.cameraService.getCamera()).toBeTruthy();
    expect(app.controlsConfig).toBe(mockControlsConfig);

    // State holders use provided simres
    expect(app.simulationState.simres).toBe(4);
    expect(app.terrainStateHolder.heightMapCpuBuf.length).toBe(4 * 4 * 4);
  });

  it('SimulationStepRunner delegates to Three runtime and maps brush input', () => {
    const runtime = { executeSimulationStep: jest.fn() } as any;
    const app = createApp({
      canvas,
      glContext: glMock,
      initialSimres: 8,
      threeRuntime: runtime,
    });

    const params = buildParams(8);
    const brushInput: BrushInput = {
      mouseWorldPos: vec4.fromValues(1, 2, 3, 1),
      mouseWorldDir: vec3.fromValues(0, 1, 0),
      brushPos: vec2.fromValues(0.5, 0.6),
      brushType: 2,
      brushSize: 1,
      brushStrength: 0.5,
      brushOperation: 1,
      brushPressed: 1,
      flattenTargetHeight: 0,
      slopeStartPos: vec2.fromValues(0, 0),
      slopeEndPos: vec2.fromValues(0, 0),
      slopeActive: 0,
      posTemp: vec2.fromValues(0, 0),
    };

    app.simulationStepRunner.executeStep(params, 123, brushInput);

    expect(runtime.executeSimulationStep).toHaveBeenCalledWith(
      params,
      123,
      expect.objectContaining({
        mouseWorldPos: brushInput.mouseWorldPos,
        mouseWorldDir: brushInput.mouseWorldDir,
        brushPos: brushInput.brushPos,
      })
    );
  });

  it('RaycasterService falls back to heightmap when BVH is missing and uses rayCast output', () => {
    const app = createApp({
      canvas,
      glContext: glMock,
      initialSimres: 4,
    });

    // Force no BVH
    app.terrainStateHolder.terrainBVH = null;
    app.terrainStateHolder.terrainGeometry = null;

    // Mock rayCast to write into the out vec
    (rayCast as jest.Mock).mockImplementation((_o, _d, _s, _buf, out: any) => {
      out[0] = 0.25;
      out[1] = 0.75;
    });

    const out: [number, number] = [-10, -10];
    const hit = app.raycaster.raycast(
      [0, 0, 0] as any,
      [0, -1, 0] as any,
      'bvh',
      out as any
    );

    expect(hit).toBe(true);
    expect(out).toEqual([0.25, 0.75]);
    expect(rayCastBVH).not.toHaveBeenCalled();
  });
});
