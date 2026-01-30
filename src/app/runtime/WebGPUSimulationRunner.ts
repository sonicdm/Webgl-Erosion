import type { ISimulationRunner } from './types';
import type { ComputeNodePipeline } from '../../rendering/webgpu/compute/ComputeNodePipeline';
import type { WebGPUTexturePool } from '../../simulation/WebGPUTexturePool';
import type { AppContext } from '../context';
import type { IAppControls } from '../controls/types';
import { SimulatePerStepWebGPU } from '../../simulation/SimulatePerStepWebGPU';

/**
 * WebGPU simulation runner. step() runs one SimulatePerStepWebGPU with current controls/timer/brushState.
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
        }
    ) {}

    step(): void {
        SimulatePerStepWebGPU(
            this.computePipeline,
            this.texturePool,
            this.appContext,
            this.getControls(),
            this.getTimer(),
            this.getBrushState()
        );
    }
}
