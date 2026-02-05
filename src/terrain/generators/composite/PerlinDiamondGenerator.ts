/**
 * Perlin + Diamond-Square terrain generator.
 * Combines Perlin noise with Diamond-Square for detailed terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class PerlinDiamondGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'perlin-diamond',
        name: 'Perlin + Diamond-Square',
        category: 'composite',
        description: 'Combines Perlin noise with Diamond-Square detail',
        gpuTypeId: 24,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Overall height multiplier' },
            { name: 'diamondWeight', type: 'number', default: 0.75, min: 0, max: 1.0, description: 'Diamond-Square contribution' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0, diamondWeight = 0.75, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const divisor = (Math.min(options.xSegments, options.ySegments) + 1) / (frequency as number);

        // First pass: Perlin
        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                heightmap[j * xl + i] += noise.perlin(i / divisor, j / divisor) * range;
            }
        }

        // Second pass: Diamond-Square
        this.addDiamondSquare(heightmap, options, range * (diamondWeight as number));
    }

    private addDiamondSquare(heightmap: Heightmap, options: TerrainOptions, range: number): void {
        const segments = this.ceilPowerOfTwo(Math.max(options.xSegments, options.ySegments) + 1);
        const size = segments + 1;

        const temp: number[][] = [];
        for (let i = 0; i <= segments; i++) {
            temp[i] = new Array(segments + 1).fill(0);
        }

        let smoothing = range;
        const xl = options.xSegments + 1;
        const yl = options.ySegments + 1;

        for (let l = segments; l >= 2; l /= 2) {
            const half = Math.round(l * 0.5);
            const whole = Math.round(l);
            smoothing /= 2;

            // Square step
            for (let x = 0; x < segments; x += whole) {
                for (let y = 0; y < segments; y += whole) {
                    const d = Math.random() * smoothing * 2 - smoothing;
                    const avg = (
                        temp[x][y] +
                        temp[x + whole][y] +
                        temp[x][y + whole] +
                        temp[x + whole][y + whole]
                    ) * 0.25;
                    temp[x + half][y + half] = avg + d;
                }
            }

            // Diamond step
            for (let x = 0; x < segments; x += half) {
                for (let y = (x + half) % l; y < segments; y += l) {
                    const d = Math.random() * smoothing * 2 - smoothing;
                    const avg = (
                        temp[(x - half + size) % size][y] +
                        temp[(x + half) % size][y] +
                        temp[x][(y + half) % size] +
                        temp[x][(y - half + size) % size]
                    ) * 0.25;
                    temp[x][y] = avg + d;
                    if (x === 0) temp[segments][y] = avg + d;
                    if (y === 0) temp[x][segments] = avg + d;
                }
            }
        }

        // Apply to heightmap
        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                heightmap[j * xl + i] += temp[i][j];
            }
        }
    }

    private ceilPowerOfTwo(value: number): number {
        return Math.pow(2, Math.ceil(Math.log2(value)));
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, diamondWeight: 0.75, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 6, terrainPersistence: 0.5 });
    }
}

generatorRegistry.register(new PerlinDiamondGenerator());
