import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';
import { dune_mask } from '../types/terrain-noise-utils';

/**
 * Dune mask (ID: 11)
 * Matches initial-frag.glsl: dune_mask(cpos * 1.2)
 * Note: This mask requires cpos and duneDir from terrainRandom
 */
export class DuneMask extends BaseMask {
  getName(): string {
    return 'DuneMask';
  }

  getDisplayName(): string {
    return 'Dunes';
  }

  getId(): number {
    return 11;
  }

  apply(height: number, options: MaskOptions): number {
    if (!options.cpos || !options.terrainRandom) {
      console.warn('[DuneMask] Missing cpos or terrainRandom, returning 1.0');
      return 1.0;
    }
    
    // Match shader exactly: float dune = dune_mask(cpos * 1.2);
    // terrain_height *= dune;
    const duneDir = options.terrainRandom.duneDir || [1, 0];
    const dune = dune_mask([options.cpos[0] * 1.2, options.cpos[1] * 1.2], duneDir);
    return dune;
  }
}
