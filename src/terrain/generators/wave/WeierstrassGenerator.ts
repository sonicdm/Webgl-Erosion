/**
 * Weierstrass function terrain generator.
 * Creates continuous but nowhere differentiable terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class WeierstrassGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'weierstrass',
        name: 'Weierstrass',
        category: 'wave',
        description: 'Continuous but fractal-like terrain using Weierstrass functions',
        gpuTypeId: 21,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'iterations', type: 'number', default: 20, min: 5, max: 50, step: 1, description: 'Number of iterations' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0, iterations = 20, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        // Random parameters for variation
        const rng = this.seededRandom(seed === 0 ? Math.random() * 65535 : seed as number);

        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const dir1 = rng() < 0.5 ? 1 : -1;
        const dir2 = rng() < 0.5 ? 1 : -1;
        const r11 = 0.5 + rng() * 1.0;
        const r12 = 0.5 + rng() * 1.0;
        const r13 = 0.025 + rng() * 0.10;
        const r14 = -1.0 + rng() * 2.0;
        const r21 = 0.5 + rng() * 1.0;
        const r22 = 0.5 + rng() * 1.0;
        const r23 = 0.025 + rng() * 0.10;
        const r24 = -1.0 + rng() * 2.0;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                let sum = 0;

                for (let k = 0; k < (iterations as number); k++) {
                    const x = Math.pow(1 + r11, -k) * Math.sin(Math.pow(1 + r12, k) * (i + 0.25 * Math.cos(j) + r14 * j) * r13);
                    const y = Math.pow(1 + r21, -k) * Math.sin(Math.pow(1 + r22, k) * (j + 0.25 * Math.cos(i) + r24 * i) * r23);
                    sum -= Math.exp(dir1 * x * x + dir2 * y * y);
                }

                heightmap[j * xl + i] += sum * range;
            }
        }
    }

    private seededRandom(seed: number): () => number {
        return () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, iterations: 20, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 1.0, terrainOctaves: 10 });
    }
}

generatorRegistry.register(new WeierstrassGenerator());
