/**
 * Runtime interfaces for simulation and render loop.
 * Sim-only ITexturePool keeps GL/GPU types out of the interface for WebGPU cutover.
 */

/**
 * Minimal sim-only texture pool interface used by the simulation runner.
 * LegacyTexturePool and WebGPURendererPool implement this for sim.
 * Render loop is concrete per backend (LegacyRenderLoop uses LegacyTexturePool directly).
 */
export interface ITexturePool {
    setup(): void;
    swapTerrainTextures(): void;
    swapFluxTextures(): void;
}

/**
 * Simulation runner: performs one simulation step.
 * LegacySimulationRunner (WebGL) and SimulatePerStepWebGPU (WebGPU) both implement this.
 */
export interface ISimulationRunner {
    step(): void;
    dispose?(): void;
}

/**
 * Render loop: one frame of render + optional sim step.
 * Main (or runtime facade) owns requestAnimationFrame and calls loop.tick() each frame.
 */
export interface IRenderLoop {
    tick(): void;
    resize?(): void;
}
