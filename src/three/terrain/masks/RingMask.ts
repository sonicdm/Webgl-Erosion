import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * Ring mask (ID: 4)
 * Matches initial-frag.glsl: 2.0 * ring_mask(uv)
 */
export class RingMask extends BaseMask {
  getName(): string {
    return 'RingMask';
  }

  getDisplayName(): string {
    return 'Ring';
  }

  getId(): number {
    return 4;
  }

  apply(height: number, options: MaskOptions): number {
    // Match shader exactly: ring_mask(uv)
    const dist = Math.sqrt((options.u - 0.5) ** 2 + (options.v - 0.5) ** 2);
    const inner = 0.2;
    const outer = 0.4;
    // smoothstep(outer, inner, dist) * smoothstep(inner - 0.1, inner, dist)
    const smoothstep1 = Math.max(0.0, Math.min(1.0, (dist - outer) / (inner - outer)));
    const smoothstep2 = Math.max(0.0, Math.min(1.0, (dist - (inner - 0.1)) / 0.1));
    const ring = smoothstep1 * smoothstep2;
    // Match shader: terrain_height *= 2.0 * ring;
    return 2.0 * ring;
  }
}
