/**
 * Holds bootstrap/default config (read-only in practice).
 * UI-tunable runtime state (e.g. simres) lives in SimulationStateHolder.
 * No global constants — all config is injected via this holder.
 */
export class ConfigHolder {
    /** Default simulation resolution when initialSimres is not provided */
    public readonly defaultSimres: number;

    /** Shadow map resolution (e.g. for legacy WebGL path) */
    public readonly shadowMapResolution: number;

    /** Max heightmap buffer counter — read heightmap to CPU every N frames when brush idle */
    public readonly maxHeightmapBufCounter: number;

    /** Base interval for heightmap read when brush is pressed (scaled by resolution) */
    public readonly activeHeightmapReadInterval: number;

    /** Base interval for heightmap read when brush is visible but not pressed */
    public readonly hoverHeightmapReadInterval: number;

    constructor(options?: {
        defaultSimres?: number;
        shadowMapResolution?: number;
        maxHeightmapBufCounter?: number;
        activeHeightmapReadInterval?: number;
        hoverHeightmapReadInterval?: number;
    }) {
        this.defaultSimres = options?.defaultSimres ?? 1024;
        this.shadowMapResolution = options?.shadowMapResolution ?? 4096;
        this.maxHeightmapBufCounter = options?.maxHeightmapBufCounter ?? 200;
        this.activeHeightmapReadInterval = options?.activeHeightmapReadInterval ?? 2;
        this.hoverHeightmapReadInterval = options?.hoverHeightmapReadInterval ?? 4;
    }

    /**
     * Whether to read heightmap this frame based on brush state and counter.
     * Caller must pass current heightMapBufCounter from SimulationStateHolder.
     */
    shouldReadHeightmap(
        brushPressed: boolean,
        brushVisible: boolean,
        simres: number,
        heightMapBufCounter: number
    ): boolean {
        if (brushPressed) {
            const scale = this.getResolutionScale(simres);
            return heightMapBufCounter % (this.activeHeightmapReadInterval * scale) === 0;
        }
        if (brushVisible) {
            const scale = this.getResolutionScale(simres);
            return heightMapBufCounter % (this.hoverHeightmapReadInterval * scale) === 0;
        }
        return heightMapBufCounter >= this.maxHeightmapBufCounter;
    }

    private getResolutionScale(simres: number): number {
        const basePixels = 1024 * 1024;
        const currentPixels = simres * simres;
        return Math.max(1, Math.round(currentPixels / basePixels));
    }
}
