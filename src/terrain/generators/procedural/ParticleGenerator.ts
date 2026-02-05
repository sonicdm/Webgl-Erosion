/**
 * Particle Deposition terrain generator.
 * Deposits particles that roll downhill and accumulate.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

export class ParticleGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'particles',
        name: 'Particle Deposition',
        category: 'procedural',
        description: 'Deposits particles that roll downhill and accumulate',
        gpuTypeId: 18,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.25, max: 10, description: 'Particle density (0.25 = archipelago, 2.5 = island)' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { frequency = 2.5, amplitude = 1.0 } = this.mergeParams(params);
        const { xl, yl } = this.getSize(options);

        const d = Math.sqrt(options.xSegments * options.xSegments + options.ySegments * options.ySegments);
        const iterations = d * (frequency as number) * 300;
        const displacement = this.getRange(options) * (amplitude as number) / iterations * 1000;

        let i = Math.floor(Math.random() * options.xSegments);
        let j = Math.floor(Math.random() * options.ySegments);
        let xDeviation = Math.random() * 0.2 - 0.1;
        let yDeviation = Math.random() * 0.2 - 0.1;

        for (let k = 0; k < iterations; k++) {
            this.deposit(heightmap, i, j, xl, yl, displacement);

            const dir = Math.random() * Math.PI * 2;

            if (k % 1000 === 0) {
                xDeviation = Math.random() * 0.2 - 0.1;
                yDeviation = Math.random() * 0.2 - 0.1;
            }

            if (k % 100 === 0) {
                i = Math.floor(
                    options.xSegments * (0.5 + xDeviation) +
                    Math.cos(dir) * Math.random() * options.xSegments * (0.5 - Math.abs(xDeviation))
                );
                j = Math.floor(
                    options.ySegments * (0.5 + yDeviation) +
                    Math.sin(dir) * Math.random() * options.ySegments * (0.5 - Math.abs(yDeviation))
                );
            }
        }
    }

    private deposit(g: Heightmap, i: number, j: number, xl: number, yl: number, displacement: number): void {
        const currentKey = j * xl + i;

        // Pick random neighbors and roll downhill
        for (let k = 0; k < 3; k++) {
            const r = Math.floor(Math.random() * 8);
            let ni = i, nj = j;

            switch (r) {
                case 0: ni++; break;
                case 1: ni--; break;
                case 2: nj++; break;
                case 3: nj--; break;
                case 4: ni++; nj++; break;
                case 5: ni++; nj--; break;
                case 6: ni--; nj++; break;
                case 7: ni--; nj--; break;
            }

            // Bounds check
            if (ni >= 0 && ni < xl && nj >= 0 && nj < yl) {
                const neighborKey = nj * xl + ni;
                // Roll to lower neighbor
                if (g[neighborKey] < g[currentKey]) {
                    this.deposit(g, ni, nj, xl, yl, displacement);
                    return;
                }
            } else if (Math.random() < 0.2) {
                // Deposit on edge with small probability
                g[currentKey] += displacement;
                return;
            }
        }

        g[currentKey] += displacement;
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.5, terrainOctaves: 6 });
    }
}

generatorRegistry.register(new ParticleGenerator());
