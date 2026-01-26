import { MaskOptions } from './MaskOptions';

/**
 * Base abstract class for all terrain masks
 * Provides unified interface for all mask types
 * 
 * CRITICAL: All mask implementations must match `src/shaders/terrain/initial-frag.glsl` exactly (lines 457-496)
 */
export abstract class BaseMask {
  /**
   * Unique identifier for the mask (e.g., "SphereMask", "CraterMask")
   */
  abstract getName(): string;
  
  /**
   * Human-readable display name for UI (e.g., "Sphere", "Crater")
   */
  abstract getDisplayName(): string;
  
  /**
   * Numeric ID for UI mapping (0-11, excluding 9)
   */
  abstract getId(): number;
  
  /**
   * Apply mask to height value
   * 
   * @param height - Current height value before mask
   * @param options - Standardized mask options
   * @returns Multiplier to apply to height (1.0 = no change)
   * 
   * Example: If mask returns 2.0, the height will be multiplied by 2.0
   */
  abstract apply(height: number, options: MaskOptions): number;
}
