import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Square mask (ID: 3)
 * Matches initial-frag.glsl: 2.0 * pow(square_mask(uv), 1.0)
 */
export class SquareMask extends BaseMask {
  getName(): string {
    return 'SquareMask';
  }

  getDisplayName(): string {
    return 'Square';
  }

  getId(): number {
    return 3;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: square_mask(uv)
    const center = [0.5, 0.5];
    const d = [Math.abs(options.u - center[0]), Math.abs(options.v - center[1])];
    const size = 0.4;
    const sq_mask = Math.max(0.0, 1.0 - Math.max(d[0], d[1]) / size);
    // Match shader: terrain_height *= 2.0 * pow(sq_mask, 1.0);
    return 2.0 * Math.pow(sq_mask, 1.0);
  }
}
