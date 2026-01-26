import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Cross mask (ID: 8)
 * Matches initial-frag.glsl: 1.0 + cross_mask(uv) * 0.5
 */
export class CrossMask extends BaseMask {
  getName(): string {
    return 'CrossMask';
  }

  getDisplayName(): string {
    return 'Cross';
  }

  getId(): number {
    return 8;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: cross_mask(uv)
    const center = [0.5, 0.5];
    const d = [Math.abs(options.u - center[0]), Math.abs(options.v - center[1])];
    const width = 0.15;
    // max(smoothstep(width, 0.0, d.x), smoothstep(width, 0.0, d.y))
    const smoothstepX = Math.max(0.0, Math.min(1.0, 1.0 - d[0] / width));
    const smoothstepY = Math.max(0.0, Math.min(1.0, 1.0 - d[1] / width));
    const cross = Math.max(smoothstepX, smoothstepY);
    // Match shader: terrain_height *= 1.0 + cross * 0.5;
    return 1.0 + cross * 0.5;
  }
}
