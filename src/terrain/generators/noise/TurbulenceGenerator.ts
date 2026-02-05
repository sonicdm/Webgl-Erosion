/**
 * Turbulence terrain generator.
 * Creates chaotic, turbulent terrain using absolute value noise.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../../types';
import { NoiseGenerator } from '../../noise';

export class TurbulenceGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'turbulence',
        name: 'Turbulence',
        category: 'noise',
        description: 'Chaotic, turbulent terrain using absolute value noise',
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'octaves', type: 'number', default: 8, min: 1, max: 16, step: 1, description: 'Number of octaves' },
            { name: 'warpStrength', type: 'number', default: 0.3, min: 0, max: 1.0, description: 'Domain warp intensity' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ],
        gpuTypeId: 6
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            octaves = 8,
            warpStrength = 0.3,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);
        const scale = (frequency as number) / Math.min(options.xSegments, options.ySegments);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i * scale;
                const y = j * scale;

                // Domain warp
                const warpX = noise.turbulence(x, y, 4, 0.5, 2.0) * (warpStrength as number);
                const warpY = noise.turbulence(x + 50, y + 50, 4, 0.5, 2.0) * (warpStrength as number);

                // Turbulence noise with warp
                const value = noise.turbulence(
                    x + warpX,
                    y + warpY,
                    octaves as number,
                    0.5,
                    2.0
                );

                heightmap[j * xl + i] += value * range * 0.5;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            octaves: 8,
            warpStrength: 0.3,
            seed: 0
        };
    }
}

generatorRegistry.register(new TurbulenceGenerator());
