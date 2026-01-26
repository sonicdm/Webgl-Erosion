import { BaseMask } from '../BaseMask';
import { MaskOptions } from '../MaskOptions';

/**
 * No mask (ID: 0)
 * Returns 1.0 (no change to height)
 */
export class NoMask extends BaseMask {
  getName(): string {
    return 'NoMask';
  }

  getDisplayName(): string {
    return 'OFF';
  }

  getId(): number {
    return 0;
  }

  apply(height: number, options: MaskOptions): number {
    // No change
    return 1.0;
  }
}
