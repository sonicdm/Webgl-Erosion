/**
 * Billowy Ridge terrain generator.
 * Hybrid of billow and ridge noise for unique terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../../types';
import { NoiseGenerator } from '../../noise';

export class BillowyRidgeGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'billowy-ridges',
        name: 'Billowy Ridges',
        category: 'noise',
        description: 'Hybrid of billow and ridge noise for unique terrain',
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'ridgeBillowMix', type: 'number', default: 0.5, min: 0, max: 1.0, description: 'Ridge vs billow balance' },
            { name: 'octaves', type: 'number', default: 8, min: 1, max: 16, step: 1, description: 'Number of octaves' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ],
        gpuTypeId: 11
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            ridgeBillowMix = 0.5,
            octaves = 8,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);
        const mix = ridgeBillowMix as number;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i * scale;
                const y = j * scale;

                // Ridge noise
                const ridge = noise.ridged(x, y, octaves as number, 0.5, 2.0);

                // Billow noise
                const billow = noise.billow(x, y, octaves as number, 0.5, 2.0);

                // Blend based on mix parameter
                const value = ridge * mix + billow * (1 - mix);

                // Map from [0,1] to height range
                heightmap[j * xl + i] += (value - 0.5) * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            ridgeBillowMix: 0.5,
            octaves: 8,
            seed: 0
        };
    }
}

generatorRegistry.register(new BillowyRidgeGenerator());
