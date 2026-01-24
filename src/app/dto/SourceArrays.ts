import { vec2 } from 'gl-matrix';
import { WaterSource, MAX_WATER_SOURCES } from '../../utils/water-sources';
import { LavaSource, MAX_LAVA_SOURCES } from '../../utils/lava-sources';

/**
 * Encapsulates water and lava source arrays with packing methods for shader uniforms
 */
export class SourceArrays {
  private _waterSources: WaterSource[] = [];
  private _lavaSources: LavaSource[] = [];

  constructor(
    waterSources: WaterSource[] = [],
    lavaSources: LavaSource[] = []
  ) {
    this._waterSources = [...waterSources];
    this._lavaSources = [...lavaSources];
  }

  get waterSources(): readonly WaterSource[] {
    return this._waterSources;
  }

  get lavaSources(): readonly LavaSource[] {
    return this._lavaSources;
  }

  getWaterSourceCount(): number {
    return this._waterSources.length;
  }

  getLavaSourceCount(): number {
    return this._lavaSources.length;
  }

  setWaterSources(sources: WaterSource[]): void {
    this._waterSources = [...sources];
  }

  setLavaSources(sources: LavaSource[]): void {
    this._lavaSources = [...sources];
  }

  /**
   * Packs water sources into uniform arrays for shader consumption
   * Returns arrays of positions, sizes, and strengths
   */
  packWaterSourcesForShader(): {
    positions: Float32Array;
    sizes: Float32Array;
    strengths: Float32Array;
    count: number;
  } {
    const positions = new Float32Array(MAX_WATER_SOURCES * 2); // vec2 per source
    const sizes = new Float32Array(MAX_WATER_SOURCES);
    const strengths = new Float32Array(MAX_WATER_SOURCES);

    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
      if (i < this._waterSources.length) {
        const source = this._waterSources[i];
        positions[i * 2] = source.position[0];
        positions[i * 2 + 1] = source.position[1];
        sizes[i] = source.size;
        strengths[i] = source.strength;
      } else {
        // Zero out unused slots
        positions[i * 2] = 0;
        positions[i * 2 + 1] = 0;
        sizes[i] = 0;
        strengths[i] = 0;
      }
    }

    return {
      positions,
      sizes,
      strengths,
      count: this._waterSources.length,
    };
  }

  /**
   * Packs lava sources into uniform arrays for shader consumption
   * Returns arrays of positions, sizes, and strengths
   */
  packLavaSourcesForShader(): {
    positions: Float32Array;
    sizes: Float32Array;
    strengths: Float32Array;
    count: number;
  } {
    const positions = new Float32Array(MAX_LAVA_SOURCES * 2); // vec2 per source
    const sizes = new Float32Array(MAX_LAVA_SOURCES);
    const strengths = new Float32Array(MAX_LAVA_SOURCES);

    for (let i = 0; i < MAX_LAVA_SOURCES; i++) {
      if (i < this._lavaSources.length) {
        const source = this._lavaSources[i];
        positions[i * 2] = source.position[0];
        positions[i * 2 + 1] = source.position[1];
        sizes[i] = source.size;
        strengths[i] = source.strength;
      } else {
        // Zero out unused slots
        positions[i * 2] = 0;
        positions[i * 2 + 1] = 0;
        sizes[i] = 0;
        strengths[i] = 0;
      }
    }

    return {
      positions,
      sizes,
      strengths,
      count: this._lavaSources.length,
    };
  }
}
