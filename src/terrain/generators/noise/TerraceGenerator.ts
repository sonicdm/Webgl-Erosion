/**
 * Terrace terrain generator.
 * Creates stepped/terraced terrain with horizontal banding.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../../types';
import { NoiseGenerator } from '../../noise';

export class TerraceGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'terrace',
        name: 'Terrace',
        category: 'noise',
        description: 'Stepped/terraced terrain with horizontal banding',
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'terraces', type: 'number', default: 8, min: 2, max: 32, step: 1, description: 'Number of terrace levels' },
            { name: 'sharpness', type: 'number', default: 0.5, min: 0, max: 1.0, description: 'Edge sharpness (0=smooth, 1=sharp)' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ],
        gpuTypeId: 2
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            terraces = 8,
            sharpness = 0.5,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);
        const numTerraces = terraces as number;
        const sharp = sharpness as number;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                // Base noise value [0, 1]
                let value = (noise.fbm(i * scale, j * scale, 6, 0.5, 2.0) + 1) * 0.5;

                // Terrace function
                const scaled = value * numTerraces;
                const floor = Math.floor(scaled);
                const frac = scaled - floor;

                // Blend between sharp and smooth terraces
                let terraceFrac: number;
                if (sharp >= 1) {
                    terraceFrac = 0;
                } else if (sharp <= 0) {
                    terraceFrac = frac;
                } else {
                    // Smoothstep-based transition
                    const edge = 0.5 * (1 - sharp);
                    if (frac < edge) {
                        terraceFrac = 0;
                    } else if (frac > 1 - edge) {
                        terraceFrac = 1;
                    } else {
                        const t = (frac - edge) / (1 - 2 * edge);
                        terraceFrac = t * t * (3 - 2 * t);
                    }
                }

                value = (floor + terraceFrac) / numTerraces;

                // Map to height range
                heightmap[j * xl + i] += (value - 0.5) * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            terraces: 8,
            sharpness: 0.5,
            seed: 0
        };
    }
}

generatorRegistry.register(new TerraceGenerator());
