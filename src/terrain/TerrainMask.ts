/**
 * Base class for terrain masks.
 * Masks modify heightmap values based on spatial position.
 */

import {
    ITerrainMask,
    TerrainMaskMetadata,
    TerrainMaskParams,
    TerrainOptions,
    Heightmap,
    BlendingMode,
    InfluenceParams,
    InfluenceShape,
    EasingFunction
} from './types';
import { Linear } from './easing';

/**
 * Abstract base class for terrain masks.
 */
export abstract class TerrainMask implements ITerrainMask {
    abstract readonly metadata: TerrainMaskMetadata;

    /**
     * Apply the mask to a heightmap.
     * Default implementation multiplies heights by mask value.
     */
    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainMaskParams): void {
        const mergedParams = this.mergeParams(params);
        const xl = options.xSegments + 1;
        const yl = options.ySegments + 1;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i / (xl - 1);
                const y = j / (yl - 1);
                const maskValue = this.getValue(x, y, mergedParams);
                const index = j * xl + i;
                heightmap[index] *= maskValue;
            }
        }
    }

    /**
     * Calculate mask value at a normalized position (0-1).
     */
    abstract getValue(x: number, y: number, params?: TerrainMaskParams): number;

    /**
     * Get default parameters for this mask.
     */
    abstract getDefaultParams(): TerrainMaskParams;

    /**
     * Merge provided params with defaults.
     */
    protected mergeParams(params?: TerrainMaskParams): TerrainMaskParams {
        return { ...this.getDefaultParams(), ...params };
    }
}

/**
 * Registry for terrain masks.
 */
class TerrainMaskRegistry {
    private masks: Map<string, ITerrainMask> = new Map();
    private byCategory: Map<string, ITerrainMask[]> = new Map();

    /**
     * Register a terrain mask.
     */
    register(mask: ITerrainMask): void {
        const { id, category } = mask.metadata;

        if (this.masks.has(id)) {
            console.warn(`TerrainMask "${id}" is already registered, overwriting.`);
        }

        this.masks.set(id, mask);

        // Add to category index
        if (!this.byCategory.has(category)) {
            this.byCategory.set(category, []);
        }
        this.byCategory.get(category)!.push(mask);
    }

    /**
     * Get a mask by ID.
     */
    get(id: string): ITerrainMask | undefined {
        return this.masks.get(id);
    }

    /**
     * Get all registered masks.
     */
    getAll(): ITerrainMask[] {
        return Array.from(this.masks.values());
    }

    /**
     * Get masks by category.
     */
    getByCategory(category: string): ITerrainMask[] {
        return this.byCategory.get(category) || [];
    }

    /**
     * Check if a mask is registered.
     */
    has(id: string): boolean {
        return this.masks.has(id);
    }

    /**
     * Get a map of ID -> name for GUI dropdowns.
     */
    getOptions(): Record<string, string> {
        const options: Record<string, string> = {};
        for (const mask of this.masks.values()) {
            options[mask.metadata.name] = mask.metadata.id;
        }
        return options;
    }
}

/**
 * Global terrain mask registry.
 */
export const maskRegistry = new TerrainMaskRegistry();

/**
 * Collection of influence shape functions (from THREE.Terrain).
 */
export const InfluenceShapes: Record<string, InfluenceShape> = {
    /**
     * Mesa - flat-topped plateau with exponential falloff.
     */
    Mesa: (x: number): number => {
        return 1.25 * Math.min(0.8, Math.exp(-(x * x)));
    },

    /**
     * Hole - inverted mesa (depression).
     */
    Hole: (x: number): number => {
        return -InfluenceShapes.Mesa(x);
    },

    /**
     * Hill - smooth hill shape using ease-in-out curve.
     */
    Hill: (x: number): number => {
        if (x < 0) {
            const t = x + 1;
            return t * t * (3 - 2 * t);
        }
        return 1 - x * x * (3 - 2 * x);
    },

    /**
     * Valley - inverted hill.
     */
    Valley: (x: number): number => {
        return -InfluenceShapes.Hill(x);
    },

    /**
     * Dome - parabolic dome shape.
     */
    Dome: (x: number): number => {
        return -(x + 1) * (x - 1);
    },

    /**
     * Flat - no influence (returns 0).
     */
    Flat: (_x: number): number => {
        return 0;
    },

    /**
     * Volcano - volcano shape with crater.
     */
    Volcano: (x: number): number => {
        return 0.94 - 0.32 * (Math.abs(2 * x) + Math.cos(2 * Math.PI * Math.abs(x) + 0.4));
    },

    /**
     * Cone - simple linear falloff cone.
     */
    Cone: (x: number): number => {
        return 1 - Math.abs(x);
    },

    /**
     * Gaussian - Gaussian bell curve.
     */
    Gaussian: (x: number): number => {
        return Math.exp(-x * x * 2);
    }
};

/**
 * Place an influence/feature on the terrain.
 * This is the core function from THREE.Terrain.Influence.
 */
export function applyInfluence(
    heightmap: Heightmap,
    options: TerrainOptions,
    shape: InfluenceShape,
    params: InfluenceParams
): void {
    const {
        x = 0.5,
        y = 0.5,
        radius = 64,
        height = 64,
        blending = BlendingMode.Normal,
        falloff = Linear
    } = params;

    const xl = options.xSegments + 1;
    const yl = options.ySegments + 1;
    const vx = xl * x; // vertex x-location
    const vy = yl * y; // vertex y-location
    const xw = options.xSize / options.xSegments; // width of x-segments
    const yw = options.ySize / options.ySegments; // width of y-segments
    const rx = radius / xw; // radius in vertices on x-axis
    const ry = radius / yw; // radius in vertices on y-axis
    const r1 = 1 / radius; // for speed

    const xs = Math.ceil(vx - rx);
    const xe = Math.floor(vx + rx);
    const ys = Math.ceil(vy - ry);
    const ye = Math.floor(vy + ry);

    for (let i = xs; i < xe; i++) {
        for (let j = ys; j < ye; j++) {
            if (i < 0 || i >= xl || j < 0 || j >= yl) continue;

            const k = j * xl + i;
            const fdx = (i - vx) * xw;
            const fdy = (j - vy) * yw;
            const fd = Math.sqrt(fdx * fdx + fdy * fdy);
            const fdr = fd * r1;
            const fdxr = fdx * r1;
            const fdyr = fdy * r1;

            if (fd > radius) continue;

            // Get displacement according to shape, multiply by height,
            // interpolate using falloff
            const d = shape(fdr, fdxr, fdyr) * height * (1 - falloff(fdr));

            switch (blending) {
                case BlendingMode.Additive:
                    heightmap[k] += d;
                    break;
                case BlendingMode.Subtractive:
                    heightmap[k] -= d;
                    break;
                case BlendingMode.Multiply:
                    heightmap[k] *= d;
                    break;
                case BlendingMode.Replace:
                    heightmap[k] = d;
                    break;
                case BlendingMode.Normal:
                default:
                    heightmap[k] = falloff(fdr) * heightmap[k] + d;
                    break;
            }
        }
    }
}
