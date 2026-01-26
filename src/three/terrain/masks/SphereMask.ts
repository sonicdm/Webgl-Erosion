import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Sphere mask (ID: 1)
 * Matches initial-frag.glsl: 2.0 * pow(c_mask, 1.0) where c_mask = max(0.5 - distance(uv, 0.5), 0.0)
 */
export class SphereMask extends BaseMask {
  getName(): string {
    return 'SphereMask';
  }

  getDisplayName(): string {
    return 'Sphere';
  }

  getId(): number {
    return 1;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: c_mask = max(0.5 - distance(uv, vec2(0.5)), 0.0)
    const dist = Math.sqrt((options.u - 0.5) ** 2 + (options.v - 0.5) ** 2);
    const c_mask = Math.max(0.0, 0.5 - dist);
    // Match shader: terrain_height *= 2.0 * pow(c_mask, 1.0);
    return 2.0 * Math.pow(c_mask, 1.0);
  }
}
