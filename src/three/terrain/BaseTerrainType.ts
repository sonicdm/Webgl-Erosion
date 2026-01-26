import { TerrainGenerationOptions } from './TerrainGenerationOptions';

/**
 * Base abstract class for all terrain types
 * Provides unified interface for shader-based terrain types (0-11) and THREE.Terrain method wrappers
 * 
 * CRITICAL: Shader-based terrain types (0-11) must match `src/shaders/terrain/initial-frag.glsl` exactly
 * 
 * IMPORTANT: Default parameter tables live in the terrain classes themselves (not in GUI code).
 * This is the single source of truth for GUI defaults. GUI pulls defaults from registry,
 * which queries each terrain type's getDefaultParams() method.
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
   * Get default parameters for this terrain type
   * These defaults are tuned to make each terrain type look its best
   * GUI pulls defaults from registry and applies them when terrain type is selected
   * 
   * @returns Object containing recommended default values for terrain parameters
   */
  abstract getDefaultParams(): {
    easing?: string;
    steps?: number;
    turbulent?: boolean;
    size?: number;
    ratio?: number;
    smoothing?: string;
    edges?: { type?: string; direction?: string; curve?: string; distance?: number };
    frequency?: number;
  };
  
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
