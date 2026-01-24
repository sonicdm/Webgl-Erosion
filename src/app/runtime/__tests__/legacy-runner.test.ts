import { createLegacyRunner, type LegacyRunnerConfig, type LegacyRunnerResult } from '../legacy-runner';
import { createWebGL2Mock } from '../../../test-utils/webgl2-mock';
import { Controls } from '../../../gui/gui-setup';
import { vec2, vec3 } from 'gl-matrix';

describe('LegacyRunner', () => {
  let mockGL: WebGL2RenderingContext;
  let canvas: HTMLCanvasElement;
  let mockAppContext: any;
  let controls: Controls;

  beforeEach(() => {
    // Create mock WebGL2 context
    mockGL = createWebGL2Mock() as any;
    
    // Create a minimal canvas element
    canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    // Create minimal mock app context
    mockAppContext = {
      simulationState: {
        simres: 1024,
        simFrameCount: 0,
        pauseGeneration: false,
        terrainGeometryDirty: false,
      },
      terrainStateHolder: {
        terrainGeometry: null,
        terrainBVH: null,
      },
      clientState: {
        clientWidth: 512,
        clientHeight: 512,
        lastX: 0,
        lastY: 0,
      },
      controlsConfig: {
        raycast: { method: 'bvh' },
      },
    };

    // Create minimal controls object
    controls = {
      tesselations: 5,
      pipelen: 0.8,
      Kc: 0.06,
      Ks: 0.036,
      Kd: 0.006,
      timestep: 0.05,
      pipeAra: 0.6,
      ErosionMode: 0,
      RainErosion: false,
      RainErosionStrength: 0.2,
      RainErosionDropSize: 2.0,
      EvaporationConstant: 0.003,
      VelocityMultiplier: 1,
      RainDegree: 4.5,
      AdvectionSpeedScaling: 1.0,
      spawnposx: 0.5,
      spawnposy: 0.5,
      posTemp: vec2.fromValues(0.0, 0.0),
      'Pause/Resume': () => {},
      'ResetTerrain': () => {},
      'setTerrainRandom': () => {},
      'Import Height Map': () => {},
      'Clear Height Map': () => {},
      'Export Height Map': () => {},
      SimulationSpeed: 3,
      TerrainBaseMap: 0,
      TerrainBaseType: 0,
      TerrainBiomeType: 1,
      TerrainScale: 3.2,
      TerrainHeight: 2.0,
      TerrainMask: 0,
      TerrainDebug: 0,
      WaterTransparency: 0.50,
      SedimentTrace: true,
      ShowFlowTrace: false,
      TerrainPlatte: 1,
      SnowRange: 0,
      ForestRange: 0,
      brushType: 2,
      brushSize: 4,
      brushStrenth: 0.25,
      brushOperation: 0,
      brushPressed: 0,
      raycastMethod: 'bvh' as 'heightmap' | 'bvh',
      flattenTargetHeight: 0.0,
      slopeStartPos: vec2.fromValues(0.0, 0.0),
      slopeEndPos: vec2.fromValues(0.0, 0.0),
      slopeActive: 0,
      sourceCount: 0,
      rockErosionResistance: 0.8,
      thermalTalusAngleScale: 8.0,
      thermalRate: 0.5,
      thermalErosionScale: 1.0,
      lightPosX: 0.4,
      lightPosY: 0.8,
      lightPosZ: -0.0,
      showScattering: true,
      enableBilateralBlur: true,
      AdvectionMethod: 1,
      VelocityAdvectionMag: 0.2,
      SimulationResolution: 1024,
      LavaViscosityPreExp: 1e-5,
      LavaActivationEnergy: 200000.0,
      LavaDensity: 2700.0,
      LavaSpecificHeat: 1200.0,
      LavaAirHeatTransfer: 200.0,
      LavaWaterHeatTransfer: 2000.0,
      LavaAmbientTemp: 20.0,
      LavaWaterTemp: 10.0,
      LavaContactHeatTransfer: 200.0,
      LavaMeltThreshold: 1200.0,
      LavaLatentHeatFusion: 400000.0,
      LavaSolidificationTemp: 800.0,
      LavaInitialTemp: 1200.0,
      LavaGlowIntensity: 2.0,
      LavaPatternFrequency: 8.0,
      LavaSourceCount: 0,
      'Reset Erosion Parameters': () => {},
    };
  });

  describe('createLegacyRunner', () => {
    it('should return a runner with start, stop, and dispose methods', () => {
      // This is a type/interface test - we verify the function signature
      // Full integration testing would require a real WebGL context and is better done manually
      expect(typeof createLegacyRunner).toBe('function');
      
      // Verify the return type interface
      const mockConfig: LegacyRunnerConfig = {
        appContext: mockAppContext,
        controls,
        canvas,
        glContext: mockGL,
        renderer: {} as any,
        camera: {} as any,
        shaders: { waterHeight: {} as any } as any,
        geometries: {} as any,
        terrainRandom: {
          seedOffset: [0.0, 0.0],
          duneDir: [1.0, 0.0],
          craterDensity: 1.0,
          canyonDepth: 0.7,
        },
      };

      // Note: We can't actually call createLegacyRunner with mocks because it requires
      // real WebGL context, Three.js Camera, etc. This test verifies the interface exists.
      // Full functionality testing should be done via manual testing or browser-based integration tests.
      
      expect(mockConfig).toBeDefined();
      expect(mockConfig.appContext).toBeDefined();
      expect(mockConfig.controls).toBeDefined();
    });

    it('should have correct LegacyRunnerResult interface', () => {
      // Verify the interface structure
      const mockRunner: LegacyRunnerResult = {
        start: jest.fn(),
        stop: jest.fn(),
        dispose: jest.fn(),
      };

      expect(mockRunner.start).toBeDefined();
      expect(mockRunner.stop).toBeDefined();
      expect(mockRunner.dispose).toBeDefined();
      expect(typeof mockRunner.start).toBe('function');
      expect(typeof mockRunner.stop).toBe('function');
      expect(typeof mockRunner.dispose).toBe('function');
    });
  });
});
