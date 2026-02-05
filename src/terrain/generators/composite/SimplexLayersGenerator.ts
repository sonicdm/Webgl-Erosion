/**
 * Simplex Layers terrain generator.
 * Pre-configured multi-pass using Simplex noise at multiple frequencies.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class SimplexLayersGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'simplex-layers',
        name: 'Simplex Layers',
        category: 'composite',
        description: 'Multi-layer Simplex noise at different frequencies',
        gpuTypeId: 23,
        params: [
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Overall height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    // Pre-configured layers: frequency, amplitude
    private readonly layers = [
        { frequency: 1.25, amplitude: 1.0 },
        { frequency: 2.5, amplitude: 0.5 },
        { frequency: 5, amplitude: 0.25 },
        { frequency: 10, amplitude: 0.125 },
        { frequency: 20, amplitude: 0.0625 }
    ];

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const baseRange = this.getRange(options) * 0.5 * (amplitude as number);
        const minDim = Math.min(options.xSegments, options.ySegments) + 1;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                let total = 0;

                for (const layer of this.layers) {
                    const divisor = minDim * 2 / layer.frequency;
                    const value = noise.simplex(i / divisor, j / divisor);
                    total += value * layer.amplitude;
                }

                heightmap[j * xl + i] += total * baseRange;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { amplitude: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 1.25, terrainOctaves: 6 });
    }
}

generatorRegistry.register(new SimplexLayersGenerator());
