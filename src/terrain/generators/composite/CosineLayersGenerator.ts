/**
 * Cosine Layers terrain generator.
 * Pre-configured multi-pass using Cosine waves at multiple frequencies.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class CosineLayersGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'cosine-layers',
        name: 'Cosine Layers',
        category: 'composite',
        description: 'Multi-layer Cosine waves at different frequencies',
        gpuTypeId: 25,
        params: [
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Overall height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    // Pre-configured layers: frequency, amplitude
    private readonly layers = [
        { frequency: 2.5, amplitude: 1.0 },
        { frequency: 12, amplitude: 0.1 },
        { frequency: 15, amplitude: 0.05 },
        { frequency: 20, amplitude: 0.025 }
    ];

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0, seed = 0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const baseAmp = this.getRange(options) * 0.5 * (amplitude as number);
        const minDim = Math.min(options.xSegments, options.ySegments) + 1;

        // Random phase for each layer
        const rng = this.seededRandom(seed === 0 ? Math.random() * 65535 : seed as number);
        const phases = this.layers.map(() => rng() * Math.PI * 2);

        for (let i = 0; i < xl; i++) {
            for (let j = 0; j < yl; j++) {
                let total = 0;

                for (let l = 0; l < this.layers.length; l++) {
                    const layer = this.layers[l];
                    const freqScalar = layer.frequency * Math.PI / minDim;
                    const value = Math.cos(i * freqScalar + phases[l]) + Math.cos(j * freqScalar + phases[l]);
                    total += value * layer.amplitude;
                }

                heightmap[j * xl + i] += total * baseAmp;
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
        return { amplitude: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.5, terrainOctaves: 6 });
    }
}

generatorRegistry.register(new CosineLayersGenerator());
