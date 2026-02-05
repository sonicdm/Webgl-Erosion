/**
 * Hill Island terrain generator.
 * Like Hill but concentrates features toward center for island shapes.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, gpuDefaults, GeneratorControlDefaults } from '../../types';
import { applyInfluence, InfluenceShapes } from '../../TerrainMask';
import { BlendingMode, InfluenceShape } from '../../types';
import { EaseInStrong } from '../../easing';

export class HillIslandGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'hill-island',
        name: 'Hill Island',
        category: 'procedural',
        description: 'Hills concentrated toward center for island shapes',
        gpuTypeId: 17,
        params: [
            { name: 'frequency', type: 'number', default: 2.5, min: 0.1, max: 10, description: 'Hill density' },
            { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 2, description: 'Height multiplier' },
            { name: 'shape', type: 'select', default: 'Hill', options: [
                { label: 'Hill', value: 'Hill' },
                { label: 'Mesa', value: 'Mesa' },
                { label: 'Dome', value: 'Dome' },
                { label: 'Cone', value: 'Cone' },
                { label: 'Gaussian', value: 'Gaussian' }
            ], description: 'Shape of individual hills' },
            { name: 'concentration', type: 'number', default: 0.4, min: 0.1, max: 0.8, description: 'How concentrated toward center' },
            { name: 'seed', type: 'number', default: 0, min: 0, max: 65535, step: 1, description: 'Random seed' }
        ]
    };

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        const {
            frequency = 2.5,
            amplitude = 1.0,
            shape = 'Hill',
            concentration = 0.4
        } = this.mergeParams(params);

        const freq = (frequency as number) * 2;
        const numFeatures = freq * freq * 10;
        const heightRange = this.getRange(options) * (amplitude as number);
        const minHeight = heightRange / (freq * freq);
        const maxHeight = heightRange / freq;
        const smallerSide = Math.min(options.xSize, options.ySize);
        const minRadius = smallerSide / (freq * freq);
        const maxRadius = smallerSide / freq;

        const shapeFunc: InfluenceShape = InfluenceShapes[shape as string] || InfluenceShapes.Hill;

        for (let i = 0; i < numFeatures; i++) {
            const radius = Math.random() * (maxRadius - minRadius) + minRadius;
            const height = Math.random() * (maxHeight - minHeight) + minHeight;

            // Island distribution - concentrate toward center
            const theta = Math.random() * Math.PI * 2;
            const r = Math.random() * (concentration as number);
            const x = 0.5 + Math.cos(theta) * r;
            const y = 0.5 + Math.sin(theta) * r;

            applyInfluence(heightmap, options, shapeFunc, {
                x,
                y,
                radius,
                height,
                blending: BlendingMode.Additive,
                falloff: EaseInStrong
            });
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return { frequency: 2.5, amplitude: 1.0, shape: 'Hill', concentration: 0.4, seed: 0 };
    }

    getGPUControlDefaults(): GeneratorControlDefaults {
        return gpuDefaults({ terrainFrequency: 2.0, terrainOctaves: 6 });
    }
}

generatorRegistry.register(new HillIslandGenerator());
