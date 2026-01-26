import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm } from './terrain-noise-utils';

/**
 * Ordinary FBM terrain type (ID: 0)
 * Matches initial-frag.glsl: pow(fbm(cpos * 2.0) * 1.1, 3.0)
 * This is the default terrain type when no explicit type is selected
 */
export class OrdinaryFBMTerrainType extends BaseTerrainType {
  getName(): string {
    return 'OrdinaryFBM';
  }

  getDisplayName(): string {
    return 'Ordinary FBM';
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
        // Shader: cpos = 1.5 * uv * u_TerrainScale + vec2(1.f*sin(u_Time / 3.0) + 2.1, 1.0 * cos(u_Time/17.0)+3.6) + u_TerrainSeedOffset
        const cpos: [number, number] = [
          1.5 * u * terrainScale + (Math.sin(timer / 3.0) + 2.1) + seedOffset[0],
          1.5 * v * terrainScale + (Math.cos(timer / 17.0) + 3.6) + seedOffset[1]
        ];
        
        // Match shader exactly: float base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0);
        const base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0]) * 1.1, 3.0);
        const terrain_height = base_height;
        
        // Apply height scaling (matching shader: terrain_height *= u_TerrainHeight*120.0)
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
