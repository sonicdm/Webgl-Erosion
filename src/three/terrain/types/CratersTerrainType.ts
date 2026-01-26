import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm, crater_mask } from './terrain-noise-utils';

/**
 * Craters terrain type (ID: 7)
 * Matches initial-frag.glsl: pow(fbm(cpos * 1.2), 2.2) * crater_mask(cpos * 1.1 * crater_density)
 */
export class CratersTerrainType extends BaseTerrainType {
  getName(): string {
    return 'Craters';
  }

  getDisplayName(): string {
    return 'Craters';
  }

  getDefaultParams() {
    return {
      steps: 4, // Craters use moderate octaves for base
      turbulent: false, // Craters are distinct features, not turbulent
      easing: 'EaseIn', // Craters benefit from easing for rim transitions
      smoothing: 'Gaussian 1.0,7', // Gaussian smoothing softens crater rims
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
    const craterDensity = options.terrainRandom?.craterDensity || 1.0;
    
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
        // float crater_base = pow(fbm(cpos * 1.2), 2.2);
        // float crater_density = clamp(u_CraterDensity, 0.6, 1.8);
        // terrain_height = crater_base * crater_mask(cpos * 1.1 * crater_density);
        const crater_base = Math.pow(fbm([cpos[0] * 1.2, cpos[1] * 1.2]), 2.2);
        const clampedCraterDensity = Math.max(0.6, Math.min(1.8, craterDensity));
        const terrain_height = crater_base * crater_mask([cpos[0] * 1.1 * clampedCraterDensity, cpos[1] * 1.1 * clampedCraterDensity], clampedCraterDensity);
        
        // Apply height scaling
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
