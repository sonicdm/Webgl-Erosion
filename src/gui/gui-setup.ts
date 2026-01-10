import * as DAT from 'dat-gui';
import { updatePaletteSelection, initBrushPalette } from '../brush-palette';
import { loadSettings, saveSettings } from '../settings';

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
    terrainParameters.add(controls, 'SimulationResolution', { 256: 256, 512: 512, 1024: 1024, 2048: 2048, 4096: 4096 });
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
        Cross: 8 
    });
    terrainParameters.add(controls, 'TerrainBaseType', { ordinaryFBM: 0, domainWarp: 1, terrace: 2, voroni: 3, ridgeNoise: 4 });
    terrainParameters.add(controls, 'ResetTerrain');
    terrainParameters.add(controls, 'Import Height Map');
    terrainParameters.add(controls, 'Clear Height Map');
    terrainParameters.open();
    
    // Erosion Parameters
    var erosionpara = gui.addFolder('Erosion Parameters');
    var RainErosionPara = erosionpara.addFolder('Rain Erosion Parameters');
    RainErosionPara.add(controls, 'RainErosion');
    RainErosionPara.add(controls, 'RainErosionStrength', 0.1, 3.0);
    RainErosionPara.add(controls, 'RainErosionDropSize', 0.1, 3.0);
    RainErosionPara.close();
    erosionpara.add(controls, 'ErosionMode', { RiverMode: 0, MountainMode: 1, PolygonalMode: 2 });
    erosionpara.add(controls, 'VelocityAdvectionMag', 0.0, 0.5);
    erosionpara.add(controls, 'EvaporationConstant', 0.0001, 0.08);
    erosionpara.add(controls, 'Kc', 0.01, 0.5);
    erosionpara.add(controls, 'Ks', 0.001, 0.2);
    erosionpara.add(controls, 'Kd', 0.0001, 0.1);
    erosionpara.add(controls, 'TerrainDebug', { noDebugView: 0, sediment: 1, velocity: 2, velocityHeatmap: 9, terrain: 3, flux: 4, terrainflux: 5, maxslippage: 6, flowMap: 7, spikeDiffusion: 8, rockMaterial: 10 });
    erosionpara.add(controls, 'AdvectionMethod', { Semilagrangian: 0, MacCormack: 1 });
    erosionpara.add(controls, 'VelocityMultiplier', 1.0, 5.0);
    erosionpara.open();
    
    // Thermal Erosion Parameters
    var thermalerosionpara = gui.addFolder("Thermal Erosion Parameters");
    thermalerosionpara.add(controls, 'thermalTalusAngleScale', 1.0, 10.0);
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
    const brushTypeController = terraineditor.add(controls, 'brushType', { NoBrush: 0, TerrainBrush: 1, WaterBrush: 2, RockBrush: 3, SmoothBrush: 4, FlattenBrush: 5, SlopeBrush: 6 });
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
    
    // Rendering Parameters
    var renderingpara = gui.addFolder('Rendering Parameters');
    renderingpara.add(controls, 'WaterTransparency', 0.0, 1.0);
    renderingpara.add(controls, 'TerrainPlatte', { AlpineMtn: 0, Desert: 1, Jungle: 2 });
    renderingpara.add(controls, 'SnowRange', 0.0, 100.0);
    renderingpara.add(controls, 'ForestRange', 0.0, 50.0);
    renderingpara.add(controls, 'ShowFlowTrace');
    renderingpara.add(controls, 'SedimentTrace');
    renderingpara.add(controls, 'showScattering');
    renderingpara.add(controls, 'enableBilateralBlur');
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
            flattenTargetHeightController
        }
    };
}

