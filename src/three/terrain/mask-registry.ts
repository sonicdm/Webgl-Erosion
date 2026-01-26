import { BaseMask } from './BaseMask';
import { NoMask } from './masks/NoMask';
import { SphereMask } from './masks/SphereMask';
import { SlopeMask } from './masks/SlopeMask';
import { SquareMask } from './masks/SquareMask';
import { RingMask } from './masks/RingMask';
import { RadialGradientMask } from './masks/RadialGradientMask';
import { CornerMask } from './masks/CornerMask';
import { DiagonalMask } from './masks/DiagonalMask';
import { CrossMask } from './masks/CrossMask';
import { CraterMask } from './masks/CraterMask';
import { DuneMask } from './masks/DuneMask';

/**
 * Registry for all terrain masks
 * Maps numeric IDs (0-11, excluding 9) to mask instances
 */
export class MaskRegistry {
  private masks: Map<number, BaseMask> = new Map();

  constructor() {
    this.registerMasks();
  }

  /**
   * Register all available masks
   */
  private registerMasks(): void {
    this.masks.set(0, new NoMask());
    this.masks.set(1, new SphereMask());
    this.masks.set(2, new SlopeMask());
    this.masks.set(3, new SquareMask());
    this.masks.set(4, new RingMask());
    this.masks.set(5, new RadialGradientMask());
    this.masks.set(6, new CornerMask());
    this.masks.set(7, new DiagonalMask());
    this.masks.set(8, new CrossMask());
    // ID 9 is not used (reserved)
    this.masks.set(10, new CraterMask());
    this.masks.set(11, new DuneMask());
  }

  /**
   * Get mask by numeric ID
   */
  get(id: number): BaseMask | null {
    return this.masks.get(id) || null;
  }

  /**
   * Get all registered masks
   */
  getAll(): Map<number, BaseMask> {
    return new Map(this.masks);
  }
}

// Singleton instance
let registryInstance: MaskRegistry | null = null;

/**
 * Get the global mask registry instance
 */
export function getMaskRegistry(): MaskRegistry {
  if (!registryInstance) {
    registryInstance = new MaskRegistry();
  }
  return registryInstance;
}
