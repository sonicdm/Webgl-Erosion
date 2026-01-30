/**
 * Diamond-Square terrain generator.
 * Classic midpoint displacement algorithm for fractal terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class DiamondSquareGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'diamond-square',
        name: 'Diamond-Square',
        category: 'procedural',
        description: 'Classic midpoint displacement for fractal terrain',
        gpuTypeId: 14,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Roughness scale' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0 } = this.mergeParams(params);

        // Set segment length to power of 2
        const segments = this.ceilPowerOfTwo(Math.max(options.xSegments, options.ySegments) + 1);
        const size = segments + 1;

        // Initialize temporary heightmap
        const temp: number[][] = [];
        for (let i = 0; i <= segments; i++) {
            temp[i] = new Array(segments + 1).fill(0);
        }

        let smoothing = this.getRange(options) * (amplitude as number);
        const xl = options.xSegments + 1;
        const yl = options.ySegments + 1;

        // Diamond-square algorithm
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

                    // Edge wrapping
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
        return { frequency: 2.5, amplitude: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 8, terrainPersistence: 0.5 });
    }
}

generatorRegistry.register(new DiamondSquareGenerator());
