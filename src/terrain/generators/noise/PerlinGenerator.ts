/**
 * Perlin noise terrain generator.
 * Uses classic Perlin noise for smooth, natural-looking terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class PerlinGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'perlin',
        name: 'Perlin',
        category: 'noise',
        description: 'Classic Perlin noise for smooth, natural terrain',
        gpuTypeId: 12,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Noise frequency (higher = more detail)' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed (0 = random)' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const divisor = (Math.min(options.xSegments, options.ySegments) + 1) / (frequency as number);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                heightmap[j * xl + i] += noise.perlin(i / divisor, j / divisor) * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.5, terrainOctaves: 6 });
    }
}

// Register the generator
generatorRegistry.register(new PerlinGenerator());
