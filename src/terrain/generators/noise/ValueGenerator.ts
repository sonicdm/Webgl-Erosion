/**
 * Value noise terrain generator.
 * Uses white noise interpolation for varied terrain features.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';

/**
 * Helper function for white noise generation at different scales.
 */
function generateWhiteNoise(
    g: Heightmap,
    options: TerrainOptions,
    scale: number,
    segments: number,
    range: number,
    data: Float64Array
): void {
    if (scale > segments) return;

    const xl = segments;
    const yl = segments;
    const inc = Math.floor(segments / scale);

    // Generate random values at grid points
    for (let i = 0; i <= xl; i += inc) {
        for (let j = 0; j <= yl; j += inc) {
            const k = j * xl + i;
            data[k] = Math.random() * range;
        }
    }

    // Interpolate between grid points
    for (let i = 0; i <= xl; i += inc) {
        for (let j = 0; j <= yl; j += inc) {
            const lastX = Math.max(0, i - inc);
            const lastY = Math.max(0, j - inc);

            const t = data[j * xl + i] ?? 0;
            const l = data[j * xl + lastX] ?? t;
            const b = data[lastY * xl + i] ?? t;
            const c = data[lastY * xl + lastX] ?? t;

            for (let x = lastX; x < i; x++) {
                for (let y = lastY; y < j; y++) {
                    if (x === lastX && y === lastY) continue;
                    const z = y * xl + x;
                    if (z < 0) continue;

                    const px = (x - lastX) / inc;
                    const py = (y - lastY) / inc;
                    const r1 = px * b + (1 - px) * c;
                    const r2 = px * t + (1 - px) * l;
                    data[z] = py * r2 + (1 - py) * r1;
                }
            }
        }
    }

    // Apply to actual terrain
    const destXl = options.xSegments + 1;
    const destYl = options.ySegments + 1;
    for (let i = 0; i < destXl; i++) {
        for (let j = 0; j < destYl; j++) {
            const srcIndex = j * segments + i;
            const destIndex = j * destXl + i;
            if (srcIndex < data.length) {
                g[destIndex] += data[srcIndex];
            }
        }
    }
}

export class ValueGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'value',
        name: 'Value Noise',
        category: 'noise',
        description: 'Value noise using white noise interpolation at multiple scales',
        gpuTypeId: 19,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 20, description: 'Base frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'layers', type: 'number', default: 5, min: 1, max: 8, step: 1, description: 'Number of noise layers' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const { amplitude = 1.0, layers = 5 } = this.mergeParams(params);

        // Set the segment length to power of 2
        const segments = this.ceilPowerOfTwo(Math.max(options.xSegments, options.ySegments) + 1);
        const data = new Float64Array((segments + 1) * (segments + 1));
        const range = this.getRange(options) * (amplitude as number);

        // Layer white noise at different resolutions
        for (let i = 2; i < 2 + (layers as number); i++) {
            const scale = Math.pow(2, i);
            const layerRange = range * Math.pow(2, 2.4 - i * 1.2);
            generateWhiteNoise(heightmap, options, scale, segments, layerRange, data);
        }
    }

    private ceilPowerOfTwo(value: number): number {
        return Math.pow(2, Math.ceil(Math.log2(value)));
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, layers: 5, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 6 });
    }
}

generatorRegistry.register(new ValueGenerator());
