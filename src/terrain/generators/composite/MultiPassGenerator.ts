/**
 * MultiPass terrain generator.
 * Combines multiple generators with configurable amplitudes and frequencies.
 */

import { TerrainGenerator, generatorRegistry } from '../../TerrainGenerator';
import { TerrainGeneratorMetadata, TerrainGeneratorParams, TerrainOptions, Heightmap, MultiPassConfig, ITerrainGenerator } from '../../types';

/**
 * Configuration for a single pass in multi-pass generation.
 */
export interface PassConfig {
    /** Generator ID or instance */
    generator: string | ITerrainGenerator;
    /** Amplitude multiplier (0-1) */
    amplitude?: number;
    /** Frequency override */
    frequency?: number;
    /** Additional parameters */
    params?: TerrainGeneratorParams;
}

export class MultiPassGenerator extends TerrainGenerator {
    readonly metadata: TerrainGeneratorMetadata = {
        id: 'multi-pass',
        name: 'Multi-Pass',
        category: 'composite',
        description: 'Combines multiple generators with configurable amplitudes',
        params: []  // Params are set via setPasses()
    };

    private passes: PassConfig[] = [];

    /**
     * Configure the passes for this generator.
     */
    setPasses(passes: PassConfig[]): void {
        this.passes = passes;
    }

    generate(heightmap: Heightmap, options: TerrainOptions, params?: TerrainGeneratorParams): void {
        if (this.passes.length === 0) {
            console.warn('MultiPassGenerator: No passes configured');
            return;
        }

        const range = options.maxHeight - options.minHeight;

        for (const pass of this.passes) {
            // Get generator
            let generator: ITerrainGenerator | undefined;
            if (typeof pass.generator === 'string') {
                generator = generatorRegistry.get(pass.generator);
                if (!generator) {
                    console.warn(`MultiPassGenerator: Generator "${pass.generator}" not found`);
                    continue;
                }
            } else {
                generator = pass.generator;
            }

            // Clone options with pass-specific settings
            const passOptions: TerrainOptions = { ...options };

            // Apply amplitude
            const amp = pass.amplitude ?? 1;
            const move = 0.5 * (range - range * amp);
            passOptions.maxHeight = options.maxHeight - move;
            passOptions.minHeight = options.minHeight + move;

            // Apply frequency if specified
            if (pass.frequency !== undefined) {
                passOptions.frequency = pass.frequency;
            }

            // Generate
            generator.generate(heightmap, passOptions, pass.params);
        }
    }

    getDefaultParams(): TerrainGeneratorParams {
        return {};
    }
}

// Don't auto-register - this is meant to be configured manually
// generatorRegistry.register(new MultiPassGenerator());
