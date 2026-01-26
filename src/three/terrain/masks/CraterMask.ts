import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';
import { crater_mask } from '../types/terrain-noise-utils';

/**
 * Crater mask (ID: 10)
 * Matches initial-frag.glsl: crater_mask(cpos * 1.1 * crater_density)
 * Note: This mask requires cpos and craterDensity from terrainRandom
 */
export class CraterMask extends BaseMask {
  getName(): string {
    return 'CraterMask';
  }

  getDisplayName(): string {
    return 'Craters';
  }

  getId(): number {
    return 10;
  }

  apply(height: number, options: MaskOptions): number {
    if (!options.cpos || !options.terrainRandom) {
      console.warn('[CraterMask] Missing cpos or terrainRandom, returning 1.0');
      return 1.0;
    }
    
    // Match shader exactly:
    // float crater_density = clamp(u_CraterDensity, 0.6, 1.8);
    // float crater = crater_mask(cpos * 1.1 * crater_density);
    // terrain_height *= crater;
    const craterDensity = options.terrainRandom.craterDensity || 1.0;
    const clampedCraterDensity = Math.max(0.6, Math.min(1.8, craterDensity));
    const crater = crater_mask(
      [options.cpos[0] * 1.1 * clampedCraterDensity, options.cpos[1] * 1.1 * clampedCraterDensity],
      clampedCraterDensity
    );
    return crater;
  }
}
