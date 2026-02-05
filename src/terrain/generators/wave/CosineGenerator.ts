/**
 * Cosine wave terrain generator.
 * Creates terrain using overlapping cosine waves.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class CosineGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'cosine',
        name: 'Cosine Waves',
        category: 'wave',
        description: 'Terrain using overlapping cosine waves',
        gpuTypeId: 20,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Wave frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'phase', type: 'number', default: 0, min: 0, max: 6.28, description: 'Wave phase offset' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0, phase = 0, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const amp = this.getRange(options) * 0.5 * (amplitude as number);
        const freqScalar = (frequency as number) * Math.PI / (Math.min(options.xSegments, options.ySegments) + 1);
        const phaseOffset = seed === 0 ? Math.random() * Math.PI * 2 : (phase as number);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                const value = Math.cos(i * freqScalar + phaseOffset) + Math.cos(j * freqScalar + phaseOffset);
                heightmap[j * xl + i] += amp * value;
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, phase: 0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.5, terrainOctaves: 6 });
    }
}

generatorRegistry.register(new CosineGenerator());
