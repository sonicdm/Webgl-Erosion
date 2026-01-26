import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Diagonal mask (ID: 7)
 * Matches initial-frag.glsl: 1.0 + diagonal_mask(uv) * 0.5 where diagonal_mask = abs(uv.x - uv.y)
 */
export class DiagonalMask extends BaseMask {
  getName(): string {
    return 'DiagonalMask';
  }

  getDisplayName(): string {
    return 'Diagonal';
  }

  getId(): number {
    return 7;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: diagonal_mask = abs(uv.x - uv.y)
    const diag = Math.abs(options.u - options.v);
    // Match shader: terrain_height *= 1.0 + diag * 0.5;
    return 1.0 + diag * 0.5;
  }
}
