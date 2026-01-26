import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm, ridged_mf, canyon_mask } from './terrain-noise-utils';

/**
 * Canyons terrain type (ID: 9)
 * Matches initial-frag.glsl complex algorithm:
 * - canyon = canyon_mask(cpos * 1.1)
 * - plateau = fbm(cpos * 0.5) * 0.6 + 0.35
 * - ridge = ridged_mf(cpos * 0.9) * 0.22
 * - carve = (1.0 - canyon) * 1.15 * centerPull
 * - terrain_height = clamp(plateau + ridge - carve, 0.0, 1.2)
 */
export class CanyonsTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Canyons';
  }

  getDisplayName(): string {
    return 'Canyons';
  }

  generateHeightmap(zs: Float32Array | number[], options: TerrainGenerationOptions): void {
    const xSegments = options.xSegments;
    const ySegments = options.ySegments;
    const terrainScale = options.terrainScale;
    const timer = options.timer;
    const seedOffset = options.terrainRandom?.seedOffset || [0, 0];
    const canyonDepth = options.terrainRandom?.canyonDepth || 0.5;
    
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
        // float canyon = canyon_mask(cpos * 1.1);
        // float centerDist = distance(uv, vec2(0.5));
        // float centerBias = 1.0 - smoothstep(0.25, 0.6, centerDist);
        // float centerPull = mix(0.25, 1.0, centerBias);
        // float plateau = fbm(cpos * 0.5) * 0.6 + 0.35;
        // float ridge = ridged_mf(cpos * 0.9) * 0.22;
        // float carve = (1.0 - canyon) * 1.15 * centerPull;
        // terrain_height = clamp(plateau + ridge - carve, 0.0, 1.2);
        const canyon = canyon_mask([cpos[0] * 1.1, cpos[1] * 1.1], terrainScale, canyonDepth);
        const centerDist = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2);
        const centerBias = 1.0 - Math.min(1.0, Math.max(0.0, (centerDist - 0.25) / 0.35));
        const centerPull = 0.25 + centerBias * 0.75;
        const plateau = fbm([cpos[0] * 0.5, cpos[1] * 0.5]) * 0.6 + 0.35;
        const ridge = ridged_mf([cpos[0] * 0.9, cpos[1] * 0.9]) * 0.22;
        const carve = (1.0 - canyon) * 1.15 * centerPull;
        const terrain_height = Math.max(0.0, Math.min(1.2, plateau + ridge - carve));
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
