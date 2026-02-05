/**
 * Simplex noise terrain generator.
 * Uses Simplex noise for efficient, high-quality terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class SimplexGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'simplex',
        name: 'Simplex',
        category: 'noise',
        description: 'Simplex noise for efficient, high-quality terrain',
        gpuTypeId: 13,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Noise frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed (0 = random)' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const divisor = (Math.min(options.xSegments, options.ySegments) + 1) * 2 / (frequency as number);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                heightmap[j * xl + i] += noise.simplex(i / divisor, j / divisor) * range;
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

generatorRegistry.register(new SimplexGenerator());
