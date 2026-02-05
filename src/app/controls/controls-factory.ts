import { vec2 } from 'gl-matrix';
import { AppContext } from '../context';
import { IAppControls, ControlsActions } from './types';

/**
 * Builds a single controls object with defaults from context and stable action refs.
 * Call this once before setupGUI(controls); do not reassign actions after GUI binds.
 */
export function createControls(ctx: AppContext, actions: ControlsActions): IAppControls {
    const simres = ctx.simulationState.simres;
    const config = ctx.configHolder;

    const controls: IAppControls = {
        // Simulation resolution from holder; other defaults from config or literals
        SimulationResolution: simres,
        SimulationSpeed: 3,
        'Load Scene': actions.loadScene,
        'Pause/Resume': actions.pauseResume,
        'Generate Terrain': actions.generateTerrain,
        'setTerrainRandom': actions.setTerrainRandom,
        'Import Height Map': actions.importHeightMap,
        'Clear Height Map': actions.clearHeightMap,
        'Export Height Map': actions.exportHeightMap,

        pipelen: 0.8,
        Kc: 0.04,
        Ks: 0.02,
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
        posTemp: vec2.fromValues(0.0, 0.0),

        TerrainBaseType: 0,
        TerrainScale: 3.2,
        TerrainHeight: 2.0,
        TerrainMask: 0,
        TerrainDebug: 0,

        terrainFrequency: 1.0,
        terrainAmplitude: 1.0,
        terrainOctaves: 8,
        terrainLacunarity: 2.0,
        terrainPersistence: 0.5,
        terrainSeed: 0,
        terrainOffsetX: 0,
        terrainOffsetY: 0,
        terrainRidgeOffset: 1.0,
        terrainRidgeGain: 2.0,
        terrainTerraceCount: 8,
        terrainDomainWarpStrength: 1.0,
        craterDensity: 1.0,
        canyonDepth: 0.6,
        heightmapAmplitude: 1.0,
        heightmapInvert: false,

        WaterTransparency: 0.50,
        SedimentTrace: true,
        ShowFlowTrace: false,
        TerrainPlatte: 1,
        GrassLine: 0.10,
        RockLine: 0.50,
        SnowLine: 0.70,
        SlopeRockAmount: 1.0,

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
        basaltErosionResistance: 0.4,
        thermalTalusAngleScale: 8.0,
        thermalRate: 0.5,
        thermalErosionScale: 1.0,

        lightPosX: 0.4,
        lightPosY: 0.8,
        lightPosZ: -0.0,
        AdvectionMethod: 1,
        VelocityAdvectionMag: 0.2,

        // Lava simulation (speeds relative to water equivalents)
        lavaViscosityScale: 5.0,
        lavaYieldStress: 0.1,
        lavaCoolingRate: 0.002,
        lavaProportionalCooling: 0.0004,
        lavaSolidificationThreshold: 240,
        lavaRockFraction: 0.7,
        lavaThermalErosionRate: 0.05,
        lavaHeatScale: 2.0,
        lavaWaterInteraction: true,
        lavaHeatRadius: 2,
        lavaEmissionTemp: 1200,
        lavaCrustStrength: 0.4,
        lavaCrustGrowthRate: 0.005,
        lavaRockMeltThreshold: 840,
        lavaSourceCount: 0,
        // Lava overhaul: new parameters
        lavaSofteningTemp: 720,
        lavaKCond: 0.3,
        lavaCrustMixSuppression: 2.0,
        lavaAmbientCoolingRate: 0.0004,
        lavaViscTempScale: 4.0,
        lavaMaxErosionPerStep: 0.0003,
        lavaErosionSpeedClamp: 3.0,
        lavaOrangeTemp: 540,
        lavaYellowTemp: 780,
        lavaEmissiveStrength: 1.5,
        // Lava channeling mechanics
        lavaFlowStrength: 0.3,
        lavaFlowIterations: 16,
        lavaDepthBoost: 20.0,
        lavaMomentum: 0.7,
        lavaNoiseResist: 3.0,
        // Lava layer system
        lavaCoolificationRate: 0.01,
        lavaBasaltificationRate: 0.01,
        lavaReMeltRate: 0.05,
        lavaBasaltMeltRate: 0.005,
        lavaNoiseModulation: 0.5
    };

    if (actions.resetErosionParameters) {
        controls['Reset Erosion Parameters'] = () => actions.resetErosionParameters!(controls);
    }

    return controls;
}
