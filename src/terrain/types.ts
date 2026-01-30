/**
 * Core types and interfaces for the terrain generation system.
 * This module provides the foundational types for terrain generators, masks, filters, and easing functions.
 */

/**
 * Options passed to terrain generators and filters.
 */
export interface TerrainOptions {
    /** Number of segments along X axis */
    xSegments: number;
    /** Number of segments along Y axis */
    ySegments: number;
    /** Physical size along X axis */
    xSize: number;
    /** Physical size along Y axis */
    ySize: number;
    /** Maximum height of terrain */
    maxHeight: number;
    /** Minimum height of terrain */
    minHeight: number;
    /** Frequency/detail level (higher = more detail) */
    frequency: number;
    /** Random seed for reproducible generation */
    seed?: number;
    /** Whether to stretch heights to fill min/max range */
    stretch?: boolean;
    /** Easing function for height distribution */
    easing?: EasingFunction;
}

/**
 * An easing function that transforms values from [0,1] to [0,1].
 */
export type EasingFunction = (t: number) => number;

/**
 * A heightmap represented as a flat Float32Array where index = y * width + x.
 */
export type Heightmap = Float32Array;

/**
 * Parameters specific to a terrain generator.
 */
export interface TerrainGeneratorParams {
    [key: string]: number | boolean | string | undefined;
}

/**
 * Parameter definition for GUI display.
 */
export interface TerrainParamDefinition {
    name: string;
    type: 'number' | 'boolean' | 'select';
    default: number | boolean | string;
    min?: number;
    max?: number;
    step?: number;
    options?: { label: string; value: string | number }[];
    description?: string;
}

/**
 * Metadata about a terrain generator for registration and GUI.
 */
export interface TerrainGeneratorMetadata {
    /** Unique identifier for the generator */
    id: string;
    /** Display name */
    name: string;
    /** Category for grouping in GUI */
    category: TerrainGeneratorCategory;
    /** Description of the generator */
    description: string;
    /** Parameter definitions for GUI */
    params: TerrainParamDefinition[];
    /** Numeric type ID matching the WGSL switch case (0-25, 100 for heightmap) */
    gpuTypeId: number;
}

/**
 * Categories for terrain generators.
 */
export type TerrainGeneratorCategory =
    | 'noise'           // Perlin, Simplex, Value, Worley
    | 'procedural'      // DiamondSquare, Fault, Hill, Particles
    | 'wave'            // Cosine, Weierstrass
    | 'composite'       // MultiPass, PerlinLayers, SimplexLayers
    | 'geographic'      // Craters, Dunes, Canyons, Mountains
    | 'custom';         // User-defined

/**
 * Interface for terrain generators.
 */
export interface ITerrainGenerator {
    /** Metadata about this generator */
    readonly metadata: TerrainGeneratorMetadata;

    /**
     * Generate heightmap data.
     * @param heightmap The heightmap to modify (heights are added, not replaced)
     * @param options Generation options
     * @param params Generator-specific parameters
     */
    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void;

    /**
     * Get default parameters for this generator.
     */
    getDefaultParams(): TerrainGeneratorParams;

    /**
     * Get default GPU control values for this generator.
     * These map to the GUI control property names (terrainFrequency, terrainOctaves, etc.)
     * and are applied when the user selects this generator type in the dropdown.
     */
    getGPUControlDefaults(): GeneratorControlDefaults;
}

/**
 * Metadata about a terrain mask for registration and GUI.
 */
export interface TerrainMaskMetadata {
    /** Unique identifier for the mask */
    id: string;
    /** Display name */
    name: string;
    /** Category for grouping in GUI */
    category: TerrainMaskCategory;
    /** Description of the mask */
    description: string;
    /** Parameter definitions for GUI */
    params: TerrainParamDefinition[];
}

/**
 * Categories for terrain masks.
 */
export type TerrainMaskCategory =
    | 'geometric'       // Circle, Square, Ring, etc.
    | 'gradient'        // Linear, Radial, Corner, etc.
    | 'influence'       // Hill, Valley, Mesa, Volcano (from THREE.Terrain)
    | 'edge'            // Edge modifiers
    | 'custom';         // User-defined

/**
 * Parameters specific to a terrain mask.
 */
export interface TerrainMaskParams {
    [key: string]: number | boolean | string | undefined;
}

/**
 * Interface for terrain masks.
 */
export interface ITerrainMask {
    /** Metadata about this mask */
    readonly metadata: TerrainMaskMetadata;

    /**
     * Apply the mask to a heightmap.
     * @param heightmap The heightmap to modify
     * @param options Generation options
     * @param params Mask-specific parameters
     */
    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainMaskParams): void;

    /**
     * Calculate mask value at a normalized position (0-1).
     * @param x X position (0-1)
     * @param y Y position (0-1)
     * @param params Mask-specific parameters
     * @returns Mask value (typically 0-1, can be outside for some masks)
     */
    getValue(x: number, y: number, params?: TerrainMaskParams): number;

    /**
     * Get default parameters for this mask.
     */
    getDefaultParams(): TerrainMaskParams;
}

/**
 * Metadata about a terrain filter for registration and GUI.
 */
export interface TerrainFilterMetadata {
    /** Unique identifier for the filter */
    id: string;
    /** Display name */
    name: string;
    /** Category for grouping in GUI */
    category: TerrainFilterCategory;
    /** Description of the filter */
    description: string;
    /** Parameter definitions for GUI */
    params: TerrainParamDefinition[];
}

/**
 * Categories for terrain filters.
 */
export type TerrainFilterCategory =
    | 'smoothing'       // Mean, Median, Gaussian, Conservative
    | 'transform'       // Clamp, Step, Turbulence
    | 'edge'            // Edge modifiers
    | 'custom';         // User-defined

/**
 * Parameters specific to a terrain filter.
 */
export interface TerrainFilterParams {
    [key: string]: number | boolean | string | undefined;
}

/**
 * Interface for terrain filters (post-processing).
 */
export interface ITerrainFilter {
    /** Metadata about this filter */
    readonly metadata: TerrainFilterMetadata;

    /**
     * Apply the filter to a heightmap.
     * @param heightmap The heightmap to modify
     * @param options Terrain options
     * @param params Filter-specific parameters
     */
    apply(heightmap: Heightmap, options: TerrainOptions, params?: TerrainFilterParams): void;

    /**
     * Get default parameters for this filter.
     */
    getDefaultParams(): TerrainFilterParams;
}

/**
 * Blending modes for influence/feature placement.
 */
export enum BlendingMode {
    Additive = 'additive',
    Subtractive = 'subtractive',
    Multiply = 'multiply',
    Replace = 'replace',
    Normal = 'normal'
}

/**
 * Parameters for placing an influence/feature on terrain.
 */
export interface InfluenceParams {
    /** X position (0-1 normalized) */
    x: number;
    /** Y position (0-1 normalized) */
    y: number;
    /** Radius of influence */
    radius: number;
    /** Height/strength of influence */
    height: number;
    /** Blending mode */
    blending: BlendingMode;
    /** Falloff easing function */
    falloff: EasingFunction;
}

/**
 * An influence shape function.
 * Takes distance from center (-1 to 1) and returns height (-1 to 1).
 */
export type InfluenceShape = (distance: number, dx?: number, dy?: number) => number;

/**
 * Configuration for a multi-pass terrain generation.
 */
export interface MultiPassConfig {
    /** Generator to use */
    generator: ITerrainGenerator;
    /** Amplitude multiplier (0-1) */
    amplitude?: number;
    /** Frequency override */
    frequency?: number;
    /** Additional parameters for the generator */
    params?: TerrainGeneratorParams;
}

/**
 * Result of terrain analysis.
 */
export interface TerrainAnalysis {
    elevation: {
        min: number;
        max: number;
        mean: number;
        median: number;
        stdev: number;
    };
    slope: {
        min: number;
        max: number;
        mean: number;
        median: number;
        stdev: number;
    };
    roughness: number;
}

/**
 * GPU terrain generation parameters.
 * This interface matches the WGSL uniform struct layout for terrain-generate.wgsl.
 * All parameters are used to pack a uniform buffer that's sent to the GPU.
 */
export interface GPUTerrainGeneratorParams {
    // Basic parameters (vec4 aligned)
    resolution: number;
    terrainScale: number;
    terrainHeight: number;
    generatorType: number;

    // Mask parameters
    maskType: number;
    maskStrength: number;
    maskCenterX: number;
    maskCenterY: number;

    // Noise parameters
    frequency: number;
    amplitude: number;
    octaves: number;
    lacunarity: number;

    persistence: number;
    seed: number;
    offsetX: number;
    offsetY: number;

    // Generator-specific parameters
    ridgeOffset: number;
    ridgeGain: number;
    terraceCount: number;
    domainWarpStrength: number;

    // Additional parameters
    erosionStrength: number;
    smoothness: number;
    duneDirectionX: number;
    duneDirectionY: number;

    craterDensity: number;
    canyonDepth: number;
    voronoiRandomness: number;
    useHeightmap: number;

    // Heightmap parameters
    heightmapAmplitude: number;
    heightmapInvert: number;
    padding1: number;
    padding2: number;
}

/**
 * Default GPU terrain generation parameters.
 */
export const DEFAULT_GPU_TERRAIN_PARAMS: GPUTerrainGeneratorParams = {
    resolution: 1024,
    terrainScale: 3.2,
    terrainHeight: 2.0,
    generatorType: 0,

    maskType: 0,
    maskStrength: 1.0,
    maskCenterX: 0.5,
    maskCenterY: 0.5,

    frequency: 1.0,
    amplitude: 1.0,
    octaves: 8,
    lacunarity: 2.0,

    persistence: 0.5,
    seed: 0,
    offsetX: 0,
    offsetY: 0,

    ridgeOffset: 1.0,
    ridgeGain: 2.0,
    terraceCount: 8,
    domainWarpStrength: 1.0,

    erosionStrength: 0.5,
    smoothness: 0.5,
    duneDirectionX: 1.0,
    duneDirectionY: 0.0,

    craterDensity: 1.0,
    canyonDepth: 0.6,
    voronoiRandomness: 1.0,
    useHeightmap: 0,

    heightmapAmplitude: 1.0,
    heightmapInvert: 0,
    padding1: 0,
    padding2: 0,
};

/**
 * Maps generator type IDs to their names for reference.
 */
export const TERRAIN_GENERATOR_TYPES = {
    // Original types (0-11)
    ordinaryFBM: 0,
    domainWarp: 1,
    terrace: 2,
    voronoi: 3,
    ridgeNoise: 4,
    billowNoise: 5,
    turbulence: 6,
    craters: 7,
    dunes: 8,
    canyons: 9,
    mountains: 10,
    billowyRidges: 11,

    // THREE.Terrain ports (12-25)
    perlin: 12,
    simplex: 13,
    diamondSquare: 14,
    fault: 15,
    hill: 16,
    hillIsland: 17,
    particles: 18,
    value: 19,
    cosine: 20,
    weierstrass: 21,
    perlinLayers: 22,
    simplexLayers: 23,
    perlinDiamond: 24,
    cosineLayers: 25,

    // Imported heightmap
    importedHeightmap: 100,
} as const;

/**
 * Per-generator default control values.
 * Keys match the GUI control property names in the controls object.
 * When a generator type is selected, these defaults are applied to the GUI.
 */
export interface GeneratorControlDefaults {
    terrainFrequency: number;
    terrainAmplitude: number;
    terrainOctaves: number;
    terrainLacunarity: number;
    terrainPersistence: number;
    terrainRidgeOffset: number;
    terrainRidgeGain: number;
    terrainTerraceCount: number;
    terrainDomainWarpStrength: number;
    craterDensity: number;
    canyonDepth: number;
}

/**
 * Base GPU control defaults shared across all generators.
 * Generators override specific values via getGPUControlDefaults().
 */
export const GPU_CONTROL_BASE_DEFAULTS: GeneratorControlDefaults = {
    terrainFrequency: 1.0,
    terrainAmplitude: 1.0,
    terrainOctaves: 8,
    terrainLacunarity: 2.0,
    terrainPersistence: 0.5,
    terrainRidgeOffset: 1.0,
    terrainRidgeGain: 2.0,
    terrainTerraceCount: 8,
    terrainDomainWarpStrength: 1.0,
    craterDensity: 1.0,
    canyonDepth: 0.6,
};

/**
 * Helper to create GPU control defaults by merging overrides onto base.
 */
export function gpuDefaults(overrides: Partial<GeneratorControlDefaults>): GeneratorControlDefaults {
    return { ...GPU_CONTROL_BASE_DEFAULTS, ...overrides };
}

/**
 * Maps mask type IDs to their names for reference.
 */
export const TERRAIN_MASK_TYPES = {
    OFF: 0,
    Sphere: 1,
    Slope: 2,
    Square: 3,
    Ring: 4,
    RadialGradient: 5,
    Corner: 6,
    Diagonal: 7,
    Cross: 8,
    Craters: 10,
    Dunes: 11,
} as const;
