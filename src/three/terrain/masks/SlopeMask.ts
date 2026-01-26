import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Slope mask (ID: 2)
 * Matches initial-frag.glsl: (uv.x + uv.y) * 1.0
 */
export class SlopeMask extends BaseMask {
  getName(): string {
    return 'SlopeMask';
  }

  getDisplayName(): string {
    return 'Slope';
  }

  getId(): number {
    return 2;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: terrain_height *= (uv.x + uv.y) * 1.0;
    return (options.u + options.v) * 1.0;
  }
}
