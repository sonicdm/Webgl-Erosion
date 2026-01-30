/**
 * Fault line terrain generator.
 * Repeatedly draws random lines and displaces terrain on each side.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class FaultGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'fault',
        name: 'Fault Lines',
        category: 'procedural',
        description: 'Creates terrain by repeatedly drawing fault lines',
        gpuTypeId: 15,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Number of fault iterations' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'smoothDistance', type: 'number', default: 1.0, min: 0.1, max: 5, description: 'Edge smoothing distance' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0, smoothDistance = 1.0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const d = Math.sqrt(options.xSegments * options.xSegments + options.ySegments * options.ySegments);
        const iterations = d * (frequency as number);
        const range = this.getRange(options) * 0.5 * (amplitude as number);
        const displacement = range / iterations;
        const smooth = Math.min(options.xSize / options.xSegments, options.ySize / options.ySegments) * (smoothDistance as number);

        for (let k = 0; k < iterations; k++) {
            // Random line through terrain
            const v = Math.random();
            const a = Math.sin(v * Math.PI * 2);
            const b = Math.cos(v * Math.PI * 2);
            const c = Math.random() * d - d * 0.5;

            for (let i = 0; i < xl; i++) {
                for (let j = 0; j < yl; j++) {
                    const distance = a * i + b * j - c;

                    if (distance > smooth) {
                        heightmap[j * xl + i] += displacement;
                    } else if (distance < -smooth) {
                        heightmap[j * xl + i] -= displacement;
                    } else {
                        // Smooth transition
                        heightmap[j * xl + i] += Math.cos(distance / smooth * Math.PI * 2) * displacement;
                    }
                }
            }
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, smoothDistance: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.5, terrainOctaves: 8 });
    }
}

generatorRegistry.register(new FaultGenerator());
