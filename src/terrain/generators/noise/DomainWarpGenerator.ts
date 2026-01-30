/**
 * Domain Warp terrain generator.
 * Applies FBM twice for organic, warped terrain features.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class DomainWarpGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'domain-warp',
        name: 'Domain Warp',
        category: 'noise',
        description: 'FBM with domain warping for organic terrain features',
        gpuTypeId: 1,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'warpStrength', type: 'number', default: 0.5, min: 0.1, max: 2.0, description: 'Warp intensity' },
            { name: 'octaves', type: 'number', default: 8, min: 1, max: 16, step: 1, description: 'FBM octaves' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            warpStrength = 0.5,
            octaves = 8,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i * scale;
                const y = j * scale;

                // First FBM pass for warp offset
                const warpX = noise.fbm(x, y, octaves as number, 0.5, 2.0) * (warpStrength as number);
                const warpY = noise.fbm(x + 100, y + 100, octaves as number, 0.5, 2.0) * (warpStrength as number);

                // Second FBM pass with warped coordinates
                const value = noise.fbm(x + warpX, y + warpY, octaves as number, 0.5, 2.0);

                heightmap[j * xl + i] += value * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            warpStrength: 0.5,
            octaves: 8,
            seed: 0
        };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainDomainWarpStrength: 1.5 });
    }
}

generatorRegistry.register(new DomainWarpGenerator());
