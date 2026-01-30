/**
 * Base class for terrain filters (post-processing).
 * Filters modify the heightmap after generation.
 */

import {
    ITerrainFilter,
    TerrainFilterMetadata,
    TerrainFilterParams,
    TerrainOptions,
    Heightmap,
    EasingFunction
} from './types';
import { Linear } from './easing';

/**
 * Abstract base class for terrain filters.
 */
export abstract class TerrainFilter implements ITerrainFilter {
    abstract readonly metadata: TerrainFilterMetadata;

    /**
     * Apply the filter to a heightmap.
     */
    abstract apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainFilterParams): void;

    /**
     * Get default parameters for this filter.
     */
    abstract getDefaultParams(): TerrainFilterParams;

    /**
     * Merge provided params with defaults.
     */
    protected mergeParams(params?: TerrainFilterParams): TerrainFilterParams {
        return { ...this.getDefaultParams(), ...params };
    }

    /**
     * Helper to get heightmap dimensions.
     */
    protected getSize(options: TerrainOptions): { xl: number; yl: number; total: number } {
        const xl = options.xSegments + 1;
        const yl = options.ySegments + 1;
        return { xl, yl, total: xl * yl };
    }
}

/**
 * Registry for terrain filters.
 */
class TerrainFilterRegistry {
    private filters: Map<string, ITerrainFilter> = new Map();
    private byCategory: Map<string, ITerrainFilter[]> = new Map();

    /**
     * Register a terrain filter.
     */
    register(filter: ITerrainFilter): void {
        const { id, category } = filter.metadata;

        if (this.filters.has(id)) {
            console.warn(`TerrainFilter "${id}" is already registered, overwriting.`);
        }

        this.filters.set(id, filter);

        if (!this.byCategory.has(category)) {
            this.byCategory.set(category, []);
        }
        this.byCategory.get(category)!.push(filter);
    }

    /**
     * Get a filter by ID.
     */
    get(id: string): ITerrainFilter | undefined {
        return this.filters.get(id);
    }

    /**
     * Get all registered filters.
     */
    getAll(): ITerrainFilter[] {
        return Array.from(this.filters.values());
    }

    /**
     * Get filters by category.
     */
    getByCategory(category: string): ITerrainFilter[] {
        return this.byCategory.get(category) || [];
    }

    /**
     * Check if a filter is registered.
     */
    has(id: string): boolean {
        return this.filters.has(id);
    }

    /**
     * Get a map of ID -> name for GUI dropdowns.
     */
    getOptions(): Record<string, string> {
        const options: Record<string, string> = {};
        for (const filter of this.filters.values()) {
            options[filter.metadata.name] = filter.metadata.id;
        }
        return options;
    }
}

/**
 * Global terrain filter registry.
 */
export const filterRegistry = new TerrainFilterRegistry();

// ============================================================================
// Built-in Filters (ported from THREE.Terrain)
// ============================================================================

/**
 * Clamp filter - rescale heightmap to fit within min/max range.
 */
export class ClampFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'clamp',
        name: 'Clamp',
        category: 'transform',
        description: 'Rescale heightmap to fit within min/max range',
        params: [
            { name: 'stretch', type: 'boolean', default: true, description: 'Stretch to fill range' }
        ]
    };

    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainFilterParams): void {
        const { stretch = true, easing = Linear } = this.mergeParams(params) as { stretch: boolean; easing: EasingFunction };

        let min = Infinity;
        let max = -Infinity;

        // Find current min/max
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < min) min = heightmap[i];
            if (heightmap[i] > max) max = heightmap[i];
        }

        const actualRange = max - min;
        const targetMax = stretch ? options.maxHeight : Math.min(max, options.maxHeight);
        const targetMin = stretch ? options.minHeight : Math.max(min, options.minHeight);
        const range = targetMax - targetMin;

        if (actualRange === 0) return;

        // Apply easing and rescale
        for (let i = 0; i < heightmap.length; i++) {
            const normalized = (heightmap[i] - min) / actualRange;
            const eased = typeof easing === 'function' ? easing(normalized) : normalized;
            heightmap[i] = eased * range + targetMin;
        }
    }

    getDefaultParams(): TerrainFilterParams {
        return { stretch: true };
    }
}

/**
 * Smooth filter - mean/average smoothing.
 */
export class SmoothFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'smooth',
        name: 'Smooth (Mean)',
        category: 'smoothing',
        description: 'Smooth terrain by setting each point to mean of neighbors',
        params: [
            { name: 'weight', type: 'number', default: 0, min: 0, max: 10, description: 'Weight of original value' }
        ]
    };

    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainFilterParams): void {
        const { weight = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);
        const temp = new Float32Array(heightmap.length);

        // Calculate smoothed values
        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                let sum = 0;
                let count = 0;

                for (let n = -1; n <= 1; n++) {
                    for (let m = -1; m <= 1; m++) {
                        const ni = i + m;
                        const nj = j + n;
                        if (ni >= 0 && ni < xl && nj >= 0 && nj < yl) {
                            sum += heightmap[nj * xl + ni];
                            count++;
                        }
                    }
                }

                temp[j * xl + i] = sum / count;
            }
        }

        // Blend with original
        const w = 1 / (1 + (weight as number));
        for (let k = 0; k < heightmap.length; k++) {
            heightmap[k] = (temp[k] + heightmap[k] * (weight as number)) * w;
        }
    }

    getDefaultParams(): TerrainFilterParams {
        return { weight: 0 };
    }
}

/**
 * Median smooth filter.
 */
export class MedianSmoothFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'smooth-median',
        name: 'Smooth (Median)',
        category: 'smoothing',
        description: 'Smooth terrain using median of neighbors (preserves edges)',
        params: []
    };

    apply(heightmap: Heightmap, options: TerrainOptions, _params?: TerrainFilterParams): void {
        const { xl, yl } = this.getSize(options);
        const temp = new Float32Array(heightmap.length);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const neighbors: number[] = [];

                for (let n = -1; n <= 1; n++) {
                    for (let m = -1; m <= 1; m++) {
                        const ni = i + m;
                        const nj = j + n;
                        if (ni >= 0 && ni < xl && nj >= 0 && nj < yl) {
                            neighbors.push(heightmap[nj * xl + ni]);
                        }
                    }
                }

                neighbors.sort((a, b) => a - b);
                const mid = Math.floor(neighbors.length / 2);
                temp[j * xl + i] = neighbors.length % 2 === 1
                    ? neighbors[mid]
                    : (neighbors[mid - 1] + neighbors[mid]) * 0.5;
            }
        }

        heightmap.set(temp);
    }

    getDefaultParams(): TerrainFilterParams {
        return {};
    }
}

/**
 * Conservative smooth filter - clamps within neighbor extremes.
 */
export class ConservativeSmoothFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'smooth-conservative',
        name: 'Smooth (Conservative)',
        category: 'smoothing',
        description: 'Clamp each point within its neighbors extremes',
        params: [
            { name: 'multiplier', type: 'number', default: 1, min: 0.1, max: 10, description: 'Range multiplier' }
        ]
    };

    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainFilterParams): void {
        const { multiplier = 1 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);
        const temp = new Float32Array(heightmap.length);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                let max = -Infinity;
                let min = Infinity;

                for (let n = -1; n <= 1; n++) {
                    for (let m = -1; m <= 1; m++) {
                        if (n === 0 && m === 0) continue;
                        const ni = i + m;
                        const nj = j + n;
                        if (ni >= 0 && ni < xl && nj >= 0 && nj < yl) {
                            const val = heightmap[nj * xl + ni];
                            if (val < min) min = val;
                            if (val > max) max = val;
                        }
                    }
                }

                const k = j * xl + i;
                if (typeof multiplier === 'number' && multiplier !== 1) {
                    const halfDiff = (max - min) * 0.5;
                    const middle = min + halfDiff;
                    max = middle + halfDiff * multiplier;
                    min = middle - halfDiff * multiplier;
                }

                temp[k] = Math.max(min, Math.min(max, heightmap[k]));
            }
        }

        heightmap.set(temp);
    }

    getDefaultParams(): TerrainFilterParams {
        return { multiplier: 1 };
    }
}

/**
 * Step filter - partition terrain into flat steps.
 */
export class StepFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'step',
        name: 'Step',
        category: 'transform',
        description: 'Partition terrain into flat steps/terraces',
        params: [
            { name: 'levels', type: 'number', default: 8, min: 2, max: 32, step: 1, description: 'Number of steps' }
        ]
    };

    apply(heightmap: Heightmap, _options: TerrainOptions, params?: TerrainFilterParams): void {
        let { levels = 8 } = this.mergeParams(params);

        if (typeof levels !== 'number' || levels < 2) {
            levels = Math.floor(Math.pow(heightmap.length * 0.5, 0.25));
        }

        // Sort heights to find buckets
        const sorted = Array.from(heightmap).sort((a, b) => a - b);
        const inc = Math.floor(heightmap.length / levels);

        interface Bucket {
            min: number;
            max: number;
            avg: number;
        }

        const buckets: Bucket[] = [];

        for (let i = 0; i < levels; i++) {
            const subset = sorted.slice(i * inc, (i + 1) * inc);
            const sum = subset.reduce((a, b) => a + b, 0);
            buckets.push({
                min: subset[0],
                max: subset[subset.length - 1],
                avg: sum / subset.length
            });
        }

        // Map each height to bucket average
        for (let i = 0; i < heightmap.length; i++) {
            const h = heightmap[i];
            for (const bucket of buckets) {
                if (h >= bucket.min && h <= bucket.max) {
                    heightmap[i] = bucket.avg;
                    break;
                }
            }
        }
    }

    getDefaultParams(): TerrainFilterParams {
        return { levels: 8 };
    }
}

/**
 * Turbulence filter - fold terrain for turbulent appearance.
 */
export class TurbulenceFilter extends TerrainFilter {
    readonly metadata: TerrainFilterMetadata = {
        id: 'turbulence',
        name: 'Turbulence',
        category: 'transform',
        description: 'Apply turbulence transform for chaotic appearance',
        params: []
    };

    apply(heightmap: Heightmap, options: TerrainOptions, _params?: TerrainFilterParams): void {
        const range = options.maxHeight - options.minHeight;

        for (let i = 0; i < heightmap.length; i++) {
            heightmap[i] = options.minHeight + Math.abs((heightmap[i] - options.minHeight) * 2 - range);
        }
    }

    getDefaultParams(): TerrainFilterParams {
        return {};
    }
}

// Register built-in filters
filterRegistry.register(new ClampFilter());
filterRegistry.register(new SmoothFilter());
filterRegistry.register(new MedianSmoothFilter());
filterRegistry.register(new ConservativeSmoothFilter());
filterRegistry.register(new StepFilter());
filterRegistry.register(new TurbulenceFilter());
