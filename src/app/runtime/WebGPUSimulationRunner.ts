import type { ISimulationRunner, SimStepOptions } from './types';
import type { ComputeNodePipeline } from '../../rendering/webgpu/compute/ComputeNodePipeline';
import type { WebGPUTexturePool } from '../../simulation/WebGPUTexturePool';
import type { AppContext } from '../context';
import type { IAppControls } from '../controls/types';
import { SimulatePerStepWebGPU } from '../../simulation/SimulatePerStepWebGPU';
import type { WebGPUBackendLike } from '../../utils/webgpu-pool-to-three-texture-copy';
import type { PoolSyncTextures } from '../../utils/webgpu-pool-to-three-texture-copy';

/**
 * WebGPU simulation runner. step() runs one SimulatePerStepWebGPU with current controls/timer/brushState.
 * When isLastStep is true, pool→Three.js copy is encoded in the same submit as the last sim step (one fewer submit).
 */
export class WebGPUSimulationRunner implements ISimulationRunner {
    constructor(
        private computePipeline: ComputeNodePipeline,
        private texturePool: WebGPUTexturePool,
        private appContext: AppContext,
        private getControls: () => IAppControls,
        private getTimer: () => number,
        private getBrushState: () => {
            mouseWorldPos: [number, number, number, number];
            mouseWorldDir: [number, number, number];
            brushPos: [number, number];
        },
        private getBackend: () => WebGPUBackendLike | null,
        private getPoolSync: () => PoolSyncTextures | null
    ) {}

    step(options?: SimStepOptions): void {
        const isLastStep = options?.isLastStep;
        const backend = isLastStep ? this.getBackend() : null;
        const poolSync = isLastStep ? this.getPoolSync() : null;
        const copyAfterStep =
            isLastStep && backend && poolSync
                ? { backend, poolSync }
                : undefined;

        SimulatePerStepWebGPU(
            this.computePipeline,
            this.texturePool,
            this.appContext,
            this.getControls(),
            this.getTimer(),
            this.getBrushState(),
            copyAfterStep,
            options?.timestepScale,
            options?.simTime
        );
    }
}
