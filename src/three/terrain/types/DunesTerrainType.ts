import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm, dune_mask } from './terrain-noise-utils';

/**
 * Dunes terrain type (ID: 8)
 * Matches initial-frag.glsl: (fbm(cpos * 0.6) * 0.35 + 0.65) * dune_mask(cpos * 1.2)
 */
export class DunesTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Dunes';
  }

  getDisplayName(): string {
    return 'Dunes';
  }

  generateHeightmap(zs: Float32Array | number[], options: TerrainGenerationOptions): void {
    const xSegments = options.xSegments;
    const ySegments = options.ySegments;
    const terrainScale = options.terrainScale;
    const timer = options.timer;
    const seedOffset = options.terrainRandom?.seedOffset || [0, 0];
    const duneDir = options.terrainRandom?.duneDir || [1, 0];
    
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
        
        // Match shader exactly:
        // float dune_base = fbm(cpos * 0.6) * 0.35 + 0.65;
        // terrain_height = dune_base * dune_mask(cpos * 1.2);
        const dune_base = fbm([cpos[0] * 0.6, cpos[1] * 0.6]) * 0.35 + 0.65;
        const terrain_height = dune_base * dune_mask([cpos[0] * 1.2, cpos[1] * 1.2], duneDir);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
