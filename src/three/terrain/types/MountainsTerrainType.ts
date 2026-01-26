import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { mountains } from './terrain-noise-utils';

/**
 * Mountains terrain type (ID: 10)
 * Matches initial-frag.glsl: mountains(cpos * 1.4)
 */
export class MountainsTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Mountains';
  }

  getDisplayName(): string {
    return 'Mountains';
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
        
        // Match shader exactly: terrain_height = mountains(cpos * 1.4);
        const terrain_height = mountains([cpos[0] * 1.4, cpos[1] * 1.4]);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
