/**
 * Canyon terrain generator.
 * Creates drainage canyon networks carved into terrain.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class CanyonGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'canyons',
        name: 'Canyons',
        category: 'geographic',
        description: 'Drainage canyon networks carved into terrain',
        gpuTypeId: 9,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Base terrain frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'canyonDepth', type: 'number', default: 0.6, min: 0.1, max: 1.0, description: 'Canyon depth' },
            { name: 'canyonWidth', type: 'number', default: 0.15, min: 0.05, max: 0.5, description: 'Canyon width' },
            { name: 'branchiness', type: 'number', default: 0.5, min: 0.1, max: 1.0, description: 'How much canyons branch' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            canyonDepth = 0.6,
            canyonWidth = 0.15,
            branchiness = 0.5,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i / (xl - 1);
                const y = j / (yl - 1);

                // Base plateau terrain
                let h = noise.fbm(i * scale, j * scale, 4, 0.5, 2.0) * 0.3 + 0.5;

                // Canyon mask using warped ridged noise
                const warpX = noise.perlin(x * 3, y * 3) * 0.3;
                const warpY = noise.perlin(x * 3 + 100, y * 3 + 100) * 0.3;

                const canyonNoise = noise.ridged(
                    (x + warpX) * 4 * (branchiness as number + 0.5),
                    (y + warpY) * 4 * (branchiness as number + 0.5),
                    4, 0.5, 2.0
                );

                // Convert to canyon (invert and threshold)
                const canyonMask = Math.max(0, 1 - canyonNoise * 2);

                // Smooth canyon walls
                const width = canyonWidth as number;
                let canyonCarve = 0;
                if (canyonMask > 1 - width) {
                    const t = (canyonMask - (1 - width)) / width;
                    // Smooth step for canyon walls
                    canyonCarve = t * t * (3 - 2 * t);
                }

                // Carve canyon
                h -= canyonCarve * (canyonDepth as number);

                heightmap[j * xl + i] += h * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            canyonDepth: 0.6,
            canyonWidth: 0.15,
            branchiness: 0.5,
            seed: 0
        };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 6, canyonDepth: 0.6 });
    }
}

generatorRegistry.register(new CanyonGenerator());
