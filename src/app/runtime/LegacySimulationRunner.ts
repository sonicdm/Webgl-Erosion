import type { ISimulationRunner, SimStepOptions } from './types';

/**
 * Legacy (WebGL) simulation runner. Delegates to an injected step implementation.
 * Used when simulation runs via WebGL SimulatePerStep; main provides stepImpl that
 * calls SimulationStep(...). For WebGPU sim path, use a WebGPU runner instead.
 */
export class LegacySimulationRunner implements ISimulationRunner {
    constructor(private stepImpl: () => void) {}

    step(_options?: SimStepOptions): void {
        this.stepImpl();
    }
}
