import { getMaskRegistry } from './mask-registry';
import { MaskOptions } from './MaskOptions';
import { TerrainGenerationOptions } from './TerrainGenerationOptions';

/**
 * Utility to apply masks to heightmap arrays
 * Works for both shader terrain types and THREE.Terrain methods
 */
export class MaskApplicator {
  /**
   * Apply mask to entire heightmap array
   * 
   * @param heightmap - Float32Array or number[] of height values to modify in place
   * @param maskId - Numeric mask ID (0-11, excluding 9)
   * @param options - Terrain generation options (for UV calculation and terrainRandom)
   */
  static applyMask(
    heightmap: Float32Array | number[],
    maskId: number,
    options: TerrainGenerationOptions
  ): void {
    if (maskId === 0) {
      // No mask - no change
      return;
    }

    const registry = getMaskRegistry();
    const mask = registry.get(maskId);
    
    if (!mask) {
      console.warn(`[MaskApplicator] Mask ID ${maskId} not found, skipping mask application`);
      return;
    }

    const xSegments = options.xSegments;
    const ySegments = options.ySegments;
    const terrainScale = options.terrainScale;
    const timer = options.timer;
    const seedOffset = options.terrainRandom?.seedOffset || [0, 0];
    
    const xl = xSegments + 1;
    const yl = ySegments + 1;

    for (let y = 0; y < yl; y++) {
      for (let x = 0; x < xl; x++) {
        const idx = y * xl + x;
        const u = x / xSegments;
        const v = y / ySegments;
        
        // Calculate position in noise space (for masks that need it)
        const cpos: [number, number] = [
          1.5 * u * terrainScale + (Math.sin(timer / 3.0) + 2.1) + seedOffset[0],
          1.5 * v * terrainScale + (Math.cos(timer / 17.0) + 3.6) + seedOffset[1]
        ];
        
        // Build mask options
        const maskOptions: MaskOptions = {
          u,
          v,
          currentHeight: heightmap[idx],
          terrainRandom: options.terrainRandom,
          cpos: (maskId === 10 || maskId === 11) ? cpos : undefined, // Only crater/dune masks need cpos
        };
        
        // Apply mask multiplier
        const multiplier = mask.apply(heightmap[idx], maskOptions);
        heightmap[idx] = heightmap[idx] * multiplier;
      }
    }
  }
}
