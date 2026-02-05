/**
 * Crater terrain generator.
 * Creates impact crater terrain with bowl-shaped depressions.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { NoiseGenerator } from '../../noise';

export class CraterGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'craters',
        name: 'Craters',
        category: 'geographic',
        description: 'Impact crater terrain with bowl-shaped depressions',
        gpuTypeId: 7,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Base terrain frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'craterDensity', type: 'number', default: 1.0, min: 0.3, max: 2.0, description: 'Crater density (higher = more craters)' },
            { name: 'craterDepth', type: 'number', default: 0.5, min: 0.1, max: 1.0, description: 'Crater depth multiplier' },
            { name: 'rimHeight', type: 'number', default: 0.2, min: 0, max: 0.5, description: 'Crater rim height' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            craterDensity = 1.0,
            craterDepth = 0.5,
            rimHeight = 0.2,
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

                // Base terrain using FBM
                let h = noise.fbm(i * scale, j * scale, 6, 0.5, 2.0) * 0.5;

                // Add crater influence
                const craterValue = this.craterMask(x, y, craterDensity as number, noise);

                // Crater bowl (negative) with rim (positive)
                const bowl = -craterValue * (craterDepth as number);
                const rim = Math.max(0, craterValue - 0.3) * (rimHeight as number) * 2;

                h += bowl + rim;

                heightmap[j * xl + i] += h * range;
            }
        }
    }

    private craterMask(x: number, y: number, density: number, noise: NoiseGenerator): number {
        // Voronoi-based crater placement
        const scale = 3.0 * density;
        const px = x * scale;
        const py = y * scale;

        const cellX = Math.floor(px);
        const cellY = Math.floor(py);

        let minDist = 1.0;

        // Check neighboring cells
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const cx = cellX + di;
                const cy = cellY + dj;

                // Random point in cell
                const rx = cx + 0.5 + noise.perlin(cx * 127.1, cy * 311.7) * 0.4;
                const ry = cy + 0.5 + noise.perlin(cx * 269.5, cy * 183.3) * 0.4;

                const dx = px - rx;
                const dy = py - ry;
                const dist = Math.sqrt(dx * dx + dy * dy);

                minDist = Math.min(minDist, dist);
            }
        }

        // Convert distance to crater shape
        const craterRadius = 0.4;
        if (minDist < craterRadius) {
            const t = minDist / craterRadius;
            // Smooth bowl shape
            return (1 - t * t) * (1 - t * t);
        }

        return 0;
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            craterDensity: 1.0,
            craterDepth: 0.5,
            rimHeight: 0.2,
            seed: 0
        };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainOctaves: 6, craterDensity: 1.2 });
    }
}

generatorRegistry.register(new CraterGenerator());
