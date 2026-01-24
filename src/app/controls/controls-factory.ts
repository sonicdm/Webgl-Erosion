import { vec2 } from 'gl-matrix';
import { Controls } from '../../gui/gui-setup';
import { simres } from '../../simulation/simulation-state';

/**
 * Options for creating controls object
 */
export interface CreateControlsOptions {
  /**
   * Callback functions that will be set after controls creation
   * These are set separately because they may depend on other initialized objects
   */
  callbacks?: {
    startGeneration?: () => void;
    resetTerrain?: () => void;
    setTerrainRandom?: () => void;
    importHeightMap?: () => void;
    clearHeightMap?: () => void;
    exportHeightMap?: () => void;
  };
}

/**
 * Creates a controls object with default values
 * This factory function centralizes the controls object creation
 * and makes it easier to maintain default values.
 * 
 * @param options - Optional callbacks to set on the controls object
 * @returns Controls object with all default values set
 */
export function createControls(options: CreateControlsOptions = {}): Controls {
  const {
    callbacks = {},
  } = options;

  const controls: Controls = {
    // Simulation parameters
    tesselations: 5,
    pipelen: 0.8,
    Kc: 0.06,
    Ks: 0.036,
    Kd: 0.006,
    timestep: 0.05,
    pipeAra: 0.6,
    ErosionMode: 0, // 0 river erosion, 1 : mountain erosion, 2 : polygonal mode
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
    
    // Callback functions (will be set by callbacks option or later)
    'Pause/Resume': callbacks.startGeneration || (() => {}),
    'ResetTerrain': callbacks.resetTerrain || (() => {}),
    'setTerrainRandom': callbacks.setTerrainRandom || (() => {}),
    'Import Height Map': callbacks.importHeightMap || (() => {}),
    'Clear Height Map': callbacks.clearHeightMap || (() => {}),
    'Export Height Map': callbacks.exportHeightMap || (() => {}),
    
    // Terrain parameters
    SimulationSpeed: 3,
    TerrainBaseMap: 0,
    TerrainBaseType: 0, // 0 ordinary fbm, 1 domain warping, 2 terrace, 3 voroni
    TerrainBiomeType: 1,
    TerrainScale: 3.2,
    TerrainHeight: 2.0,
    TerrainMask: 0, // 0 off, 1 sphere
    TerrainDebug: 0,
    WaterTransparency: 0.50,
    SedimentTrace: true,
    ShowFlowTrace: false,
    TerrainPlatte: 1, // 0 normal alphine mtn, 1 desert, 2 jungle
    SnowRange: 0,
    ForestRange: 0,
    
    // Brush parameters
    brushType: 2, // 0 : no brush, 1 : terrain, 2 : water, 3 : rock, 4 : smooth, 5 : flatten, 6 : slope
    brushSize: 4,
    brushStrenth: 0.25,
    brushOperation: 0, // 0 : add, 1 : subtract
    brushPressed: 0, // 0 : not pressed, 1 : pressed
    raycastMethod: 'bvh' as 'heightmap' | 'bvh', // Will be overridden by settings
    flattenTargetHeight: 0.0,
    slopeStartPos: vec2.fromValues(0.0, 0.0),
    slopeEndPos: vec2.fromValues(0.0, 0.0),
    slopeActive: 0, // 0 : not active, 1 : start set, 2 : end set
    
    // Source parameters
    sourceCount: 0, // Number of active water sources
    rockErosionResistance: 0.8, // 0.0 = erodes normally, 1.0 = doesn't erode (multiplier for Ks/Kc)
    thermalTalusAngleScale: 8.0,
    thermalRate: 0.5,
    thermalErosionScale: 1.0,
    
    // Lighting parameters
    lightPosX: 0.4,
    lightPosY: 0.8,
    lightPosZ: -0.0,
    showScattering: true,
    enableBilateralBlur: true,
    
    // Advection parameters
    AdvectionMethod: 1,
    VelocityAdvectionMag: 0.2,
    SimulationResolution: simres,
    
    // Lava physics parameters
    LavaViscosityPreExp: 1e-5,
    LavaActivationEnergy: 200000.0,
    LavaDensity: 2700.0,
    LavaSpecificHeat: 1200.0,
    LavaAirHeatTransfer: 200.0, // Increased from 30.0 (6-7x faster cooling)
    LavaWaterHeatTransfer: 2000.0,
    LavaAmbientTemp: 20.0,
    LavaWaterTemp: 10.0,
    LavaContactHeatTransfer: 200.0,
    LavaMeltThreshold: 1200.0,
    LavaLatentHeatFusion: 400000.0,
    LavaSolidificationTemp: 800.0,
    LavaInitialTemp: 1200.0,
    LavaGlowIntensity: 2.0,
    LavaPatternFrequency: 8.0, // Pattern frequency/scale for lava texture detail
    LavaSourceCount: 0, // Number of active lava sources
    
    // Reset erosion parameters callback
    'Reset Erosion Parameters': function() {
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
        controllers.kcController?.updateDisplay();
        controllers.ksController?.updateDisplay();
        controllers.kdController?.updateDisplay();
        controllers.erosionModeController?.updateDisplay();
        controllers.evaporationController?.updateDisplay();
        controllers.velocityMultiplierController?.updateDisplay();
        controllers.velocityAdvectionController?.updateDisplay();
        controllers.advectionMethodController?.updateDisplay();
        controllers.rainErosionController?.updateDisplay();
        controllers.rainErosionStrengthController?.updateDisplay();
        controllers.rainErosionDropSizeController?.updateDisplay();
      }
    },
  };

  return controls;
}
