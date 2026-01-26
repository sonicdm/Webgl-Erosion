import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm, teR } from './terrain-noise-utils';

/**
 * Terrace terrain type (ID: 2)
 * Matches initial-frag.glsl: teR(base_height / 1.2) where base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0)
 */
export class TerraceTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Terrace';
  }

  getDisplayName(): string {
    return 'Terrace';
  }

  getDefaultParams() {
    return {
      steps: 6, // Maps to terrace levels - teR function creates stepped levels
      turbulent: false, // Terraces are smooth steps
      easing: 'Linear', // Terraces are uniform steps
      smoothing: 'Conservative 0.5', // Light smoothing helps terrace edges
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
        
        // Match shader exactly: 
        // float base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0);
        // terrain_height = teR(base_height / 1.2);
        const base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0]) * 1.1, 3.0);
        const terrain_height = teR(base_height / 1.2);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
