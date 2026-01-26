import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { turbulence } from './terrain-noise-utils';

/**
 * Turbulence terrain type (ID: 6)
 * Matches initial-frag.glsl: turbulence(cpos * 1.5)
 */
export class TurbulenceTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Turbulence';
  }

  getDisplayName(): string {
    return 'Turbulence';
  }

  getDefaultParams() {
    return {
      steps: 7, // Turbulence uses many octaves
      turbulent: true, // Turbulence is inherently turbulent
      easing: 'EaseInOut', // Turbulence benefits from complex easing
      smoothing: 'None', // Keep turbulence sharp and chaotic
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
        
        // Match shader exactly: terrain_height = turbulence(cpos * 1.5);
        const terrain_height = turbulence([cpos[0] * 1.5, cpos[1] * 1.5]);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
