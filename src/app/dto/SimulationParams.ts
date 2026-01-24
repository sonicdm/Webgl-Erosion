import { vec2 } from 'gl-matrix';

/**
 * Typed simulation parameters DTO
 * Replaces the ambiguous `any` controls object
 */
export interface SimulationParams {
  // Simulation basics
  simres: number;
  speed: number;
  timer: number;
  
  // Erosion parameters
  Kc: number; // Erosion capacity constant
  Ks: number; // Erosion dissolving constant
  Kd: number; // Erosion deposition constant
  ErosionMode: number; // 0: river, 1: mountain, 2: polygonal
  EvaporationConstant: number;
  VelocityMultiplier: number;
  VelocityAdvectionMag: number;
  AdvectionMethod: number;
  AdvectionSpeedScaling: number;
  
  // Rain erosion
  RainErosion: boolean;
  RainErosionStrength: number;
  RainErosionDropSize: number;
  RainDegree: number;
  
  // Thermal erosion
  thermalRate: number;
  thermalErosionScale: number;
  thermalTalusAngleScale: number;
  
  // Terrain generation
  TerrainBaseMap: number;
  TerrainBaseType: number; // 0: fbm, 1: domain warping, 2: terrace, 3: voronoi
  TerrainBiomeType: number;
  TerrainScale: number;
  TerrainHeight: number;
  TerrainMask: number;
  TerrainDebug: number;
  TerrainPlatte: number; // 0: alpine, 1: desert, 2: jungle
  SnowRange: number;
  ForestRange: number;
  
  // Water/sediment visualization
  WaterTransparency: number;
  SedimentTrace: boolean;
  ShowFlowTrace: boolean;
  
  // Lava physics
  pipelen: number;
  timestep: number;
  pipeAra: number;
  LavaViscosityPreExp: number;
  LavaActivationEnergy: number;
  LavaDensity: number;
  LavaSpecificHeat: number;
  LavaAirHeatTransfer: number;
  LavaWaterHeatTransfer: number;
  LavaAmbientTemp: number;
  LavaWaterTemp: number;
  LavaContactHeatTransfer: number;
  LavaMeltThreshold: number;
  LavaLatentHeatFusion: number;
  LavaSolidificationTemp: number;
  LavaInitialTemp: number;
  LavaGlowIntensity: number;
  LavaPatternFrequency: number;
  
  // Rock erosion resistance
  rockErosionResistance: number;
  
  // Spawn position
  spawnposx: number;
  spawnposy: number;
  posTemp: vec2;
  
  // Rendering
  lightPosX: number;
  lightPosY: number;
  lightPosZ: number;
  showScattering: boolean;
  enableBilateralBlur: boolean;
  tesselations: number;
  
  // Raycast method
  raycastMethod: 'heightmap' | 'bvh';
  
  // Source counts (for shader packing)
  sourceCount: number; // Water sources
  LavaSourceCount: number; // Lava sources
}

/**
 * Creates a SimulationParams object from a controls-like object
 */
export function createSimulationParams(controls: any, simres: number): SimulationParams {
  return {
    simres: controls.SimulationResolution ?? simres,
    speed: controls.SimulationSpeed ?? 3,
    timer: 0, // Will be set per frame
    
    Kc: controls.Kc ?? 0.06,
    Ks: controls.Ks ?? 0.036,
    Kd: controls.Kd ?? 0.006,
    ErosionMode: controls.ErosionMode ?? 0,
    EvaporationConstant: controls.EvaporationConstant ?? 0.003,
    VelocityMultiplier: controls.VelocityMultiplier ?? 1,
    VelocityAdvectionMag: controls.VelocityAdvectionMag ?? 0.2,
    AdvectionMethod: controls.AdvectionMethod ?? 1,
    AdvectionSpeedScaling: controls.AdvectionSpeedScaling ?? 1.0,
    
    RainErosion: controls.RainErosion ?? false,
    RainErosionStrength: controls.RainErosionStrength ?? 0.2,
    RainErosionDropSize: controls.RainErosionDropSize ?? 2.0,
    RainDegree: controls.RainDegree ?? 4.5,
    
    thermalRate: controls.thermalRate ?? 0.5,
    thermalErosionScale: controls.thermalErosionScale ?? 1.0,
    thermalTalusAngleScale: controls.thermalTalusAngleScale ?? 8.0,
    
    TerrainBaseMap: controls.TerrainBaseMap ?? 0,
    TerrainBaseType: controls.TerrainBaseType ?? 0,
    TerrainBiomeType: controls.TerrainBiomeType ?? 1,
    TerrainScale: controls.TerrainScale ?? 3.2,
    TerrainHeight: controls.TerrainHeight ?? 2.0,
    TerrainMask: controls.TerrainMask ?? 0,
    TerrainDebug: controls.TerrainDebug ?? 0,
    TerrainPlatte: controls.TerrainPlatte ?? 1,
    SnowRange: controls.SnowRange ?? 0,
    ForestRange: controls.ForestRange ?? 0,
    
    WaterTransparency: controls.WaterTransparency ?? 0.50,
    SedimentTrace: controls.SedimentTrace ?? true,
    ShowFlowTrace: controls.ShowFlowTrace ?? false,
    
    pipelen: controls.pipelen ?? 0.8,
    timestep: controls.timestep ?? 0.05,
    pipeAra: controls.pipeAra ?? 0.6,
    LavaViscosityPreExp: controls.LavaViscosityPreExp ?? 1e-5,
    LavaActivationEnergy: controls.LavaActivationEnergy ?? 200000.0,
    LavaDensity: controls.LavaDensity ?? 2700.0,
    LavaSpecificHeat: controls.LavaSpecificHeat ?? 1200.0,
    LavaAirHeatTransfer: controls.LavaAirHeatTransfer ?? 200.0,
    LavaWaterHeatTransfer: controls.LavaWaterHeatTransfer ?? 2000.0,
    LavaAmbientTemp: controls.LavaAmbientTemp ?? 20.0,
    LavaWaterTemp: controls.LavaWaterTemp ?? 10.0,
    LavaContactHeatTransfer: controls.LavaContactHeatTransfer ?? 200.0,
    LavaMeltThreshold: controls.LavaMeltThreshold ?? 1200.0,
    LavaLatentHeatFusion: controls.LavaLatentHeatFusion ?? 400000.0,
    LavaSolidificationTemp: controls.LavaSolidificationTemp ?? 800.0,
    LavaInitialTemp: controls.LavaInitialTemp ?? 1200.0,
    LavaGlowIntensity: controls.LavaGlowIntensity ?? 2.0,
    LavaPatternFrequency: controls.LavaPatternFrequency ?? 8.0,
    
    rockErosionResistance: controls.rockErosionResistance ?? 0.8,
    
    spawnposx: controls.spawnposx ?? 0.5,
    spawnposy: controls.spawnposy ?? 0.5,
    posTemp: controls.posTemp ? vec2.clone(controls.posTemp) : vec2.fromValues(0.0, 0.0),
    
    lightPosX: controls.lightPosX ?? 0.4,
    lightPosY: controls.lightPosY ?? 0.8,
    lightPosZ: controls.lightPosZ ?? -0.0,
    showScattering: controls.showScattering ?? true,
    enableBilateralBlur: controls.enableBilateralBlur ?? true,
    tesselations: controls.tesselations ?? 5,
    
    raycastMethod: controls.raycastMethod ?? 'bvh',
    
    sourceCount: controls.sourceCount ?? 0,
    LavaSourceCount: controls.LavaSourceCount ?? 0,
  };
}
