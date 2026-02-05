/**
 * Voronoi terrain generator.
 * Creates cellular patterns using Voronoi diagrams.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class VoronoiGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'voronoi',
        name: 'Voronoi',
        category: 'noise',
        description: 'Cellular terrain using Voronoi diagrams',
        gpuTypeId: 3,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Cell density' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'distanceType', type: 'select', default: 'euclidean', options: [
                { label: 'Euclidean', value: 'euclidean' },
                { label: 'Manhattan', value: 'manhattan' },
                { label: 'Chebyshev', value: 'chebyshev' }
            ], description: 'Distance metric' },
            { name: 'cellShape', type: 'select', default: 'f1', options: [
                { label: 'F1 (Distance to nearest)', value: 'f1' },
                { label: 'F2 (Distance to second)', value: 'f2' },
                { label: 'F2-F1 (Difference)', value: 'f2-f1' },
                { label: 'F1+F2 (Sum)', value: 'f1+f2' }
            ], description: 'Cell shape function' },
            { name: 'jitter', type: 'number', default: 1.0, min: 0, max: 1.0, description: 'Point randomness' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            distanceType = 'euclidean',
            cellShape = 'f1',
            jitter = 1.0,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) * 4;

        const distFunc = this.getDistanceFunction(distanceType as string);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = (i / (xl - 1)) * scale;
                const y = (j / (yl - 1)) * scale;

                const [f1, f2] = this.voronoi(x, y, distFunc, jitter as number, noise);

                let value: number;
                switch (cellShape) {
                    case 'f2':
                        value = f2;
                        break;
                    case 'f2-f1':
                        value = f2 - f1;
                        break;
                    case 'f1+f2':
                        value = (f1 + f2) * 0.5;
                        break;
                    case 'f1':
                    default:
                        value = f1;
                        break;
                }

                // Normalize and map to height range
                heightmap[j * xl + i] += (value - 0.5) * range;
            }
        }
    }

    private voronoi(
        x: number,
        y: number,
        distFunc: (dx: number, dy: number) => number,
        jitter: number,
        noise: NoiseGenerator
    ): [number, number] {
        const cellX = Math.floor(x);
        const cellY = Math.floor(y);

        let f1 = Infinity;
        let f2 = Infinity;

        // Check surrounding cells
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const cx = cellX + di;
                const cy = cellY + dj;

                // Random point in cell
                const rx = cx + 0.5 + (noise.perlin(cx * 127.1, cy * 311.7) * 0.5) * jitter;
                const ry = cy + 0.5 + (noise.perlin(cx * 269.5, cy * 183.3) * 0.5) * jitter;

                const dist = distFunc(x - rx, y - ry);

                if (dist < f1) {
                    f2 = f1;
                    f1 = dist;
                } else if (dist < f2) {
                    f2 = dist;
                }
            }
        }

        return [f1, f2];
    }

    private getDistanceFunction(type: string): (dx: number, dy: number) => number {
        switch (type) {
            case 'manhattan':
                return (dx, dy) => Math.abs(dx) + Math.abs(dy);
            case 'chebyshev':
                return (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy));
            case 'euclidean':
            default:
                return (dx, dy) => Math.sqrt(dx * dx + dy * dy);
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            distanceType: 'euclidean',
            cellShape: 'f1',
            jitter: 1.0,
            seed: 0
        };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 1.5, terrainOctaves: 4, terrainPersistence: 0.45 });
    }
}

generatorRegistry.register(new VoronoiGenerator());
