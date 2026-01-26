import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { billowy_ridges } from './terrain-noise-utils';

/**
 * Billowy Ridges terrain type (ID: 11)
 * Matches initial-frag.glsl: billowy_ridges(cpos * 1.3)
 */
export class BillowyRidgesTerrainType extends BaseTerrainType {
  getName(): string {
    return 'BillowyRidges';
  }

  getDisplayName(): string {
    return 'Billowy Ridges';
  }

  getDefaultParams() {
    return {
      steps: 6, // Billowy ridges use moderate octaves
      turbulent: false, // Ridges are directional
      easing: 'EaseOut', // Billowy ridges benefit from easing
      smoothing: 'Mean 1', // Light smoothing enhances billow effect
      size: 1024,
      ratio: 1.0,
      edges: {
        type: 'Box',
        direction: 'Normal',
        curve: 'Linear',
        distance: 256
      }
    };
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
        
        // Match shader exactly: terrain_height = billowy_ridges(cpos * 1.3);
        const terrain_height = billowy_ridges([cpos[0] * 1.3, cpos[1] * 1.3]);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
