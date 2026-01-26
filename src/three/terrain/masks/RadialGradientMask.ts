import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Radial gradient mask (ID: 5)
 * Matches initial-frag.glsl: 2.0 * radial_gradient_mask(uv)
 */
export class RadialGradientMask extends BaseMask {
  getName(): string {
    return 'RadialGradientMask';
  }

  getDisplayName(): string {
    return 'Radial Gradient';
  }

  getId(): number {
    return 5;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: radial_gradient_mask(uv)
    const dist = Math.sqrt((options.u - 0.5) ** 2 + (options.v - 0.5) ** 2);
    // 1.0 - smoothstep(0.0, 0.7, dist)
    const radial = 1.0 - Math.max(0.0, Math.min(1.0, dist / 0.7));
    // Match shader: terrain_height *= 2.0 * radial;
    return 2.0 * radial;
  }
}
