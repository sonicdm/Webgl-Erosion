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

export function setupGUI(controls: Controls): { gui: DAT.GUI, controllers: GUIControllers } {
    const gui = new DAT.GUI();
    
    // Simulation Controls
    var simcontrols = gui.addFolder('Simulation Controls');
    simcontrols.add(controls, 'Pause/Resume');
    simcontrols.add(controls, 'SimulationSpeed', { fast: 3, medium: 2, slow: 1 });
    simcontrols.open();
    
    // Terrain Parameters
    var terrainParameters = gui.addFolder('Terrain Parameters');
    const simulationResolutionController = terrainParameters.add(controls, 'SimulationResolution', { 256: 256, 512: 512, 1024: 1024, 2048: 2048, 4096: 4096 });
    terrainParameters.add(controls, 'TerrainScale', 0.1, 4.0);
    terrainParameters.add(controls, 'TerrainHeight', 1.0, 5.0);
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
    var advancedGenParams = terrainParameters.addFolder('Advanced Generator');

    // Noise parameters — store controller references for programmatic updates
    const advancedControllers: DAT.GUIController[] = [];
    advancedControllers.push(advancedGenParams.add(controls, 'terrainFrequency', 0.1, 4.0).name('Frequency'));
    advancedControllers.push(advancedGenParams.add(controls, 'terrainAmplitude', 0.1, 2.0).name('Amplitude'));
    advancedControllers.push(advancedGenParams.add(controls, 'terrainOctaves', 1, 12).step(1).name('Octaves'));
    advancedControllers.push(advancedGenParams.add(controls, 'terrainLacunarity', 1.5, 3.0).name('Lacunarity'));
    advancedControllers.push(advancedGenParams.add(controls, 'terrainPersistence', 0.3, 0.7).name('Persistence'));

    // Seed and offset
    advancedGenParams.add(controls, 'terrainSeed', 0, 1000).name('Seed');
    advancedGenParams.add(controls, 'terrainOffsetX', -100, 100).name('Offset X');
    advancedGenParams.add(controls, 'terrainOffsetY', -100, 100).name('Offset Y');

    // Generator-specific parameters
    var genSpecificParams = advancedGenParams.addFolder('Generator Specific');
    advancedControllers.push(genSpecificParams.add(controls, 'terrainRidgeOffset', 0.5, 2.0).name('Ridge Offset'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainRidgeGain', 1.0, 4.0).name('Ridge Gain'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainTerraceCount', 4, 20).step(1).name('Terrace Count'));
    advancedControllers.push(genSpecificParams.add(controls, 'terrainDomainWarpStrength', 0.5, 3.0).name('Domain Warp'));
    advancedControllers.push(genSpecificParams.add(controls, 'craterDensity', 0.5, 2.0).name('Crater Density'));
    advancedControllers.push(genSpecificParams.add(controls, 'canyonDepth', 0.3, 1.0).name('Canyon Depth'));

    // Heightmap parameters (for imported heightmaps)
    var heightmapParams = advancedGenParams.addFolder('Heightmap');
    heightmapParams.add(controls, 'heightmapAmplitude', 0.1, 2.0).name('Amplitude');
    heightmapParams.add(controls, 'heightmapInvert').name('Invert');

    advancedGenParams.close(); // Closed by default to reduce clutter

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
    
    // Erosion Parameters
    var erosionpara = gui.addFolder('Erosion Parameters');
    var RainErosionPara = erosionpara.addFolder('Rain Erosion Parameters');
    const rainErosionController = RainErosionPara.add(controls, 'RainErosion');
    const rainErosionStrengthController = RainErosionPara.add(controls, 'RainErosionStrength', 0.1, 3.0);
    const rainErosionDropSizeController = RainErosionPara.add(controls, 'RainErosionDropSize', 0.1, 3.0);
    RainErosionPara.close();
    const erosionModeController = erosionpara.add(controls, 'ErosionMode', { RiverMode: 0, MountainMode: 1, PolygonalMode: 2 });
    const velocityAdvectionController = erosionpara.add(controls, 'VelocityAdvectionMag', 0.0, 0.5);
    const evaporationController = erosionpara.add(controls, 'EvaporationConstant', 0.0001, 0.08);
    const kcController = erosionpara.add(controls, 'Kc', 0.01, 0.5);
    const ksController = erosionpara.add(controls, 'Ks', 0.001, 0.2);
    const kdController = erosionpara.add(controls, 'Kd', 0.0001, 0.1);
    erosionpara.add(controls, 'TerrainDebug', { noDebugView: 0, sediment: 1, velocity: 2, velocityHeatmap: 9, terrain: 3, flux: 4, terrainflux: 5, maxslippage: 6, flowMap: 7, spikeDiffusion: 8, rockMaterial: 10, lavaHeight: 11, lavaTemperature: 12, lavaVelocity: 13, lavaVolume: 14, lavaLayering: 15, waterLavaContact: 16, lavaCrust: 17, lavaDeltaH: 18, thermalErosionRate: 19 });
    const advectionMethodController = erosionpara.add(controls, 'AdvectionMethod', { Semilagrangian: 0, MacCormack: 1 });
    const velocityMultiplierController = erosionpara.add(controls, 'VelocityMultiplier', 1.0, 5.0);
    erosionpara.add(controls, 'AdvectionSpeedScaling', 0.1, 3.0);
    erosionpara.add(controls, 'RainDegree', 0.5, 10.0);
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
    
    // Thermal Erosion Parameters
    var thermalerosionpara = gui.addFolder("Thermal Erosion Parameters");
    thermalerosionpara.add(controls, 'thermalTalusAngleScale', 1.0, 10.0);
    thermalerosionpara.add(controls, 'thermalRate', 0.0, 2.0);
    thermalerosionpara.add(controls, 'thermalErosionScale', 0.0, 5.0);
    
    // Terrain Editor
    var terraineditor = gui.addFolder('Terrain Editor');
    terraineditor.add(controls, 'raycastMethod', { Heightmap: 'heightmap', BVH: 'bvh' }).onChange((value: string) => {
        console.log('[Raycast] Method changed to:', value);
        // Save to settings
        const config = loadSettings();
        config.raycast.method = value as 'heightmap' | 'bvh';
        saveSettings(config);
    });
    const brushTypeController = terraineditor.add(controls, 'brushType', { NoBrush: 0, TerrainBrush: 1, WaterBrush: 2, RockBrush: 3, SmoothBrush: 4, FlattenBrush: 5, SlopeBrush: 6, LavaBrush: 7 });
    brushTypeController.onChange((value: number) => {
        // Reset slope state when switching brush types
        if (value !== 6) {
            controls.slopeActive = 0;
        }
        // Update brush palette to reflect change
        if ((window as any).brushPalette) {
            updatePaletteSelection((window as any).brushPalette, controls);
        }
    });
    const flattenTargetHeightController = terraineditor.add(controls, 'flattenTargetHeight', 0.0, 500.0);
    terraineditor.add(controls, 'rockErosionResistance', 0.0, 1.0);
    const brushSizeController = terraineditor.add(controls, 'brushSize', 0.1, 20.0);
    const brushStrengthController = terraineditor.add(controls, 'brushStrenth', 0.1, 2.0);
    const brushOperationController = terraineditor.add(controls, 'brushOperation', { Add: 0, Subtract: 1 });
    terraineditor.open();
    
    // Initialize brush palette UI (floating palette for quick brush selection)
    const brushPalette = initBrushPalette(
        controls,
        (brushType: number) => {
            controls.brushType = brushType;
            // Reset slope state when switching brush types
            if (brushType !== 6) {
                controls.slopeActive = 0;
            }
            // Update dat-gui to reflect the change
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
    (window as any).brushPalette = brushPalette; // Store reference for updates
    
    // Store brushSize controller reference for updating UI when changed via Ctrl+Scroll
    (window as any).brushSizeController = brushSizeController;
    
    // Store flattenTargetHeight controller reference for updating UI when set via Alt+click
    (window as any).flattenTargetHeightController = flattenTargetHeightController;
    
    // Update palette when controls change from dat-gui
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
    
    // Lava Parameters
    var lavapara = gui.addFolder('Lava Parameters');
    lavapara.add(controls, 'lavaViscosityScale', 0.1, 10.0).name('Viscosity Scale');
    lavapara.add(controls, 'lavaYieldStress', 0.0, 2.0).name('Yield Stress');
    lavapara.add(controls, 'lavaCoolingRate', 0.00001, 0.01).name('Cooling Rate');
    lavapara.add(controls, 'lavaProportionalCooling', 0.0, 0.01).name('Proportional Cooling');
    lavapara.add(controls, 'lavaSolidificationThreshold', 0.05, 0.5).name('Solidification Temp');
    lavapara.add(controls, 'lavaRockFraction', 0.0, 1.0).name('Rock Fraction');
    lavapara.add(controls, 'lavaThermalErosionRate', 0.1, 2.0).name('Thermal Erosion');
    lavapara.add(controls, 'lavaRockMeltThreshold', 0.3, 0.9).name('Rock Melt Temp');
    lavapara.add(controls, 'lavaHeatScale', 0.1, 5.0).name('Heat Scale');
    lavapara.add(controls, 'lavaWaterInteraction').name('Water Interaction');
    lavapara.add(controls, 'lavaHeatRadius', 1, 4).step(1).name('Heat Radius');
    lavapara.add(controls, 'lavaEmissionTemp', 0.5, 1.0).name('Emission Temp');
    lavapara.add(controls, 'lavaCrustStrength', 0.1, 2.0).name('Crust Strength');
    lavapara.add(controls, 'lavaCrustGrowthRate', 0.01, 0.5).name('Crust Growth');
    lavapara.add(controls, 'lavaSofteningTemp', 0.3, 0.9).name('Softening Temp');
    lavapara.add(controls, 'lavaKCond', 0.01, 1.0).name('Conductivity');
    lavapara.add(controls, 'lavaCrustMixSuppression', 0.0, 5.0).name('Crust Mix Suppress');
    lavapara.add(controls, 'lavaAmbientCoolingRate', 0.0, 0.01).name('Ambient Cooling');
    lavapara.add(controls, 'lavaViscTempScale', 1.0, 10.0).name('Visc Temp Scale');
    lavapara.add(controls, 'lavaMaxErosionPerStep', 0.0001, 0.01).name('Max Erosion/Step');
    lavapara.add(controls, 'lavaErosionSpeedClamp', 1.0, 20.0).name('Erosion Speed Clamp');
    // Dev: Lava test preset — tuned for paper-grounded flow behavior
    // Cooling rates calibrated for 180 steps/sec (SimSpeed=3 × 60fps)
    lavapara.add({
        applyLavaTestPreset: () => {
            controls.lavaViscosityScale = 5.0;
            controls.lavaYieldStress = 0.2;
            controls.lavaCoolingRate = 0.00005;
            controls.lavaProportionalCooling = 0.00005;
            controls.lavaSolidificationThreshold = 0.20;
            controls.lavaRockFraction = 0.7;
            controls.lavaThermalErosionRate = 0.3;
            controls.lavaRockMeltThreshold = 0.7;
            controls.lavaEmissionTemp = 1.0;
            controls.lavaCrustStrength = 0.3;
            controls.lavaCrustGrowthRate = 0.01;
            controls.lavaSofteningTemp = 0.6;
            controls.lavaKCond = 0.3;
            controls.lavaCrustMixSuppression = 2.0;
            controls.lavaAmbientCoolingRate = 0.00003;
            controls.lavaViscTempScale = 4.0;
            controls.lavaMaxErosionPerStep = 0.002;
            controls.lavaErosionSpeedClamp = 5.0;
            controls.lavaWaterInteraction = true;
            controls.lavaHeatRadius = 2;
            // Refresh GUI to show updated values
            gui.controllersRecursive().forEach((c: any) => c.updateDisplay?.());
            console.log('[LAVA_SIM] Applied lava test preset (paper-grounded defaults)');
        }
    }, 'applyLavaTestPreset').name('Apply Test Preset');
    lavapara.close();

    // Rendering Parameters
    var renderingpara = gui.addFolder('Rendering Parameters');
    renderingpara.add(controls, 'WaterTransparency', 0.0, 1.0);
    renderingpara.add(controls, 'TerrainPlatte', { AlpineMtn: 0, Desert: 1, Jungle: 2 });
    renderingpara.add(controls, 'SnowRange', 0.0, 100.0);
    renderingpara.add(controls, 'ForestRange', 0.0, 50.0);
    renderingpara.add(controls, 'ShowFlowTrace');
    renderingpara.add(controls, 'SedimentTrace');
    var terrainLayers = renderingpara.addFolder('Terrain Layers');
    terrainLayers.add(controls, 'GrassLine', 0.0, 0.5).step(0.01).name('Grass Line');
    terrainLayers.add(controls, 'RockLine', 0.2, 0.9).step(0.01).name('Rock Line');
    terrainLayers.add(controls, 'SnowLine', 0.3, 1.0).step(0.01).name('Snow Line');
    terrainLayers.add(controls, 'SlopeRockAmount', 0.0, 3.0).step(0.1).name('Slope Rock');
    var renderingparalightpos = renderingpara.addFolder('sunPos/Dir');
    renderingparalightpos.add(controls, 'lightPosX', -1.0, 1.0);
    renderingparalightpos.add(controls, 'lightPosY', 0.0, 1.0);
    renderingparalightpos.add(controls, 'lightPosZ', -1.0, 1.0);
    renderingparalightpos.open();
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
