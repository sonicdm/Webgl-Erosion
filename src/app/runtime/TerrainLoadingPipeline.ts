import type { AppContext } from '../context';
import type { TerrainGeometryUpdater } from '../services/TerrainGeometryUpdater';
import type { TerrainGeneratorCompute } from '../../rendering/webgpu/compute/TerrainGeneratorCompute';
import type { WebGPUTexturePool } from '../../simulation/WebGPUTexturePool';
import type { IAppControls } from '../controls/types';
import { LoadProgressTracker, LoadPhase } from '../../utils/load-progress';

export interface TerrainLoadingDeps {
    getDevice: () => GPUDevice | null;
    getTexturePool: () => WebGPUTexturePool | null;
    getTerrainGenerator: () => TerrainGeneratorCompute | null;
    getControls: () => IAppControls;
    /** Called when simres changes — resize pool, CPU buffer, recreate materials, etc. */
    onResolutionChanged: (newRes: number) => void;
}

/**
 * Manages the async terrain loading state machine:
 * dirty flag → generation → readback → BVH build.
 * Handles resolution changes and loading overlay UI.
 */
export class TerrainLoadingPipeline {
    private terrainGeneratedOnce = false;
    private initialReadbackRequested = false;

    constructor(
        private appContext: AppContext,
        private terrainGeometryUpdater: TerrainGeometryUpdater,
        private deps: TerrainLoadingDeps,
    ) {}

    get hasGeneratedOnce(): boolean {
        return this.terrainGeneratedOnce;
    }

    /**
     * Called each tick. If terrain is dirty, kicks off the async
     * generate → readback → BVH build pipeline.
     */
    checkAndRun(): void {
        if (!this.appContext.simulationState.terrainGeometryDirty) return;

        this.appContext.simulationState.setTerrainGeometryDirty(false);

        const loadingOverlay = document.getElementById('terrain-loading-overlay');
        const progressText = document.getElementById('loading-progress-text');
        const progressBar = document.getElementById('loading-progress-bar');

        const buildInProgress = this.appContext.terrainState.terrainBVHBuildInProgress
            || (loadingOverlay && loadingOverlay.classList.contains('visible'));

        if (!buildInProgress) {
            if (loadingOverlay) {
                loadingOverlay.classList.add('visible');
                const lt = document.getElementById('loading-text');
                if (lt) lt.textContent = 'Generating Terrain...';
                void loadingOverlay.offsetHeight;
            }
            if (progressBar) {
                progressBar.style.width = '0%';
                void progressBar.offsetHeight;
            }
            if (progressText) {
                progressText.textContent = 'Initializing...';
            }
        }

        const progressTracker = new LoadProgressTracker((progress, phase) => {
            if (progressBar) {
                progressBar.style.width = `${progress * 100}%`;
                void progressBar.offsetHeight;
            }
            if (progressText) {
                const phaseNames: Record<LoadPhase, string> = {
                    [LoadPhase.DECODE]: 'Decoding image...',
                    [LoadPhase.GPU_UPLOAD]: 'Uploading to GPU...',
                    [LoadPhase.READBACK]: 'Reading heightmap data...',
                    [LoadPhase.GEOMETRY]: 'Creating terrain geometry...',
                    [LoadPhase.BVH]: 'Building spatial index (BVH)...',
                };
                progressText.textContent = phase ? phaseNames[phase] : 'Initializing...';
            }
        });

        requestAnimationFrame(async () => {
            const controls = this.deps.getControls();
            const device = this.deps.getDevice();
            const texturePool = this.deps.getTexturePool();
            const terrainGenerator = this.deps.getTerrainGenerator();
            const simState = this.appContext.simulationState;

            // --- Resolution change ---
            const resolutionChanged = controls.SimulationResolution != simState.simres;
            if (resolutionChanged) {
                const newRes = Number(controls.SimulationResolution);
                this.deps.onResolutionChanged(newRes);
            }

            // --- GPU terrain generation ---
            if (terrainGenerator && texturePool && device) {
                progressTracker.startPhase(LoadPhase.GPU_UPLOAD);
                progressTracker.updateSubPhaseProgress(0.0);
                terrainGenerator.updateParams(controls);
                progressTracker.updateSubPhaseProgress(0.3);
                terrainGenerator.generate(
                    texturePool.readTerrainTexture,
                    texturePool.writeTerrainTexture,
                    simState.simres,
                );
                this.terrainGeneratedOnce = true;
                texturePool.clearAuxiliaryTextures();
                progressTracker.updateSubPhaseProgress(1.0);
                progressTracker.endPhase(LoadPhase.GPU_UPLOAD);

                // Readback
                progressTracker.startPhase(LoadPhase.READBACK);
                progressTracker.updateSubPhaseProgress(0.0);
                await simState.readHeightmapFromWebGPU(device, texturePool.readTerrainTexture);
                progressTracker.updateSubPhaseProgress(1.0);
                progressTracker.endPhase(LoadPhase.READBACK);
            }

            // --- BVH build ---
            if (this.appContext.terrainState.terrainBVHBuildInProgress) {
                return;
            }

            if (simState.heightMapBufIsFresh
                && simState.heightMapCpuBuf
                && simState.heightMapCpuBuf.length >= simState.simres * simState.simres * 4
            ) {
                let hasData = false;
                const sampleCount = Math.min(100, simState.simres * simState.simres);
                for (let i = 0; i < sampleCount; i++) {
                    const idx = Math.floor(Math.random() * simState.simres * simState.simres) * 4;
                    if (simState.heightMapCpuBuf[idx] !== 0) { hasData = true; break; }
                }
                if (hasData) {
                    try {
                        this.appContext.terrainState.setTerrainBVHBuildInProgress(true);
                        simState.setTerrainGeometryDirty(false);
                        progressTracker.startPhase(LoadPhase.GEOMETRY);
                        progressTracker.startPhase(LoadPhase.BVH);
                        if (progressBar) { progressBar.style.width = '70%'; void progressBar.offsetHeight; }
                        requestAnimationFrame(() => {
                            this.terrainGeometryUpdater.update(simState.heightMapCpuBuf, simState.simres, 1.0);
                            progressTracker.updateSubPhaseProgress(1.0);
                            progressTracker.endPhase(LoadPhase.BVH);
                            progressTracker.endPhase(LoadPhase.GEOMETRY);
                            if (loadingOverlay) loadingOverlay.classList.remove('visible');
                        });
                    } catch (error) {
                        console.error('[BVH] Failed to build BVH:', error);
                        this.appContext.terrainState.setTerrainBVHBuildInProgress(false);
                        simState.setHeightMapBufIsFresh(false);
                        simState.setTerrainGeometryDirty(false);
                        if (loadingOverlay) loadingOverlay.classList.remove('visible');
                    }
                } else {
                    simState.setHeightMapBufIsFresh(false);
                    simState.setTerrainGeometryDirty(true);
                    if (progressText) progressText.textContent = 'Waiting for valid heightmap data...';
                }
            } else {
                if (progressText) progressText.textContent = 'Waiting for heightmap readback...';
            }
        });
    }

    /**
     * Request one initial heightmap readback (after first generation)
     * so heightMapCpuBuf is populated for brush raycasting.
     */
    requestInitialReadback(): void {
        if (!this.terrainGeneratedOnce || this.initialReadbackRequested) return;

        const device = this.deps.getDevice();
        const texturePool = this.deps.getTexturePool();
        if (!device || !texturePool) return;

        this.initialReadbackRequested = true;
        this.appContext.simulationState.readHeightmapFromWebGPU(device, texturePool.readTerrainTexture)
            .then(() => {
                this.appContext.simulationState.setHeightMapBufIsFresh(true);
            })
            .catch((err) => {
                console.warn('[WebGPU] Initial heightmap readback failed:', err);
                this.initialReadbackRequested = false;
            });
    }
}
