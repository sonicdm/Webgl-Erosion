/**
 * WebGPU version of SimulatePerStep.
 * Executes all simulation compute passes in the correct order using WebGPU compute shaders.
 */

import { ComputeNodePipeline } from '../rendering/webgpu/compute/ComputeNodePipeline';
import { WebGPUTexturePool } from './WebGPUTexturePool';
import { AppContext } from '../app/context';
import type { IAppControls } from '../app/controls/types';
import { getWaterSourceCount, waterSources, MAX_WATER_SOURCES } from '../utils/water-sources';
import { getLavaSourceCount, lavaSources, MAX_LAVA_SOURCES } from '../utils/lava-sources';

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
    controls: IAppControls,
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

    // Prepare reusable arrays for water sources (avoid per-frame allocations)
    const reusableSourceBuffers = appContext.simulationState.getWaterSourceBuffers(MAX_WATER_SOURCES);
    const reusableSourcePositions = reusableSourceBuffers.positions;
    const reusableSourceSizes = reusableSourceBuffers.sizes;
    const reusableSourceStrengths = reusableSourceBuffers.strengths;
    
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
        slopeStartPos: [controls.slopeStartPos[0], controls.slopeStartPos[1]] as [number, number],
        slopeEndPos: [controls.slopeEndPos[0], controls.slopeEndPos[1]] as [number, number],
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
    computePipeline.waterHeightPass(texturePool, {
        simRes: simres,
        pipeLen: controls.pipelen,
        timestep: controls.timestep,
        pipeArea: controls.pipeAra,
        velMult: controls.VelocityMultiplier,
        time: timer,
        velAdvMag: controls.VelocityAdvectionMag,
    });
    texturePool.swapTerrainTextures();
    texturePool.swapVelTextures();

    // 3. Sediment (MRT: 4 outputs)
    computePipeline.sedimentPass(texturePool, {
        simRes: simres,
        pipeLen: controls.pipelen,
        timestep: controls.timestep,
        Kc: controls.Kc,
        Ks: controls.Ks,
        Kd: controls.Kd,
        time: timer,
        rockErosionResistance: controls.rockErosionResistance,
    });
    texturePool.swapTerrainTextures();
    texturePool.swapSedimentTextures();
    texturePool.swapVelTextures();

    // 4. Sediment Advection (Conditional: MacCormack or Simple)
    computePipeline.sedimentAdvectionPass(texturePool, {
        simRes: simres,
        timestep: controls.timestep,
        advectionMethod: controls.AdvectionMethod,
        advectMultiplier: controls.AdvectionSpeedScaling,
    });
    texturePool.swapSedimentTextures();
    texturePool.swapSedimentBlendTextures();
    texturePool.swapVelTextures();

    // 5. Max Slippage
    computePipeline.maxSlippagePass(texturePool, {
        simRes: simres,
        talusScale: controls.thermalTalusAngleScale,
    });
    texturePool.swapMaxSlippageTextures();

    // 6. Thermal Terrain Flux
    computePipeline.thermalFluxPass(texturePool, {
        simRes: simres,
        pipeLen: controls.pipelen,
        timestep: controls.timestep,
        pipeArea: controls.pipeAra,
        thermalRate: controls.thermalRate,
        rockErosionResistance: controls.rockErosionResistance,
    });
    texturePool.swapTerrainFluxTextures();

    // 7. Thermal Apply
    computePipeline.thermalApplyPass(texturePool, {
        simRes: simres,
        pipeLen: controls.pipelen,
        timestep: controls.timestep,
        pipeArea: controls.pipeAra,
        thermalErosionScale: controls.thermalErosionScale,
        rockErosionResistance: controls.rockErosionResistance,
    });
    texturePool.swapTerrainTextures();

    // 8. Evaporation
    computePipeline.evaporationPass(texturePool, {
        simRes: simres,
        evaporationConstant: controls.EvaporationConstant,
    });
    texturePool.swapTerrainTextures();

    // 9. Lava Simulation
    {
        // Prepare lava source buffers
        const lavaSrcBuffers = appContext.simulationState.getLavaSourceBuffers(MAX_LAVA_SOURCES);
        const lavaSourceCount = getLavaSourceCount();
        for (let i = 0; i < MAX_LAVA_SOURCES; i++) {
            if (i < lavaSources.length) {
                lavaSrcBuffers.positions[i * 2] = lavaSources[i].position[0];
                lavaSrcBuffers.positions[i * 2 + 1] = lavaSources[i].position[1];
                lavaSrcBuffers.sizes[i] = lavaSources[i].size;
                lavaSrcBuffers.strengths[i] = lavaSources[i].strength;
            } else {
                lavaSrcBuffers.positions[i * 2] = 0.0;
                lavaSrcBuffers.positions[i * 2 + 1] = 0.0;
                lavaSrcBuffers.sizes[i] = 0.0;
                lavaSrcBuffers.strengths[i] = 0.0;
            }
        }

        // 9a. Lava Source Injection
        computePipeline.lavaSourcePass(texturePool, {
            simRes: simres,
            brushSize: controls.brushSize,
            brushStrength: controls.brushStrenth,
            brushType: controls.brushType,
            brushPos: brushState?.brushPos || [0, 0],
            brushPressed: controls.brushPressed ? 1 : 0,
            brushOperation: controls.brushOperation,
            emissionTemp: controls.lavaEmissionTemp,
            sourceCount: lavaSourceCount,
            sourcePositions: lavaSrcBuffers.positions,
            sourceSizes: lavaSrcBuffers.sizes,
            sourceStrengths: lavaSrcBuffers.strengths,
            time: timer,
        });
        texturePool.swapLavaTextures();

        // 9b. Lava Flux
        computePipeline.lavaFluxPass(texturePool, {
            simRes: simres,
            pipeLen: controls.pipelen,
            timestep: controls.timestep,
            pipeArea: controls.pipeAra,
            viscosityScale: controls.lavaViscosityScale,
            yieldStress: controls.lavaYieldStress,
            crustStrength: controls.lavaCrustStrength,
        });
        texturePool.swapLavaFluxTextures();

        // 9c. Lava Height/Velocity Update (stores deltaH in vel.w for thermal transfer)
        computePipeline.lavaHeightVelPass(texturePool, {
            simRes: simres,
            pipeLen: controls.pipelen,
            timestep: controls.timestep,
            pipeArea: controls.pipeAra,
            velAdvMag: controls.VelocityAdvectionMag * 0.5,
        });
        texturePool.swapLavaTextures();
        texturePool.swapLavaVelTextures();

        // 9c2. Lava-Lava Thermal Transfer (conduction + mixing + re-mobilization)
        computePipeline.lavaThermalTransferPass(texturePool, {
            simRes: simres,
            kCond: controls.lavaKCond,
            crustMixSuppression: controls.lavaCrustMixSuppression,
            softeningTemp: controls.lavaSofteningTemp,
            timestep: controls.timestep,
        });
        texturePool.swapLavaTextures();

        // 9d. Lava Thermal Erosion (bounded: speed clamp + per-step cap)
        computePipeline.lavaThermalErosionPass(texturePool, {
            simRes: simres,
            thermalErosionRate: controls.lavaThermalErosionRate,
            maxErosionPerStep: controls.lavaMaxErosionPerStep,
            erosionSpeedClamp: controls.lavaErosionSpeedClamp,
            rockMeltThreshold: controls.lavaRockMeltThreshold,
            timestep: controls.timestep,
        });
        texturePool.swapTerrainTextures();

        // 9e. Lava Cooling & Solidification (exponential viscosity + ambient cooling)
        computePipeline.lavaCoolingPass(texturePool, {
            simRes: simres,
            coolingRate: controls.lavaCoolingRate,
            proportionalCooling: controls.lavaProportionalCooling,
            solidificationThreshold: controls.lavaSolidificationThreshold,
            rockFraction: controls.lavaRockFraction,
            crustGrowthRate: controls.lavaCrustGrowthRate,
            ambientCoolingRate: controls.lavaAmbientCoolingRate,
            viscTempScale: controls.lavaViscTempScale,
            timestep: controls.timestep,
        });
        texturePool.swapLavaTextures();
        texturePool.swapTerrainTextures();

        // 9f. Lava-Water Interaction
        if (controls.lavaWaterInteraction) {
            computePipeline.lavaWaterInteractionPass(texturePool, {
                simRes: simres,
                heatRadius: controls.lavaHeatRadius,
                coolingRate: controls.lavaCoolingRate,
                solidificationThreshold: controls.lavaSolidificationThreshold,
                rockFraction: controls.lavaRockFraction,
                waterEvapRate: controls.EvaporationConstant,
            });
            texturePool.swapLavaTextures();
            texturePool.swapTerrainTextures();
        }
    }

    // 10. Average Smoothing (MRT: 2 outputs)
    computePipeline.averagePass(texturePool, {
        simRes: simres,
        erosionMode: controls.ErosionMode,
    });
    texturePool.swapTerrainTextures();
}
