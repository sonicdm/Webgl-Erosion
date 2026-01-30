/**
 * Heightmap terrain generator.
 * Uses cached imported heightmap data for terrain generation.
 * Allows tweaking parameters without re-importing the heightmap.
 */

import { TerrainGenerator, generatorRegistry } from '../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../types';
import { heightmapCache } from '../HeightmapCache';

export class HeightmapGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'heightmap',
        name: 'Imported Heightmap',
        category: 'custom',
        description: 'Uses cached imported heightmap image. Import a heightmap first.',
        params: [
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'invert', type: 'boolean', default: false, description: 'Invert heights' },
            { name: 'offsetX', type: 'number', default: 0, min: -1, max: 1, description: 'Horizontal offset' },
            { name: 'offsetY', type: 'number', default: 0, min: -1, max: 1, description: 'Vertical offset' }
        ],
        gpuTypeId: 100
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0, invert = false, offsetX = 0, offsetY = 0 } = this.mergeParams(params);

        if (!heightmapCache.hasCache()) {
            console.warn('[HeightmapGenerator] No cached heightmap available. Import a heightmap first.');
            // Fill with flat terrain at mid-height
            const midHeight = (options.maxHeight + options.minHeight) / 2;
            heightmap.fill(midHeight);
            return;
        }

        const targetWidth = options.xSegments + 1;
        const targetHeight = options.ySegments + 1;
        const range = options.maxHeight - options.minHeight;

        // Get scaled heightmap from cache
        const scaled = heightmapCache.getScaled(targetWidth, targetHeight, 1.0);
        if (!scaled) {
            const midHeight = (options.maxHeight + options.minHeight) / 2;
            heightmap.fill(midHeight);
            return;
        }

        // Apply with offset and transformations
        const ox = Math.round((offsetX as number) * targetWidth);
        const oy = Math.round((offsetY as number) * targetHeight);

        for (let y = 0; y < targetHeight; y++) {
            for (let x = 0; x < targetWidth; x++) {
                // Sample with offset (wrap around)
                let sx = (x + ox) % targetWidth;
                let sy = (y + oy) % targetHeight;
                if (sx < 0) sx += targetWidth;
                if (sy < 0) sy += targetHeight;

                let value = scaled[sy * targetWidth + sx];

                // Apply invert
                if (invert) {
                    value = 1 - value;
                }

                // Map to height range with amplitude
                const height = options.minHeight + value * range * (amplitude as number);
                heightmap[y * targetWidth + x] = height;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { amplitude: 1.0, invert: false, offsetX: 0, offsetY: 0 };
    }
}

// Register the generator
generatorRegistry.register(new HeightmapGenerator());
