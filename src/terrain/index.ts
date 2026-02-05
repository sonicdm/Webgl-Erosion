/**
 * Terrain Generation System
 *
 * This module provides a complete, modular terrain generation system with:
 * - Class-based terrain generators with unified parameter interface
 * - Terrain masks for spatial modulation
 * - Post-processing filters (smoothing, clamping, etc.)
 * - Easing functions for interpolation
 * - Registry system for extensibility
 *
 * Usage:
 * ```typescript
 * import { generatorRegistry, maskRegistry, filterRegistry, TerrainOptions } from './terrain';
 *
 * // Get a generator
 * const generator = generatorRegistry.get('perlin');
 *
 * // Create heightmap
 * const options: TerrainOptions = {
 *     xSegments: 127,
 *     ySegments: 127,
 *     xSize: 1024,
 *     ySize: 1024,
 *     maxHeight: 100,
 *     minHeight: -100,
 *     frequency: 2.5
 * };
 * const heightmap = new Float32Array((options.xSegments + 1) * (options.ySegments + 1));
 *
 * // Generate terrain
 * generator.generate(heightmap, options, { amplitude: 1.0, seed: 12345 });
 *
 * // Apply mask
 * const mask = maskRegistry.get('circle');
 * mask.apply(heightmap, options);
 *
 * // Apply filter
 * const filter = filterRegistry.get('smooth');
 * filter.apply(heightmap, options, { weight: 0.5 });
 * ```
 */

// Core types
export * from './types';

// Easing functions
export * from './easing';

// Noise utilities
export * from './noise';

// Heightmap cache
export * from './HeightmapCache';

// Base classes and registries
export * from './TerrainGenerator';
export * from './TerrainMask';
export * from './TerrainFilter';

// Import all generators (this registers them)
import './generators';

// Import all masks (this registers them)
import './masks';

// Re-export registries for convenience
import { generatorRegistry } from './TerrainGenerator';
import { maskRegistry } from './TerrainMask';
import { filterRegistry } from './TerrainFilter';

export { generatorRegistry, maskRegistry, filterRegistry };

/**
 * Generate terrain using a registered generator.
 * Convenience function for simple usage.
 */
export function generateTerrain(
    generatorId: string,
    options: import('./types').TerrainOptions,
    params?: import('./types').TerrainGeneratorParams
): Float32Array {
    const generator = generatorRegistry.get(generatorId);
    if (!generator) {
        throw new Error(`Generator "${generatorId}" not found`);
    }

    const size = (options.xSegments + 1) * (options.ySegments + 1);
    const heightmap = new Float32Array(size);

    generator.generate(heightmap, options, params);

    return heightmap;
}

/**
 * Get a list of all available generators organized by category.
 */
export function getGeneratorsByCategory(): Record<string, import('./types').TerrainGeneratorMetadata[]> {
    const result: Record<string, import('./types').TerrainGeneratorMetadata[]> = {};

    for (const generator of generatorRegistry.getAll()) {
        const { category } = generator.metadata;
        if (!result[category]) {
            result[category] = [];
        }
        result[category].push(generator.metadata);
    }

    return result;
}

/**
 * Get a list of all available masks organized by category.
 */
export function getMasksByCategory(): Record<string, import('./types').TerrainMaskMetadata[]> {
    const result: Record<string, import('./types').TerrainMaskMetadata[]> = {};

    for (const mask of maskRegistry.getAll()) {
        const { category } = mask.metadata;
        if (!result[category]) {
            result[category] = [];
        }
        result[category].push(mask.metadata);
    }

    return result;
}
