/**
 * Ridged noise terrain generator.
 * Creates sharp ridges and mountain-like features.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../../types';
import { NoiseGenerator } from '../../noise';

export class RidgeGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'ridge',
        name: 'Ridge Noise',
        category: 'noise',
        description: 'Ridged multifractal noise for sharp mountain ridges',
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'octaves', type: 'number', default: 8, min: 1, max: 16, step: 1, description: 'Number of octaves' },
            { name: 'persistence', type: 'number', default: 0.5, min: 0.1, max: 1.0, description: 'Amplitude falloff' },
            { name: 'lacunarity', type: 'number', default: 2.0, min: 1.0, max: 4.0, description: 'Frequency multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ],
        gpuTypeId: 4
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            octaves = 8,
            persistence = 0.5,
            lacunarity = 2.0,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const value = noise.ridged(
                    i * scale,
                    j * scale,
                    octaves as number,
                    persistence as number,
                    lacunarity as number
                );
                // Map from [0,1] to height range
                heightmap[j * xl + i] += (value - 0.5) * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            octaves: 8,
            persistence: 0.5,
            lacunarity: 2.0,
            seed: 0
        };
    }
}

generatorRegistry.register(new RidgeGenerator());
