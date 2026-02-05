/**
 * Mountain terrain generator.
 * Creates dramatic mountain peaks with ridged features.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap } from '../../types';
import { NoiseGenerator } from '../../noise';

export class MountainGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'mountains',
        name: 'Mountains',
        category: 'geographic',
        description: 'Dramatic mountain peaks with ridged features',
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Mountain frequency' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'peakSharpness', type: 'number', default: 0.7, min: 0.1, max: 1.0, description: 'How sharp the peaks are' },
            { name: 'ridgeStrength', type: 'number', default: 0.6, min: 0, max: 1.0, description: 'Ridge prominence' },
            { name: 'clustering', type: 'number', default: 0.5, min: 0, max: 1.0, description: 'Mountain clustering' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ],
        gpuTypeId: 10
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            peakSharpness = 0.7,
            ridgeStrength = 0.6,
            clustering = 0.5,
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

                // Base terrain with FBM
                const base = noise.fbm(x, y, 4, 0.5, 2.0) * 0.3;

                // Ridged multifractal for mountain ridges
                const ridge = noise.ridged(x * 0.7, y * 0.7, 6, 0.5, 2.0);

                // Domain-warped ridges for more organic feel
                const warpX = noise.perlin(x * 0.5, y * 0.5) * 0.5;
                const warpY = noise.perlin(x * 0.5 + 100, y * 0.5 + 100) * 0.5;
                const warpedRidge = noise.ridged(x * 0.7 + warpX, y * 0.7 + warpY, 6, 0.5, 2.0);

                // Blend ridges
                const ridgeBlend = ridge * (1 - (ridgeStrength as number)) + warpedRidge * (ridgeStrength as number);

                // Peak mask using Voronoi-like clustering
                const clusterScale = 2 + (1 - (clustering as number)) * 4;
                const peakMask = this.peakMask(i / (xl - 1), j / (yl - 1), clusterScale, noise);

                // Sharp peak transformation
                const sharp = peakSharpness as number;
                const peakShape = Math.pow(ridgeBlend, 1 + (1 - sharp) * 2);

                // Combine
                let h = base + peakShape * peakMask * 0.7;

                // Add some variation
                h += noise.perlin(x * 2, y * 2) * 0.05;

                heightmap[j * xl + i] += h * range;
            }
        }
    }

    private peakMask(x: number, y: number, scale: number, noise: NoiseGenerator): number {
        // Voronoi-based peak clustering
        const px = x * scale;
        const py = y * scale;

        const cellX = Math.floor(px);
        const cellY = Math.floor(py);

        let minDist = 1.0;

        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const cx = cellX + di;
                const cy = cellY + dj;

                const rx = cx + 0.5 + noise.perlin(cx * 127.1, cy * 311.7) * 0.4;
                const ry = cy + 0.5 + noise.perlin(cx * 269.5, cy * 183.3) * 0.4;

                const dx = px - rx;
                const dy = py - ry;
                const dist = Math.sqrt(dx * dx + dy * dy);

                minDist = Math.min(minDist, dist);
            }
        }

        // Invert and smooth for peak mask (peaks at cell centers)
        const t = Math.max(0, 1 - minDist * 2);
        return t * t * (3 - 2 * t);
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {
            frequency: 2.5,
            amplitude: 1.0,
            peakSharpness: 0.7,
            ridgeStrength: 0.6,
            clustering: 0.5,
            seed: 0
        };
    }
}

generatorRegistry.register(new MountainGenerator());
