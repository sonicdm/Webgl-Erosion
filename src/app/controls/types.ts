import { vec2 } from 'gl-matrix';

/**
 * Stable action handlers injected into controls before GUI binds.
 * GUI captures these references at creation; do not reassign after setupGUI.
 */
export interface ControlsActions {
    loadScene: () => void;
    pauseResume: () => void;
    generateTerrain: () => void;
    setTerrainRandom: () => void;
    importHeightMap: () => void;
    clearHeightMap: () => void;
    exportHeightMap: () => void;
    /** Optional: receives the controls object to mutate erosion params back to defaults */
    resetErosionParameters?: (controls: IAppControls) => void;
}

/**
 * Application controls shape: sim params, terrain params, brush, and action refs.
 * Used by GUI, event handlers, and render loop. All values come from createControls(ctx, actions).
 */
export interface IAppControls {
    [key: string]: any;
    // Simulation
    SimulationResolution: number;
    SimulationSpeed: number;
    'Load Scene': () => void;
    'Pause/Resume': () => void;
    'Generate Terrain': () => void;
    'setTerrainRandom': () => void;
    'Import Height Map': () => void;
    'Clear Height Map': () => void;
    'Export Height Map': () => void;
    // Terrain
    TerrainBaseType: number;
    TerrainScale: number;
    TerrainHeight: number;
    TerrainMask: number;
    TerrainDebug: number;
    // Brush
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
    brushPressed: number;
    posTemp: vec2;
    flattenTargetHeight: number;
    slopeStartPos: vec2;
    slopeEndPos: vec2;
    slopeActive: number;
    sourceCount: number;
    // Erosion / flow
    Kc: number;
    Ks: number;
    Kd: number;
    timestep: number;
    pipelen: number;
    pipeAra: number;
    ErosionMode: number;
    RainErosion: boolean;
    RainErosionStrength: number;
    RainErosionDropSize: number;
    EvaporationConstant: number;
    VelocityMultiplier: number;
    VelocityAdvectionMag: number;
    AdvectionMethod: number;
    RainDegree: number;
    AdvectionSpeedScaling: number;
    // Terrain generator (GPU)
    terrainFrequency: number;
    terrainAmplitude: number;
    terrainOctaves: number;
    terrainLacunarity: number;
    terrainPersistence: number;
    terrainSeed: number;
    terrainOffsetX: number;
    terrainOffsetY: number;
    terrainRidgeOffset: number;
    terrainRidgeGain: number;
    terrainTerraceCount: number;
    terrainDomainWarpStrength: number;
    craterDensity: number;
    canyonDepth: number;
    heightmapAmplitude: number;
    heightmapInvert: boolean;
    // Visual
    WaterTransparency: number;
    SedimentTrace: boolean;
    ShowFlowTrace: boolean;
    TerrainPlatte: number;
    SnowRange: number;
    ForestRange: number;
    // Terrain layer controls (normalised height 0-1)
    GrassLine: number;
    RockLine: number;
    SnowLine: number;
    SlopeRockAmount: number;
    lightPosX: number;
    lightPosY: number;
    lightPosZ: number;
    rockErosionResistance: number;
    basaltErosionResistance: number;
    thermalTalusAngleScale: number;
    thermalRate: number;
    thermalErosionScale: number;
    raycastMethod: 'heightmap' | 'bvh';
    'Reset Erosion Parameters'?: () => void;
    // Lava simulation
    lavaViscosityScale: number;
    lavaYieldStress: number;
    lavaCoolingRate: number;
    lavaProportionalCooling: number;
    lavaSolidificationThreshold: number;
    lavaRockFraction: number;
    lavaThermalErosionRate: number;
    lavaHeatScale: number;
    lavaWaterInteraction: boolean;
    lavaHeatRadius: number;
    lavaEmissionTemp: number;
    lavaCrustStrength: number;
    lavaCrustGrowthRate: number;
    lavaRockMeltThreshold: number;
    lavaSourceCount: number;
    // Lava visual
    lavaOrangeTemp: number;
    lavaYellowTemp: number;
    lavaEmissiveStrength: number;
    // Lava overhaul: new parameters
    lavaSofteningTemp: number;
    lavaKCond: number;
    lavaCrustMixSuppression: number;
    lavaAmbientCoolingRate: number;
    lavaViscTempScale: number;
    lavaMaxErosionPerStep: number;
    lavaErosionSpeedClamp: number;
    // Lava channeling mechanics
    lavaFlowStrength: number;
    lavaFlowIterations: number;
    lavaDepthBoost: number;
    lavaMomentum: number;
    lavaNoiseResist: number;
    // Lava layer system (solidification chain)
    lavaCoolificationRate: number;
    lavaBasaltificationRate: number;
    lavaReMeltRate: number;
    lavaBasaltMeltRate: number;
    lavaNoiseModulation: number;
}
