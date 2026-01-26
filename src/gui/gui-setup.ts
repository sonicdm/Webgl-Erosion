import * as DAT from 'dat-gui';
import { updatePaletteSelection, initBrushPalette } from '../brush-palette';
import { loadSettings, saveSettings } from '../settings';
import { getMaskRegistry } from '../three/terrain/mask-registry';
import { getTerrainTypeRegistry } from '../three/terrain/terrain-type-registry';

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

export interface GUISetupOptions {
    threeRuntime?: any; // ThreeJSSimulationRuntime - injected dependency
    heightmapIO?: {
        importHeightmap: () => void;
    }; // Heightmap IO service for auto-import
}

export function setupGUI(controls: Controls, options?: GUISetupOptions): { gui: DAT.GUI, controllers: GUIControllers } {
    const gui = new DAT.GUI();
    const threeRuntime = options?.threeRuntime;
    
    // Simulation Controls
    var simcontrols = gui.addFolder('Simulation Controls');
    simcontrols.add(controls, 'Pause/Resume');
    simcontrols.add(controls, 'SimulationSpeed', { fast: 3, medium: 2, slow: 1 });
    simcontrols.open();
    
    // Terrain Parameters
    var terrainParameters = gui.addFolder('Terrain Parameters');
    terrainParameters.add(controls, 'SimulationResolution', { 256: 256, 512: 512, 1024: 1024, 2048: 2048, 4096: 4096 });
    const terrainScaleController = terrainParameters.add(controls, 'TerrainScale', 0.1, 4.0);
    const terrainHeightController = terrainParameters.add(controls, 'TerrainHeight', 1.0, 5.0);
    
    // TerrainScale and TerrainHeight changes are pending until Generate Terrain button is clicked
    // No automatic regeneration - user must click Generate Terrain button
    
    terrainParameters.add(controls, 'Import Height Map');
    terrainParameters.add(controls, 'Clear Height Map');
    terrainParameters.add(controls, 'Export Height Map');
    
    // Apply defaults from the default terrain type (Ordinary FBM, ID 0)
    // This ensures the GUI looks good by default
    const defaultTerrainTypeId = controls.TerrainBaseType ?? 0;
    const registry = getTerrainTypeRegistry();
    const defaultTerrainType = registry.get(defaultTerrainTypeId);
    if (defaultTerrainType) {
        const defaults = defaultTerrainType.getDefaultParams();
        // Apply defaults if not already set
        if ((controls as any).TerrainEasing === undefined) (controls as any).TerrainEasing = defaults.easing ?? 'Linear';
        if ((controls as any).TerrainSteps === undefined) (controls as any).TerrainSteps = defaults.steps ?? 1;
        if ((controls as any).TerrainTurbulent === undefined) (controls as any).TerrainTurbulent = defaults.turbulent ?? false;
        if ((controls as any).TerrainWidthLengthRatio === undefined) (controls as any).TerrainWidthLengthRatio = defaults.ratio ?? 1.0;
        if ((controls as any).TerrainSegments === undefined) (controls as any).TerrainSegments = (controls.SimulationResolution || 1024) - 1;
        if ((controls as any).TerrainSmoothing === undefined) (controls as any).TerrainSmoothing = defaults.smoothing ?? 'None';
        if ((controls as any).TerrainEdgeType === undefined) (controls as any).TerrainEdgeType = defaults.edges?.type ?? 'Box';
        if ((controls as any).TerrainEdgeDirection === undefined) (controls as any).TerrainEdgeDirection = defaults.edges?.direction ?? 'Normal';
        if ((controls as any).TerrainEdgeCurve === undefined) (controls as any).TerrainEdgeCurve = defaults.edges?.curve ?? 'Linear';
        if ((controls as any).TerrainEdgeDistance === undefined) (controls as any).TerrainEdgeDistance = defaults.edges?.distance ?? 256;
    } else {
        // Fallback defaults if registry lookup fails
        if ((controls as any).TerrainEasing === undefined) (controls as any).TerrainEasing = 'Linear';
        if ((controls as any).TerrainSteps === undefined) (controls as any).TerrainSteps = 1;
        if ((controls as any).TerrainTurbulent === undefined) (controls as any).TerrainTurbulent = false;
        if ((controls as any).TerrainWidthLengthRatio === undefined) (controls as any).TerrainWidthLengthRatio = 1.0;
        if ((controls as any).TerrainSegments === undefined) (controls as any).TerrainSegments = (controls.SimulationResolution || 1024) - 1;
        if ((controls as any).TerrainSmoothing === undefined) (controls as any).TerrainSmoothing = 'None';
        if ((controls as any).TerrainEdgeType === undefined) (controls as any).TerrainEdgeType = 'Box';
        if ((controls as any).TerrainEdgeDirection === undefined) (controls as any).TerrainEdgeDirection = 'Normal';
        if ((controls as any).TerrainEdgeCurve === undefined) (controls as any).TerrainEdgeCurve = 'Linear';
        if ((controls as any).TerrainEdgeDistance === undefined) (controls as any).TerrainEdgeDistance = 256;
    }
    
    // TerrainSize is the same as SimulationResolution - sync them
    if ((controls as any).TerrainSize === undefined) (controls as any).TerrainSize = controls.SimulationResolution || 1024;
    (controls as any).TerrainSize = controls.SimulationResolution || (controls as any).TerrainSize || 1024;
    
    if ((controls as any).TerrainCustomLock === undefined) (controls as any).TerrainCustomLock = false;
    
    // Status line (read-only display) - create a custom display
    // TerrainSegments is automatically computed as simres - 1
    // TerrainSize is the same as SimulationResolution
    const statusObj: any = { 
      status: `simres=${controls.SimulationResolution || 1024} segments=${((controls.SimulationResolution || 1024) - 1)} ratio=${((controls as any).TerrainWidthLengthRatio || 1.0).toFixed(2)}` 
    };
    const statusLineController = terrainParameters.add(statusObj, 'status');
    (statusLineController.domElement as HTMLElement).style.pointerEvents = 'none';
    (statusLineController.domElement.querySelector('input') as HTMLInputElement).readOnly = true;
    
    // TerrainBaseType - ALL terrain types (THREE.Terrain and legacy shader-based)
    const terrainBaseTypeController = terrainParameters.add(controls, 'TerrainBaseType', {
        'Heightmap': 'heightmap',
        'Brownian': 'Brownian',
        'Cosine': 'Cosine',
        'CosineLayers': 'CosineLayers',
        'DiamondSquare': 'DiamondSquare',
        'Fault': 'Fault',
        'Hill': 'Hill',
        'HillIsland': 'HillIsland',
        'Particles': 'Particles',
        'Perlin': 'Perlin',
        'PerlinDiamond': 'PerlinDiamond',
        'PerlinLayers': 'PerlinLayers',
        'Simplex': 'Simplex',
        'SimplexLayers': 'SimplexLayers',
        'Value': 'Value',
        'Weierstrass': 'Weierstrass',
        'Worley': 'Worley',
        // Keep old numeric IDs for backward compatibility
        'Ordinary FBM (Legacy)': 0,
        'Domain Warp (Legacy)': 1,
        'Terrace (Legacy)': 2,
        'Voroni (Legacy)': 3,
        'Ridge Noise (Legacy)': 4,
        'Billow Noise (Legacy)': 5,
        'Turbulence (Legacy)': 6,
        'Craters (Legacy)': 7,
        'Dunes (Legacy)': 8,
        'Canyons (Legacy)': 9,
        'Mountains (Legacy)': 10,
        'Billowy Ridges (Legacy)': 11
    });
    
    // Get mask registry for TerrainMask select
    const maskRegistry = getMaskRegistry();
    const maskOptions: any = { 'OFF': 0 };
    for (let i = 1; i <= 11; i++) {
        if (i !== 9) { // Skip 9
            const mask = maskRegistry.get(i);
            if (mask) {
                maskOptions[mask.getDisplayName()] = i;
            }
        }
    }
    const terrainMaskController = terrainParameters.add(controls, 'TerrainMask', maskOptions);
    
    const terrainEasingController = terrainParameters.add(controls as any, 'TerrainEasing', {
        'Linear': 'Linear',
        'EaseIn': 'EaseIn',
        'EaseOut': 'EaseOut',
        'EaseInOut': 'EaseInOut',
        'InEaseOut': 'InEaseOut'
    });
    
    const terrainStepsController = terrainParameters.add(controls as any, 'TerrainSteps', 1, 8).step(1);
    const terrainTurbulentController = terrainParameters.add(controls as any, 'TerrainTurbulent');
    
    // TerrainSize is the same as SimulationResolution - removed duplicate control
    const terrainWidthLengthRatioController = terrainParameters.add(controls as any, 'TerrainWidthLengthRatio', 0.2, 2.0).step(0.05);
    
    // Advanced subfolder (collapsible, default closed)
    const advancedFolder = terrainParameters.addFolder('Advanced');
    advancedFolder.close(); // Default closed
    
    const terrainSmoothingController = advancedFolder.add(controls as any, 'TerrainSmoothing', {
        'None': 'None',
        'Conservative 0.5': 'Conservative 0.5',
        'Conservative 1': 'Conservative 1',
        'Conservative 10': 'Conservative 10',
        'Gaussian 0.5,7': 'Gaussian 0.5,7',
        'Gaussian 1.0,7': 'Gaussian 1.0,7',
        'Gaussian 1.5,7': 'Gaussian 1.5,7',
        'Gaussian 1.0,5': 'Gaussian 1.0,5',
        'Gaussian 1.0,11': 'Gaussian 1.0,11',
        'GaussianBox': 'GaussianBox',
        'Mean 0': 'Mean 0',
        'Mean 1': 'Mean 1',
        'Mean 8': 'Mean 8',
        'Median': 'Median'
    });
    
    const terrainEdgeTypeController = advancedFolder.add(controls as any, 'TerrainEdgeType', { 'Box': 'Box', 'Radial': 'Radial' });
    const terrainEdgeDirectionController = advancedFolder.add(controls as any, 'TerrainEdgeDirection', { 'Normal': 'Normal', 'Up': 'Up', 'Down': 'Down' });
    const terrainEdgeCurveController = advancedFolder.add(controls as any, 'TerrainEdgeCurve', { 'Linear': 'Linear', 'EaseIn': 'EaseIn', 'EaseOut': 'EaseOut', 'EaseInOut': 'EaseInOut' });
    const terrainEdgeDistanceController = advancedFolder.add(controls as any, 'TerrainEdgeDistance', 0, 512).step(32);
    
    // Generate Terrain button (replaces Reset Terrain)
    const generateTerrainButton = terrainParameters.add({ generateTerrain: () => {
        if (threeRuntime) {
            const terrainRandom = {
                seedOffset: [Math.random() * 256.0, Math.random() * 256.0],
                duneDir: [Math.cos(Math.random() * Math.PI * 2.0), Math.sin(Math.random() * Math.PI * 2.0)],
                craterDensity: 0.8 + Math.random() * 0.7,
                canyonDepth: 0.45 + Math.random() * 0.5
            };
            threeRuntime.regenerateTerrain(controls, terrainRandom).catch((error: any) => {
                console.error('[GUI] ERROR: Failed to regenerate terrain:', error);
            });
        }
    }}, 'generateTerrain').name('Generate Terrain');
    
    // Custom lock checkbox (prevents defaults from being applied)
    const customLockController = terrainParameters.add(controls as any, 'TerrainCustomLock').name('Custom Lock (prevent defaults)');
    
    // Debounce utility function
    const debounce = (func: Function, wait: number) => {
        let timeout: NodeJS.Timeout | null = null;
        return function executedFunction(...args: any[]) {
            const later = () => {
                timeout = null;
                func(...args);
            };
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };
    
    // Debounced handlers for heavy controls (300-500ms)
    const debouncedSimResChange = debounce(() => {
        // TerrainSegments is automatically computed as simres - 1
        // TerrainSize is the same as SimulationResolution - sync them
        (controls as any).TerrainSize = controls.SimulationResolution;
        (controls as any).TerrainSegments = controls.SimulationResolution - 1;
        updateStatusLine();
    }, 400);
    
    const debouncedRatioChange = debounce(() => {
        updateStatusLine();
    }, 400);
    
    // Status line update function
    const updateStatusLine = () => {
        const simres = controls.SimulationResolution || 1024;
        const segments = simres - 1; // Automatically computed
        const ratio = (controls as any).TerrainWidthLengthRatio || 1.0;
        statusObj.status = `simres=${simres} segments=${segments} ratio=${ratio.toFixed(2)}`;
        statusLineController.updateDisplay();
    };
    
    // TerrainBaseType onChange: apply defaults and handle heightmap auto-import
    terrainBaseTypeController.onChange((value: any) => {
        console.log('[GUI] TerrainBaseType changed to:', value);
        
        // Check for heightmap auto-import
        if ((value === 'heightmap' || value === 'Heightmap') && threeRuntime && options?.heightmapIO) {
            const heightmapSource = threeRuntime.passManager?.terrainReadbackService?.getHeightmapSource();
            if (!heightmapSource) {
                console.log('[GUI] Heightmap type selected but no heightmap loaded, triggering import...');
                options.heightmapIO.importHeightmap();
            }
        }
        
        // Apply type-specific defaults unless custom lock is enabled
        if (!(controls as any).TerrainCustomLock && threeRuntime) {
            const registry = getTerrainTypeRegistry();
            const terrainType = registry.get(value);
            if (terrainType) {
                const defaults = terrainType.getDefaultParams();
                console.log('[GUI] Applying defaults for', terrainType.getDisplayName(), ':', defaults);
                
                if (defaults.easing !== undefined) (controls as any).TerrainEasing = defaults.easing;
                if (defaults.steps !== undefined) (controls as any).TerrainSteps = defaults.steps;
                if (defaults.turbulent !== undefined) (controls as any).TerrainTurbulent = defaults.turbulent;
                if (defaults.size !== undefined) (controls as any).TerrainSize = defaults.size;
                if (defaults.ratio !== undefined) (controls as any).TerrainWidthLengthRatio = defaults.ratio;
                if (defaults.smoothing !== undefined) (controls as any).TerrainSmoothing = defaults.smoothing;
                if (defaults.edges) {
                    if (defaults.edges.type !== undefined) (controls as any).TerrainEdgeType = defaults.edges.type;
                    if (defaults.edges.direction !== undefined) (controls as any).TerrainEdgeDirection = defaults.edges.direction;
                    if (defaults.edges.curve !== undefined) (controls as any).TerrainEdgeCurve = defaults.edges.curve;
                    if (defaults.edges.distance !== undefined) (controls as any).TerrainEdgeDistance = defaults.edges.distance;
                }
                
                // Update GUI controllers to reflect new values
                terrainEasingController.updateDisplay();
                terrainStepsController.updateDisplay();
                terrainTurbulentController.updateDisplay();
                terrainWidthLengthRatioController.updateDisplay();
                terrainSmoothingController.updateDisplay();
                terrainEdgeTypeController.updateDisplay();
                terrainEdgeDirectionController.updateDisplay();
                terrainEdgeCurveController.updateDisplay();
                terrainEdgeDistanceController.updateDisplay();
                
                updateStatusLine();
            }
        }
    });
    
    // Monitor SimulationResolution changes - TerrainSegments is automatically computed as simres - 1
    // TerrainSize is the same as SimulationResolution - sync them
    const simResController = terrainParameters.__controllers.find((c: any) => c.property === 'SimulationResolution');
    if (simResController) {
        const originalOnChange = simResController.onChange;
        simResController.onChange((value: number) => {
            if (originalOnChange) originalOnChange(value);
            // TerrainSegments is automatically computed as simres - 1
            // TerrainSize is the same as SimulationResolution
            (controls as any).TerrainSegments = value - 1;
            (controls as any).TerrainSize = value;
            debouncedSimResChange();
        });
    }
    
    // All other controllers just mark pending (onChange only, no regeneration)
    terrainEasingController.onChange(() => updateStatusLine());
    terrainStepsController.onChange(() => updateStatusLine());
    terrainTurbulentController.onChange(() => updateStatusLine());
    terrainWidthLengthRatioController.onChange(() => {
        updateStatusLine();
        debouncedRatioChange();
    });
    terrainSmoothingController.onChange(() => updateStatusLine());
    terrainEdgeTypeController.onChange(() => updateStatusLine());
    terrainEdgeDirectionController.onChange(() => updateStatusLine());
    terrainEdgeCurveController.onChange(() => updateStatusLine());
    terrainEdgeDistanceController.onChange(() => updateStatusLine());
    terrainMaskController.onChange(() => updateStatusLine());
    
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
    erosionpara.add(controls, 'TerrainDebug', { noDebugView: 0, sediment: 1, velocity: 2, velocityHeatmap: 9, terrain: 3, flux: 4, terrainflux: 5, maxslippage: 6, flowMap: 7, spikeDiffusion: 8, rockMaterial: 10, lavaVolume: 11, lavaTemperature: 12, lavaTempVolume: 13, waterLavaContact: 14, rockLayering: 15 });
    const advectionMethodController = erosionpara.add(controls, 'AdvectionMethod', { Semilagrangian: 0, MacCormack: 1 });
    const velocityMultiplierController = erosionpara.add(controls, 'VelocityMultiplier', 1.0, 5.0);
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
    thermalerosionpara.add(controls, 'thermalErosionScale', 0.0, 5.0);
    
    // Lava Physics Parameters
    var lavapara = gui.addFolder("Lava Physics Parameters");
    lavapara.add(controls, 'LavaViscosityPreExp', 1e-6, 1e-4);
    lavapara.add(controls, 'LavaActivationEnergy', 100000.0, 300000.0);
    lavapara.add(controls, 'LavaDensity', 2000.0, 3000.0);
    lavapara.add(controls, 'LavaSpecificHeat', 800.0, 1500.0);
    lavapara.add(controls, 'LavaAirHeatTransfer', 50.0, 500.0);
    lavapara.add(controls, 'LavaWaterHeatTransfer', 1000.0, 5000.0);
    lavapara.add(controls, 'LavaAmbientTemp', 0.0, 30.0);
    lavapara.add(controls, 'LavaWaterTemp', 0.0, 20.0);
    lavapara.add(controls, 'LavaContactHeatTransfer', 100.0, 500.0);
    lavapara.add(controls, 'LavaMeltThreshold', 1000.0, 1400.0);
    lavapara.add(controls, 'LavaLatentHeatFusion', 200000.0, 600000.0);
    lavapara.add(controls, 'LavaSolidificationTemp', 700.0, 1000.0);
    lavapara.add(controls, 'LavaInitialTemp', 1000.0, 1300.0);
    lavapara.add(controls, 'LavaGlowIntensity', 0.5, 5.0);
    lavapara.add(controls, 'LavaPatternFrequency', 1.0, 32.0);
    lavapara.close();
    
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
    
  // Rendering Parameters
  var renderingpara = gui.addFolder('Rendering Parameters');
  renderingpara.add(controls, 'WaterTransparency', 0.0, 1.0);

  // Ensure DebugMode exists on controls to avoid dat-gui runtime errors
  if (!(controls as any).hasOwnProperty('DebugMode')) {
    (controls as any).DebugMode = 0;
  }
  // Opt-in to live heightmap from simulation (otherwise uses initial CPU texture)
  if (!(controls as any).hasOwnProperty('UseSimHeightmap')) {
    (controls as any).UseSimHeightmap = false;
  }

  const terrainPaletteController = renderingpara.add(controls, 'TerrainPlatte', { AlpineMtn: 0, Desert: 1, Jungle: 2 });
  const snowRangeController = renderingpara.add(controls, 'SnowRange', 0.0, 100.0);
  const forestRangeController = renderingpara.add(controls, 'ForestRange', 0.0, 50.0);
  const useSimHeightmapController = renderingpara.add(controls as any, 'UseSimHeightmap');
  const threeDebugController = renderingpara.add(controls as any, 'DebugMode', {
    Normal: 0,
    HeightGray: 1,
    UVs: 2,
    Normals: 3,
    WorldY: 4,
    FlatDetector: 5
  });
  
  // Update terrain material when rendering parameters change
  if (threeRuntime) {
    terrainPaletteController.onFinishChange(() => {
      threeRuntime.updateMaterialFromControls();
      });
    snowRangeController.onFinishChange(() => {
      threeRuntime.updateMaterialFromControls();
    });
    forestRangeController.onFinishChange(() => {
      threeRuntime.updateMaterialFromControls();
    });
    useSimHeightmapController.onFinishChange(() => {
      threeRuntime.updateMaterialFromControls();
    });
    threeDebugController.onFinishChange(() => {
      threeRuntime.updateMaterialFromControls();
    });
  }
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
