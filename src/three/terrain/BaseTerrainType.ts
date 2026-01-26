import { TerrainGenerationOptions } from './TerrainGenerationOptions';

/**
 * Base abstract class for all terrain types
 * Provides unified interface for shader-based terrain types (0-11) and THREE.Terrain method wrappers
 * 
 * CRITICAL: Shader-based terrain types (0-11) must match `src/shaders/terrain/initial-frag.glsl` exactly
 */
export abstract class BaseTerrainType {
  /**
   * Unique identifier for the terrain type (e.g., "OrdinaryFBM", "DiamondSquare")
   */
  abstract getName(): string;
  
  /**
   * Human-readable display name for UI (e.g., "Ordinary FBM", "Diamond Square")
   */
  abstract getDisplayName(): string;
  
  /**
   * Generate heightmap values into the provided array
   * 
   * @param zs - Float32Array or number[] of height values to modify in place
   * @param options - Standardized terrain generation options (all terrain types receive same structure)
   * 
   * The zs array is indexed as: zs[y * (xSegments+1) + x] for vertex at grid position (x, y)
   * Grid goes from (0,0) at top-left to (xSegments, ySegments) at bottom-right
   */
  abstract generateHeightmap(
    zs: Float32Array | number[],
    options: TerrainGenerationOptions
  ): void;
}
