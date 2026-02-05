/**
 * Dune terrain generator.
 * Creates wind-aligned sand dune patterns.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class DuneGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'dunes',
        name: 'Dunes',
        category: 'geographic',
        description: 'Wind-aligned sand dune terrain',
        gpuTypeId: 8,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Dune frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'windDirX', type: 'number', default: 1.0, min: -1.0, max: 1.0, description: 'Wind direction X' },
            { name: 'windDirY', type: 'number', default: 0.3, min: -1.0, max: 1.0, description: 'Wind direction Y' },
            { name: 'duneHeight', type: 'number', default: 0.4, min: 0.1, max: 1.0, description: 'Individual dune height' },
            { name: 'variation', type: 'number', default: 0.3, min: 0, max: 1.0, description: 'Random variation' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            windDirX = 1.0,
            windDirY = 0.3,
            duneHeight = 0.4,
            variation = 0.3,
            seed = 0
        } = this.mergeParams(params);

        const { xl, yl } = this.getSize(options);
        const noise = new NoiseGenerator(seed === 0 ? Math.random() : seed as number);
        const range = this.getRange(options) * (amplitude as number);

        // Normalize wind direction
        const windMag = Math.sqrt((windDirX as number) ** 2 + (windDirY as number) ** 2);
        const wdx = windMag > 0 ? (windDirX as number) / windMag : 1.0;
        const wdy = windMag > 0 ? (windDirY as number) / windMag : 0.0;

        const scale = (frequency as number) * 4;

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const x = i / (xl - 1);
                const y = j / (yl - 1);

                // Project position onto wind direction
                const windProj = x * wdx + y * wdy;

                // Perpendicular component for variation
                const perpProj = x * (-wdy) + y * wdx;

                // Add noise-based variation to wave
                const noiseOffset = noise.fbm(x * 3, y * 3, 4, 0.5, 2.0) * (variation as number);

                // Main dune waves (asymmetric sawtooth)
                const duneWave = windProj * scale + noiseOffset * 2;
                const dunePhase = duneWave - Math.floor(duneWave);

                // Asymmetric dune shape - gentle windward, steep leeward
                let duneShape: number;
                if (dunePhase < 0.7) {
                    // Gentle windward slope
                    duneShape = dunePhase / 0.7;
                } else {
                    // Steep leeward slope
                    duneShape = 1 - (dunePhase - 0.7) / 0.3;
                }

                // Secondary ripples perpendicular to wind
                const ripple = Math.sin(perpProj * scale * 3 + noise.perlin(x * 10, y * 10) * 2) * 0.1;

                // Combine
                const h = duneShape * (duneHeight as number) + ripple + noiseOffset * 0.2;

                heightmap[j * xl + i] += h * range;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            windDirX: 1.0,
            windDirY: 0.3,
            duneHeight: 0.4,
            variation: 0.3,
            seed: 0
        };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 6 });
    }
}

generatorRegistry.register(new DuneGenerator());
