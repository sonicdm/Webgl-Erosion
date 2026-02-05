import * as DAT from 'dat-gui';
import { updatePaletteSelection, initBrushPalette } from '../brush-palette';
import { loadSettings, saveSettings } from '../settings';
import { generatorRegistry } from '../terrain/TerrainGenerator';

export interface Controls {
    [key: string]: any;
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
    slopeActive: number;
}

export interface GUIControllers {
    brushTypeController: DAT.GUIController;
    brushSizeController: DAT.GUIController;
    brushStrengthController: DAT.GUIController;
    brushOperationController: DAT.GUIController;
    flattenTargetHeightController: DAT.GUIController;
    terrainBaseTypeController: DAT.GUIController;
    simulationResolutionController: DAT.GUIController;
}

/**
 * Sets a native browser tooltip on a dat-gui controller row.
 * Hover over the controller label to see the hint text.
 */
function tip(controller: DAT.GUIController, text: string): DAT.GUIController {
    const li = controller.domElement?.parentElement?.parentElement;
    if (li) { li.title = text; }
    return controller;
}

export function setupGUI(controls: Controls): { gui: DAT.GUI, controllers: GUIControllers } {
    const gui = new DAT.GUI();

    // ── Simulation Controls ─────────────────────────────────────────────
    const simcontrols = gui.addFolder('Simulation Controls');
    simcontrols.add(controls, 'Pause/Resume');
    tip(simcontrols.add(controls, 'SimulationSpeed', { fast: 3, medium: 2, slow: 1 }),
        'Number of simulation steps per frame');
    simcontrols.open();

    // ── Terrain Generation ──────────────────────────────────────────────
    const terrainParameters = gui.addFolder('Terrain Generation');
    const simulationResolutionController = terrainParameters.add(controls, 'SimulationResolution', { 256: 256, 512: 512, 1024: 1024, 2048: 2048, 4096: 4096 });
    tip(simulationResolutionController, 'Heightmap and simulation grid resolution (rebuilds textures)');
    tip(terrainParameters.add(controls, 'TerrainScale', 0.1, 4.0), 'XZ scale of the terrain mesh');
    tip(terrainParameters.add(controls, 'TerrainHeight', 1.0, 5.0), 'Vertical exaggeration of heightmap displacement');
    terrainParameters.add(controls, 'TerrainMask', {
        OFF: 0,
        Sphere: 1,
        Slope: 2,
        Square: 3,
        Ring: 4,
        RadialGradient: 5,
        Corner: 6,
        Diagonal: 7,
        Cross: 8,
        Craters: 10,
        Dunes: 11
    });
    const terrainBaseTypeController = terrainParameters.add(controls, 'TerrainBaseType', {
        // Procedural generators
        ordinaryFBM: 0,
        domainWarp: 1,
        terrace: 2,
        voroni: 3,
        ridgeNoise: 4,
        billowNoise: 5,
        turbulence: 6,
        craters: 7,
        dunes: 8,
        canyons: 9,
        mountains: 10,
        billowyRidges: 11,
        // THREE.Terrain ports
        perlin: 12,
        simplex: 13,
        diamondSquare: 14,
        fault: 15,
        hill: 16,
        hillIsland: 17,
        particles: 18,
        value: 19,
        cosine: 20,
        weierstrass: 21,
        perlinLayers: 22,
        simplexLayers: 23,
        perlinDiamond: 24,
        cosineLayers: 25,
        // Imported heightmap (uses cached data)
        importedHeightmap: 100
    });
    terrainParameters.add(controls, 'Generate Terrain');
    terrainParameters.add(controls, 'Import Height Map');
    terrainParameters.add(controls, 'Clear Height Map');
    terrainParameters.add(controls, 'Export Height Map');

    // Advanced Generator Parameters subfolder
    const advancedGenParams = terrainParameters.addFolder('Advanced Generator');

    // Noise parameters — store controller references for programmatic updates
    const advancedControllers: DAT.GUIController[] = [];
    advancedControllers.push(tip(advancedGenParams.add(controls, 'terrainFrequency', 0.1, 4.0).name('Frequency'),
        'Base frequency of the noise function'));
    advancedControllers.push(tip(advancedGenParams.add(controls, 'terrainAmplitude', 0.1, 2.0).name('Amplitude'),
        'Height multiplier for the noise output'));
    advancedControllers.push(tip(advancedGenParams.add(controls, 'terrainOctaves', 1, 12).step(1).name('Octaves'),
        'Number of noise layers summed together'));
    advancedControllers.push(tip(advancedGenParams.add(controls, 'terrainLacunarity', 1.5, 3.0).name('Lacunarity'),
        'Frequency multiplier between octaves'));
    advancedControllers.push(tip(advancedGenParams.add(controls, 'terrainPersistence', 0.3, 0.7).name('Persistence'),
        'Amplitude decay between octaves'));

    // Seed and offset
    advancedGenParams.add(controls, 'terrainSeed', 0, 1000).name('Seed');
    advancedGenParams.add(controls, 'terrainOffsetX', -100, 100).name('Offset X');
    advancedGenParams.add(controls, 'terrainOffsetY', -100, 100).name('Offset Y');

    // Generator-specific parameters
    const genSpecificParams = advancedGenParams.addFolder('Generator Specific');
    advancedControllers.push(genSpecificParams.add(controls, 'terrainRidgeOffset', 0.5, 2.0).name('Ridge Offset'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainRidgeGain', 1.0, 4.0).name('Ridge Gain'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainTerraceCount', 4, 20).step(1).name('Terrace Count'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainDomainWarpStrength', 0.5, 3.0).name('Domain Warp'));
    advancedControllers.push(genSpecificParams.add(controls, 'craterDensity', 0.5, 2.0).name('Crater Density'));
    advancedControllers.push(genSpecificParams.add(controls, 'canyonDepth', 0.3, 1.0).name('Canyon Depth'));

    // Heightmap parameters (for imported heightmaps)
    const heightmapParams = advancedGenParams.addFolder('Heightmap');
    heightmapParams.add(controls, 'heightmapAmplitude', 0.1, 2.0).name('Amplitude');
    heightmapParams.add(controls, 'heightmapInvert').name('Invert');

    advancedGenParams.close();

    // Apply per-generator defaults when terrain type changes
    terrainBaseTypeController.onChange((value: number) => {
        const generator = generatorRegistry.getByGPUTypeId(Number(value));
        if (generator) {
            const typeDefaults = generator.getGPUControlDefaults();
            for (const [key, val] of Object.entries(typeDefaults)) {
                (controls as any)[key] = val;
            }
            advancedControllers.forEach(c => c.updateDisplay());
        }
    });

    terrainParameters.open();

    // ── Water Erosion ───────────────────────────────────────────────────
    const erosionpara = gui.addFolder('Water Erosion');

    const erosionModeController = tip(
        erosionpara.add(controls, 'ErosionMode', { RiverMode: 0, MountainMode: 1, PolygonalMode: 2 }),
        'River: deep channels. Mountain: broad slopes. Polygonal: fractured pattern');
    const kcController = tip(erosionpara.add(controls, 'Kc', 0.01, 0.5).name('Capacity (Kc)'),
        'Sediment carrying capacity — higher = more sediment transported');
    const ksController = tip(erosionpara.add(controls, 'Ks', 0.001, 0.2).name('Dissolving (Ks)'),
        'Rate terrain dissolves into sediment when flow exceeds capacity');
    const kdController = tip(erosionpara.add(controls, 'Kd', 0.0001, 0.1).name('Deposition (Kd)'),
        'Rate sediment deposits back when flow drops below capacity');
    const evaporationController = tip(erosionpara.add(controls, 'EvaporationConstant', 0.0001, 0.08).name('Evaporation'),
        'Water lost per step — higher = faster drying, shorter rivers');
    const velocityAdvectionController = tip(erosionpara.add(controls, 'VelocityAdvectionMag', 0.0, 0.5).name('Vel. Advection'),
        'Strength of velocity field advection (momentum transfer)');
    const velocityMultiplierController = tip(erosionpara.add(controls, 'VelocityMultiplier', 1.0, 5.0).name('Vel. Multiplier'),
        'Global velocity scale factor');
    const advectionMethodController = tip(
        erosionpara.add(controls, 'AdvectionMethod', { Semilagrangian: 0, MacCormack: 1 }),
        'Semilagrangian: stable, diffusive. MacCormack: sharper, may overshoot');
    tip(erosionpara.add(controls, 'AdvectionSpeedScaling', 0.1, 3.0).name('Advection Speed'),
        'Scales advection step size');
    tip(erosionpara.add(controls, 'RainDegree', 0.5, 10.0).name('Rain Degree'),
        'Rainfall intensity — higher = more water added per step');

    // Rain erosion subfolder
    const RainErosionPara = erosionpara.addFolder('Rain Erosion');
    const rainErosionController = tip(RainErosionPara.add(controls, 'RainErosion').name('Enabled'),
        'Enable particle-based rain erosion (complements pipe-model flow)');
    const rainErosionStrengthController = RainErosionPara.add(controls, 'RainErosionStrength', 0.1, 3.0).name('Strength');
    const rainErosionDropSizeController = RainErosionPara.add(controls, 'RainErosionDropSize', 0.1, 3.0).name('Drop Size');
    RainErosionPara.close();

    // Erosion resistance subfolder
    const resistancePara = erosionpara.addFolder('Erosion Resistance');
    tip(resistancePara.add(controls, 'rockErosionResistance', 0.0, 1.0).name('Rock'),
        'How much rock resists water erosion (1.0 = impervious)');
    tip(resistancePara.add(controls, 'basaltErosionResistance', 0.0, 1.0).name('Basalt'),
        'How much basalt resists water erosion (porous — typically lower than rock)');

    erosionpara.add(controls, 'Reset Erosion Parameters');
    erosionpara.open();

    // Store controller references for reset function
    (window as any).erosionControllers = {
        kcController,
        ksController,
        kdController,
        erosionModeController,
        evaporationController,
        velocityMultiplierController,
        velocityAdvectionController,
        advectionMethodController,
        rainErosionController,
        rainErosionStrengthController,
        rainErosionDropSizeController
    };

    // ── Thermal Erosion (subfolder of erosion concern) ──────────────────
    const thermalerosionpara = erosionpara.addFolder('Thermal Erosion');
    tip(thermalerosionpara.add(controls, 'thermalTalusAngleScale', 1.0, 10.0).name('Talus Angle'),
        'Angle of repose — higher = steeper stable slopes');
    tip(thermalerosionpara.add(controls, 'thermalRate', 0.0, 2.0).name('Rate'),
        'Speed of material slumping down slopes');
    tip(thermalerosionpara.add(controls, 'thermalErosionScale', 0.0, 5.0).name('Erosion Scale'),
        'Global multiplier for thermal erosion amount');

    // ── Terrain Editor (Brushes) ────────────────────────────────────────
    const terraineditor = gui.addFolder('Terrain Editor');
    terraineditor.add(controls, 'raycastMethod', { Heightmap: 'heightmap', BVH: 'bvh' }).onChange((value: string) => {
        console.log('[Raycast] Method changed to:', value);
        const config = loadSettings();
        config.raycast.method = value as 'heightmap' | 'bvh';
        saveSettings(config);
    });
    const brushTypeController = terraineditor.add(controls, 'brushType', { NoBrush: 0, TerrainBrush: 1, WaterBrush: 2, RockBrush: 3, SmoothBrush: 4, FlattenBrush: 5, SlopeBrush: 6, LavaBrush: 7 });
    brushTypeController.onChange((value: number) => {
        if (value !== 6) {
            controls.slopeActive = 0;
        }
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    const flattenTargetHeightController = tip(
        terraineditor.add(controls, 'flattenTargetHeight', 0.0, 500.0).name('Flatten Height'),
        'Target height for the flatten brush (Alt+click to sample)');
    const brushSizeController = terraineditor.add(controls, 'brushSize', 0.1, 20.0);
    const brushStrengthController = terraineditor.add(controls, 'brushStrenth', 0.1, 2.0).name('Brush Strength');
    const brushOperationController = terraineditor.add(controls, 'brushOperation', { Add: 0, Subtract: 1 });
    terraineditor.open();

    // Initialize brush palette UI (floating palette for quick brush selection)
    const brushPalette = initBrushPalette(
        controls,
        (brushType: number) => {
            controls.brushType = brushType;
            if (brushType !== 6) {
                controls.slopeActive = 0;
            }
            brushTypeController.updateDisplay();
        },
        (size: number) => {
            controls.brushSize = size;
            brushSizeController.updateDisplay();
        },
        (strength: number) => {
            controls.brushStrenth = strength;
        },
        (operation: number) => {
            controls.brushOperation = operation;
            brushOperationController.updateDisplay();
        }
    );
    (window as any).brushPalette = brushPalette;

    // Store controller references for programmatic updates
    (window as any).brushSizeController = brushSizeController;
    (window as any).flattenTargetHeightController = flattenTargetHeightController;

    // Sync brush palette when dat-gui controls change
    brushTypeController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushSizeController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushStrengthController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    brushOperationController.onChange(() => {
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });

    // ── Lava Parameters ─────────────────────────────────────────────────
    const lavapara = gui.addFolder('Lava Parameters');

    // Flow
    const lavaFlow = lavapara.addFolder('Flow');
    tip(lavaFlow.add(controls, 'lavaViscosityScale', 0.1, 10.0).name('Viscosity'),
        'Base viscosity of molten lava — higher = slower flow');
    tip(lavaFlow.add(controls, 'lavaYieldStress', 0.0, 2.0).name('Yield Stress'),
        'Minimum force needed to move lava (Bingham fluid threshold)');
    tip(lavaFlow.add(controls, 'lavaViscTempScale', 1.0, 10.0).name('Visc-Temp Curve'),
        'How strongly temperature reduces viscosity');
    tip(lavaFlow.add(controls, 'lavaEmissionTemp', 600, 1200).step(10).name('Source °C'),
        'Temperature of freshly emitted lava');

    // Cooling
    const lavaCooling = lavapara.addFolder('Cooling');
    tip(lavaCooling.add(controls, 'lavaCoolingRate', 0.0001, 0.02).name('Surface Cooling'),
        'Heat loss rate from exposed lava surface');
    tip(lavaCooling.add(controls, 'lavaProportionalCooling', 0.0, 0.02).name('Thin-Edge Cooling'),
        'Extra cooling for thin lava films (edge solidification)');
    tip(lavaCooling.add(controls, 'lavaAmbientCoolingRate', 0.0, 0.02).name('Ambient Cooling'),
        'Background heat loss independent of surface area');
    tip(lavaCooling.add(controls, 'lavaSolidificationThreshold', 60, 600).step(10).name('Solidify °C'),
        'Temperature below which lava stops flowing');
    tip(lavaCooling.add(controls, 'lavaRockFraction', 0.0, 1.0).name('Rock Fraction'),
        'Fraction of solidified lava that becomes rock vs terrain');
    tip(lavaCooling.add(controls, 'lavaKCond', 0.01, 1.0).name('Conductivity'),
        'Thermal conductivity — how fast heat spreads between cells');

    // Crust
    const lavaCrustFolder = lavapara.addFolder('Crust');
    tip(lavaCrustFolder.add(controls, 'lavaCrustStrength', 0.1, 2.0).name('Barrier Strength'),
        'How much crust resists flow (insulating lid effect)');
    tip(lavaCrustFolder.add(controls, 'lavaCrustGrowthRate', 0.001, 0.1).name('Growth Rate'),
        'Speed of crust formation on cooling surface');
    tip(lavaCrustFolder.add(controls, 'lavaSofteningTemp', 360, 1080).step(10).name('Re-melt °C'),
        'Temperature above which crust weakens and re-melts');
    tip(lavaCrustFolder.add(controls, 'lavaCrustMixSuppression', 0.0, 5.0).name('Insulation'),
        'How much crust suppresses heat mixing with surroundings');

    // Lava erosion
    const lavaErosion = lavapara.addFolder('Erosion');
    tip(lavaErosion.add(controls, 'lavaThermalErosionRate', 0.01, 1.0).name('Erosion Rate'),
        'How fast hot lava melts underlying terrain');
    tip(lavaErosion.add(controls, 'lavaMaxErosionPerStep', 0.0001, 0.01).name('Max Per Step'),
        'Upper bound on terrain removed per simulation step');
    tip(lavaErosion.add(controls, 'lavaErosionSpeedClamp', 1.0, 20.0).name('Speed Clamp'),
        'Cap on flow speed contribution to erosion');
    tip(lavaErosion.add(controls, 'lavaRockMeltThreshold', 360, 1080).step(10).name('Rock Melt °C'),
        'Minimum temperature to erode rock substrate');

    // Color ramp
    const lavaColor = lavapara.addFolder('Color Ramp');
    tip(lavaColor.add(controls, 'lavaOrangeTemp', 240, 840).step(10).name('Orange °C'),
        'Temperature at which lava transitions from dark red to orange');
    tip(lavaColor.add(controls, 'lavaYellowTemp', 480, 1080).step(10).name('Yellow °C'),
        'Temperature at which lava transitions from orange to bright yellow');
    tip(lavaColor.add(controls, 'lavaEmissiveStrength', 0.0, 4.0).step(0.1).name('Emissive Glow'),
        'Intensity of the self-illumination glow on hot lava');

    // Channeling
    const lavaChannel = lavapara.addFolder('Channeling');
    tip(lavaChannel.add(controls, 'lavaFlowStrength', 0.01, 1.0).step(0.01).name('Flow Strength'),
        'Strength of downhill channeling bias');
    tip(lavaChannel.add(controls, 'lavaFlowIterations', 1, 32).step(1).name('Flow Iterations'),
        'Jacobi iterations for channel pressure solve');
    tip(lavaChannel.add(controls, 'lavaDepthBoost', 0.0, 40.0).name('Depth Boost'),
        'Extra weight given to deeper channels');
    tip(lavaChannel.add(controls, 'lavaMomentum', 0.0, 0.95).name('Momentum'),
        'How much previous flow direction persists');
    tip(lavaChannel.add(controls, 'lavaNoiseResist', 1.0, 5.0).name('Noise Power'),
        'How strongly terrain noise breaks up uniform sheets');

    // Layer system (solidification)
    const lavaSolid = lavapara.addFolder('Solidification');
    tip(lavaSolid.add(controls, 'lavaCoolificationRate', 0.0, 0.1).name('Cooling Rate'),
        'Rate at which mobile lava converts to cool lava');
    tip(lavaSolid.add(controls, 'lavaBasaltificationRate', 0.0, 0.05).name('Basalt Rate'),
        'Rate at which cool lava solidifies into permanent basalt');
    tip(lavaSolid.add(controls, 'lavaReMeltRate', 0.0, 0.2).name('Re-Melt Rate'),
        'Rate at which hot lava re-melts adjacent cool lava');
    tip(lavaSolid.add(controls, 'lavaBasaltMeltRate', 0.0, 0.02).name('Basalt Melt'),
        'Rate at which very hot lava can re-melt basalt');
    tip(lavaSolid.add(controls, 'lavaNoiseModulation', 0.0, 1.0).name('Noise Variation'),
        'Random variation in solidification rates for natural look');

    // Water interaction
    const lavaWater = lavapara.addFolder('Water');
    tip(lavaWater.add(controls, 'lavaWaterInteraction').name('Enabled'),
        'Enable steam/quenching when lava contacts water');
    tip(lavaWater.add(controls, 'lavaHeatRadius', 1, 4).step(1).name('Heat Radius'),
        'How far lava heats surrounding water (in cells)');
    tip(lavaWater.add(controls, 'lavaHeatScale', 0.1, 5.0).name('Heat Scale'),
        'Multiplier for heat transfer to water');

    // Reset preset
    lavapara.add({
        applyLavaTestPreset: () => {
            controls.lavaViscosityScale = 5.0;
            controls.lavaYieldStress = 0.2;
            controls.lavaCoolingRate = 0.002;
            controls.lavaProportionalCooling = 0.0004;
            controls.lavaSolidificationThreshold = 240;
            controls.lavaRockFraction = 0.7;
            controls.lavaThermalErosionRate = 0.05;
            controls.lavaRockMeltThreshold = 840;
            controls.lavaEmissionTemp = 1200;
            controls.lavaCrustStrength = 0.3;
            controls.lavaCrustGrowthRate = 0.005;
            controls.lavaSofteningTemp = 720;
            controls.lavaKCond = 0.3;
            controls.lavaCrustMixSuppression = 2.0;
            controls.lavaAmbientCoolingRate = 0.0004;
            controls.lavaViscTempScale = 4.0;
            controls.lavaMaxErosionPerStep = 0.0003;
            controls.lavaErosionSpeedClamp = 3.0;
            controls.lavaWaterInteraction = true;
            controls.lavaHeatRadius = 2;
            controls.lavaOrangeTemp = 540;
            controls.lavaYellowTemp = 780;
            controls.lavaEmissiveStrength = 1.5;
            controls.lavaFlowStrength = 0.3;
            controls.lavaFlowIterations = 16;
            controls.lavaDepthBoost = 20.0;
            controls.lavaMomentum = 0.7;
            controls.lavaNoiseResist = 3.0;
            controls.lavaCoolificationRate = 0.01;
            controls.lavaBasaltificationRate = 0.01;
            controls.lavaReMeltRate = 0.05;
            controls.lavaBasaltMeltRate = 0.005;
            controls.lavaNoiseModulation = 0.5;
            gui.controllersRecursive().forEach((c: any) => c.updateDisplay?.());
            console.log('[LAVA_SIM] Applied lava test preset');
        }
    }, 'applyLavaTestPreset').name('Reset Defaults');
    lavapara.close();

    // ── Rendering ───────────────────────────────────────────────────────
    const renderingpara = gui.addFolder('Rendering');
    tip(renderingpara.add(controls, 'WaterTransparency', 0.0, 1.0).name('Water Opacity'),
        'How opaque the water surface appears');
    renderingpara.add(controls, 'TerrainPlatte', { AlpineMtn: 0, Desert: 1, Jungle: 2 }).name('Color Palette');
    renderingpara.add(controls, 'ShowFlowTrace').name('Flow Trace');
    renderingpara.add(controls, 'SedimentTrace').name('Sediment Trace');

    // Terrain layers subfolder
    const terrainLayers = renderingpara.addFolder('Terrain Layers');
    tip(terrainLayers.add(controls, 'GrassLine', 0.0, 0.5).step(0.01).name('Grass Line'),
        'Normalized height where grass begins');
    tip(terrainLayers.add(controls, 'RockLine', 0.2, 0.9).step(0.01).name('Rock Line'),
        'Normalized height where rock begins');
    tip(terrainLayers.add(controls, 'SnowLine', 0.3, 1.0).step(0.01).name('Snow Line'),
        'Normalized height where snow begins');
    tip(terrainLayers.add(controls, 'SlopeRockAmount', 0.0, 3.0).step(0.1).name('Slope Rock'),
        'How much steep slopes force rock texture regardless of height');

    // Terrain detail subfolder
    const terrainDetail = renderingpara.addFolder('Terrain Detail');
    tip(terrainDetail.add(controls, 'terrainDetailIntensity', 0.0, 2.0).step(0.05).name('Detail Intensity'),
        'Strength of color variation from procedural micro-texture');
    tip(terrainDetail.add(controls, 'terrainDetailNormalStrength', 0.0, 2.0).step(0.05).name('Normal Strength'),
        'Strength of surface bump/normal perturbation from detail noise');
    tip(terrainDetail.add(controls, 'terrainDetailRoughnessVar', 0.0, 1.0).step(0.05).name('Roughness Var'),
        'Amount of roughness micro-variation across surface');
    tip(terrainDetail.add(controls, 'terrainDetailScale', 0.1, 4.0).step(0.1).name('Detail Scale'),
        'Frequency multiplier for detail noise (higher = finer grain)');
    terrainDetail.open();

    // Light direction subfolder
    const lightFolder = renderingpara.addFolder('Sun Direction');
    lightFolder.add(controls, 'lightPosX', -1.0, 1.0).name('X');
    lightFolder.add(controls, 'lightPosY', 0.0, 1.0).name('Y (height)');
    lightFolder.add(controls, 'lightPosZ', -1.0, 1.0).name('Z');
    lightFolder.open();

    // Debug views subfolder
    const debugFolder = renderingpara.addFolder('Debug Views');
    debugFolder.add(controls, 'TerrainDebug', {
        'Off': 0,
        // Water erosion
        'Sediment': 1,
        'Velocity': 2,
        'Velocity Heatmap': 9,
        'Terrain Height': 3,
        'Water Flux': 4,
        'Thermal Flux': 5,
        'Max Slippage': 6,
        'Flow Map': 7,
        'Spike Diffusion': 8,
        'Rock Material': 10,
        'Thermal Erosion Rate': 19,
        'Basalt Height': 20,
        // Lava
        'Lava Height': 11,
        'Lava Temperature': 12,
        'Lava Velocity': 13,
        'Lava Volume': 14,
        'Lava Layering': 15,
        'Water-Lava Contact': 16,
        'Lava Crust': 17,
        'Lava Delta-H': 18,
    }).name('Debug View');

    renderingpara.open();

    return {
        gui,
        controllers: {
            brushTypeController,
            brushSizeController,
            brushStrengthController,
            brushOperationController,
            flattenTargetHeightController,
            terrainBaseTypeController,
            simulationResolutionController
        }
    };
}
