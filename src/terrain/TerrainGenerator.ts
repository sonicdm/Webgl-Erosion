/**
 * Base class for terrain generators.
 * All terrain generators should extend this class.
 */

import {
    ITerrainGenerator,
    TerrainGeneratorMetadata,
    TerrainGeneratorParams,
    TerrainOptions,
    Heightmap,
    GeneratorControlDefaults,
    GPU_CONTROL_BASE_DEFAULTS
} from './types';

/**
 * Abstract base class for terrain generators.
 */
export abstract class TerrainGenerator implements ITerrainGenerator {
    abstract readonly metadata: TerrainGeneratorMetadata;

    /**
     * Generate heightmap data.
     * Heights are ADDED to existing values, not replaced.
     */
    abstract generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void;

    /**
     * Get default parameters for this generator.
     */
    abstract getDefaultParams(): TerrainGeneratorParams;

    /**
     * Get default GPU control values for this generator type.
     * Override in subclasses that need non-base defaults.
     */
    getGPUControlDefaults(): GeneratorControlDefaults {
        return { ...GPU_CONTROL_BASE_DEFAULTS };
    }

    /**
     * Merge provided params with defaults.
     */
    protected mergeParams(params?: TerrainGeneratorParams): TerrainGeneratorParams {
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

    /**
     * Helper to get index in heightmap from x,y coordinates.
     */
    protected getIndex(x: number, y: number, options: TerrainOptions): number {
        const xl = options.xSegments + 1;
        return y * xl + x;
    }

    /**
     * Helper to clamp a value.
     */
    protected clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Helper to get height range.
     */
    protected getRange(options: TerrainOptions): number {
        return options.maxHeight - options.minHeight;
    }

    /**
     * Create a new heightmap array.
     */
    protected createHeightmap(options: TerrainOptions): Heightmap {
        const { total } = this.getSize(options);
        return new Float32Array(total);
    }
}

/**
 * Registry for terrain generators.
 */
class TerrainGeneratorRegistry {
    private generators: Map<string, ITerrainGenerator> = new Map();
    private byCategory: Map<string, ITerrainGenerator[]> = new Map();

    /**
     * Register a terrain generator.
     */
    register(generator: ITerrainGenerator): void {
        const { id, category } = generator.metadata;

        if (this.generators.has(id)) {
            console.warn(`TerrainGenerator "${id}" is already registered, overwriting.`);
        }

        this.generators.set(id, generator);

        // Add to category index
        if (!this.byCategory.has(category)) {
            this.byCategory.set(category, []);
        }
        this.byCategory.get(category)!.push(generator);
    }

    /**
     * Get a generator by ID.
     */
    get(id: string): ITerrainGenerator | undefined {
        return this.generators.get(id);
    }

    /**
     * Get all registered generators.
     */
    getAll(): ITerrainGenerator[] {
        return Array.from(this.generators.values());
    }

    /**
     * Get generators by category.
     */
    getByCategory(category: string): ITerrainGenerator[] {
        return this.byCategory.get(category) || [];
    }

    /**
     * Get all categories.
     */
    getCategories(): string[] {
        return Array.from(this.byCategory.keys());
    }

    /**
     * Check if a generator is registered.
     */
    has(id: string): boolean {
        return this.generators.has(id);
    }

    /**
     * Get a generator by its GPU type ID (the numeric WGSL switch case value).
     */
    getByGPUTypeId(gpuTypeId: number): ITerrainGenerator | undefined {
        for (const generator of this.generators.values()) {
            if (generator.metadata.gpuTypeId === gpuTypeId) {
                return generator;
            }
        }
        return undefined;
    }

    /**
     * Get generator metadata for GUI.
     */
    getMetadataList(): TerrainGeneratorMetadata[] {
        return this.getAll().map(g => g.metadata);
    }

    /**
     * Get a map of ID -> name for GUI dropdowns.
     */
    getOptions(): Record<string, string> {
        const options: Record<string, string> = {};
        for (const generator of this.generators.values()) {
            options[generator.metadata.name] = generator.metadata.id;
        }
        return options;
    }
}

/**
 * Global terrain generator registry.
 */
export const generatorRegistry = new TerrainGeneratorRegistry();
