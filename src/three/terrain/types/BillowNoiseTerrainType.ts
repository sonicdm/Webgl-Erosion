import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { billow_noise } from './terrain-noise-utils';

/**
 * Billow Noise terrain type (ID: 5)
 * Matches initial-frag.glsl: billow_noise(cpos * 1.6)
 */
export class BillowNoiseTerrainType extends BaseTerrainType {
  getName(): string {
    return 'BillowNoise';
  }

  getDisplayName(): string {
    return 'Billow Noise';
  }

  generateHeightmap(zs: Float32Array | number[], options: TerrainGenerationOptions): void {
    const xSegments = options.xSegments;
    const ySegments = options.ySegments;
    const terrainScale = options.terrainScale;
    const timer = options.timer;
    const seedOffset = options.terrainRandom?.seedOffset || [0, 0];
    
    const xl = xSegments + 1;
    const yl = ySegments + 1;
    
    for (let y = 0; y < yl; y++) {
      for (let x = 0; x < xl; x++) {
        const idx = y * xl + x;
        const u = x / xSegments;
        const v = y / ySegments;
        
        // Calculate position with seed offset and timer (matching initial-frag.glsl exactly)
        const cpos: [number, number] = [
          1.5 * u * terrainScale + (Math.sin(timer / 3.0) + 2.1) + seedOffset[0],
          1.5 * v * terrainScale + (Math.cos(timer / 17.0) + 3.6) + seedOffset[1]
        ];
        
        // Match shader exactly: terrain_height = billow_noise(cpos * 1.6);
        const terrain_height = billow_noise([cpos[0] * 1.6, cpos[1] * 1.6]);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
