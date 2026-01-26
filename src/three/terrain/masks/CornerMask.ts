import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Corner mask (ID: 6)
 * Matches initial-frag.glsl: 2.0 * corner_mask(uv) where corner_mask = (1.0 - uv.x) * (1.0 - uv.y)
 */
export class CornerMask extends BaseMask {
  getName(): string {
    return 'CornerMask';
  }

  getDisplayName(): string {
    return 'Corner';
  }

  getId(): number {
    return 6;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: corner_mask = (1.0 - uv.x) * (1.0 - uv.y)
    const corner = (1.0 - options.u) * (1.0 - options.v);
    // Match shader: terrain_height *= 2.0 * corner;
    return 2.0 * corner;
  }
}
