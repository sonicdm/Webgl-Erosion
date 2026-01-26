/**
 * Standardized interface for mask parameters
 * All masks receive the same options structure
 * Individual implementations can ignore parameters they don't use
 */
export interface MaskOptions {
  u: number;              // UV coordinate [0, 1]
  v: number;              // UV coordinate [0, 1]
  currentHeight: number;  // Current height value before mask
  terrainRandom?: {       // For masks that need noise/random (crater, dune)
    seedOffset: [number, number];
    duneDir: [number, number];
    craterDensity: number;
    canyonDepth: number;
  };
  cpos?: [number, number]; // Position in noise space (for crater/dune masks)
}
