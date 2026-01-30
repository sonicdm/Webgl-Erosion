import { vec2 } from 'gl-matrix';
import type { AppContext } from '../context';
import type { IAppControls } from '../controls/types';

/**
 * Mutable terrain random state (seedOffset, duneDir, craterDensity, canyonDepth).
 * Injected so TerrainSceneService can update it without owning geometry/shaders.
 */
export interface TerrainRandomState {
    seedOffset: vec2;
    duneDir: vec2;
    craterDensity: number;
    canyonDepth: number;
}

/**
 * Optional WebGPU terrain generator; when present, setTerrainRandom updates its seed.
 */
export interface TerrainGeneratorComputeLike {
    setRandomSeed(): void;
    setParams(params: { seed: number }): void;
}

/**
 * Terrain scene actions: loadScene, reset, setTerrainRandom.
 * These become the stable actions passed into createControls(ctx, actions).
 * loadScene implementation is injected (GL-dependent); reset and setTerrainRandom use holders + optional refs.
 */
export class TerrainSceneService {
    private loadSceneImpl: ((gl: WebGL2RenderingContext) => void) | null = null;

    constructor(
        private appContext: AppContext,
        private deps?: {
            terrainRandom?: TerrainRandomState;
            /** Getter so WebGPU terrain generator (created later in main) can be updated by setTerrainRandom. */
            getTerrainGeneratorCompute?: () => TerrainGeneratorComputeLike | null;
        }
    ) {}

    /** Set the loadScene implementation (GL-bound; called from main/createRuntime). */
    setLoadSceneImpl(impl: (gl: WebGL2RenderingContext) => void): void {
        this.loadSceneImpl = impl;
    }

    /** Load scene geometry (square, plane, waterPlane). No-op if no GL context or impl. */
    loadScene(): void {
        const gl = this.appContext.simulationState.glContext;
        if (!gl) {
            console.warn('[TerrainSceneService] WebGL2 context not available');
            return;
        }
        if (this.loadSceneImpl) {
            this.loadSceneImpl(gl);
        }
    }

    /** Reset sim frame count, randomize terrain params, and mark terrain dirty. */
    reset(controls: IAppControls): void {
        this.appContext.simulationState.setSimFrameCount(0);
        this.setTerrainRandom(controls);
        this.appContext.simulationState.setTerrainGeometryDirty(true);
    }

    /** Randomize terrain seed/dune/crater/canyon and mark terrain dirty. */
    setTerrainRandom(controls: IAppControls): void {
        const seedValue = Number(controls.terrainSeed ?? 0);
        const useRandom = !Number.isFinite(seedValue) || seedValue === 0;
        const rand = useRandom ? Math.random : this.createSeededRandom(Math.floor(seedValue));
        const tr = this.deps?.terrainRandom;
        if (tr) {
            const angle = rand() * Math.PI * 2.0;
            tr.duneDir[0] = Math.cos(angle);
            tr.duneDir[1] = Math.sin(angle);
            tr.craterDensity = 0.8 + rand() * 0.7;
            tr.canyonDepth = 0.45 + rand() * 0.5;
            tr.seedOffset[0] = rand() * 256.0;
            tr.seedOffset[1] = rand() * 256.0;
        }
        const gen = this.deps?.getTerrainGeneratorCompute?.();
        if (gen) {
            if (useRandom) {
                gen.setRandomSeed();
            } else {
                gen.setParams({ seed: seedValue });
            }
        }
        this.appContext.simulationState.setTerrainGeometryDirty(true);
    }

    private createSeededRandom(seed: number): () => number {
        let t = (seed >>> 0) || 1;
        return () => {
            t += 0x6d2b79f5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }
}
