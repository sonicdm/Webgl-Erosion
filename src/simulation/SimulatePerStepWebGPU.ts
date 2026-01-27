/**
 * WebGPU version of SimulatePerStep.
 * Executes all simulation compute passes in the correct order using WebGPU compute shaders.
 */

import { ComputeNodePipeline } from '../rendering/webgpu/compute/ComputeNodePipeline';
import { WebGPUTexturePool } from './WebGPUTexturePool';
import { AppContext } from '../app/context';
import { Controls } from '../settings';
import { getWaterSourceCount, waterSources, MAX_WATER_SOURCES } from '../utils/water-sources';

/**
 * Execute one complete simulation step using WebGPU compute shaders.
 * 
 * @param computePipeline - Compute pipeline with all passes
 * @param texturePool - WebGPU texture pool
 * @param appContext - Application context with state holders
 * @param controls - Simulation controls
 * @param timer - Current simulation time step
 * @param brushState - Brush state (mouse world pos, dir, brush pos, etc.)
 */
export function SimulatePerStepWebGPU(
    computePipeline: ComputeNodePipeline,
    texturePool: WebGPUTexturePool,
    appContext: AppContext,
    controls: Controls,
    timer: number,
    brushState?: {
        mouseWorldPos: [number, number, number, number];
        mouseWorldDir: [number, number, number];
        brushPos: [number, number];
    }
): void {
    if (appContext.simulationState.pauseGeneration) {
        return;
    }

    const simres = appContext.simulationState.simres;

    // Prepare reusable arrays for water sources (matching main.ts pattern)
    const reusableSourcePositions = new Float32Array(MAX_WATER_SOURCES * 2);
    const reusableSourceSizes = new Float32Array(MAX_WATER_SOURCES);
    const reusableSourceStrengths = new Float32Array(MAX_WATER_SOURCES);
    
    // Populate water sources from water-sources system
    const sourceCount = getWaterSourceCount();
    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
        if (i < waterSources.length) {
            reusableSourcePositions[i * 2] = waterSources[i].position[0];
            reusableSourcePositions[i * 2 + 1] = waterSources[i].position[1];
            reusableSourceSizes[i] = waterSources[i].size;
            reusableSourceStrengths[i] = waterSources[i].strength;
        } else {
            reusableSourcePositions[i * 2] = 0.0;
            reusableSourcePositions[i * 2 + 1] = 0.0;
            reusableSourceSizes[i] = 0.0;
            reusableSourceStrengths[i] = 0.0;
        }
    }

    // 0. Rain Precipitation
    computePipeline.rainPass(texturePool, {
        time: timer,
        rainDegree: controls.RainDegree,
        simRes: simres,
        mouseWorldPos: brushState?.mouseWorldPos || [0, 0, 0, 0],
        mouseWorldDir: brushState?.mouseWorldDir || [0, 0, 0],
        brushSize: controls.brushSize,
        brushStrength: controls.brushStrenth,
        brushType: controls.brushType,
        brushPressed: controls.brushPressed ? 1 : 0,
        brushPos: brushState?.brushPos || [0, 0],
        brushOperation: controls.brushOperation,
        rainErosion: controls.RainErosion ? 1 : 0,
        rainErosionStrength: controls.RainErosionStrength,
        rainErosionDropSize: controls.RainErosionDropSize,
        flattenTargetHeight: controls.flattenTargetHeight,
        slopeStartPos: controls.slopeStartPos,
        slopeEndPos: controls.slopeEndPos,
        slopeActive: controls.slopeActive,
        sourceCount: sourceCount,
        sourcePositions: reusableSourcePositions,
        sourceSizes: reusableSourceSizes,
        sourceStrengths: reusableSourceStrengths,
    });
    texturePool.swapTerrainTextures();

    // 1. Flow (Flux)
    computePipeline.flowPass(texturePool, {
        simRes: simres,
        pipeLen: controls.pipelen,
        timestep: controls.timestep,
        pipeArea: controls.pipeAra,
    });
    texturePool.swapFluxTextures();

    // 2. Water Height/Velocity (MRT: 2 outputs)
    // TODO: Implement when waterHeightPass is complete
    // computePipeline.waterHeightPass(texturePool, { ... });
    // texturePool.swapTerrainTextures();
    // texturePool.swapVelTextures();

    // 3. Sediment (MRT: 4 outputs)
    // TODO: Implement when sedimentPass is complete
    // computePipeline.sedimentPass(texturePool, { ... });
    // texturePool.swapSedimentTextures();
    // texturePool.swapTerrainTextures();
    // texturePool.swapVelTextures();

    // 4. Sediment Advection (Conditional: MacCormack or Simple)
    // TODO: Implement when sedimentAdvectionPass is complete
    // if (controls.AdvectionMethod == 1) {
    //     // MacCormack (3 subpasses)
    // } else {
    //     // Simple (1 pass)
    // }
    // texturePool.swapSedimentBlendTextures();
    // texturePool.swapSedimentTextures();
    // texturePool.swapVelTextures();

    // 5. Max Slippage
    // TODO: Implement when maxSlippagePass is complete
    // computePipeline.maxSlippagePass(texturePool, { simRes: simres });
    // texturePool.swapMaxSlippageTextures();

    // 6. Thermal Terrain Flux
    // TODO: Implement when thermalFluxPass is complete
    // computePipeline.thermalFluxPass(texturePool, {
    //     simRes: simres,
    //     thermalRate: controls.thermalRate,
    //     thermalErosionScale: controls.thermalErosionScale,
    // });
    // texturePool.swapTerrainFluxTextures();

    // 7. Thermal Apply
    // TODO: Implement when thermalApplyPass is complete
    // computePipeline.thermalApplyPass(texturePool, { simRes: simres });
    // texturePool.swapTerrainTextures();

    // 8. Evaporation
    computePipeline.evaporationPass(texturePool, {
        simRes: simres,
        evaporationConstant: controls.EvaporationConstant,
    });
    texturePool.swapTerrainTextures();

    // 9. Lava Flow (if enabled)
    // TODO: Implement when lavaPass is complete
    // computePipeline.lavaPass(texturePool, { ... });

    // 10. Average Smoothing (MRT: 2 outputs)
    // TODO: Implement when averagePass is complete
    // computePipeline.averagePass(texturePool, { simRes: simres });
    // texturePool.swapTerrainTextures();
}
