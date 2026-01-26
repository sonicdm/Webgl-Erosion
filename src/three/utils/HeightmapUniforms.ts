/**
 * Builds terrain material uniforms from HeightmapSource (H7 unit/scale unification).
 * Single encoding = RAW: stored = worldHeight * simres, decode scale = 1/simres.
 * All decode/size uniforms must come only from HeightmapSource via this builder.
 *
 * For MeshStandardMaterial/normalized displacement fallback:
 *   displacementScale = maxHeight - minHeight
 *   displacementBias = minHeight
 * Derive from the same min/max (source.minHeight, source.maxHeight).
 */

import type { HeightmapSource } from './HeightmapSource';

export interface HeightmapUniformsBlock {
  u_SimRes: { value: number };
  u_StoredHeightMin: { value: number };
  u_StoredHeightMax: { value: number };
  u_HeightDecodeScale: { value: number };
  u_TerrainSize?: { value: number };
  /** For MeshStandardMaterial displacement: displacementScale = maxHeight - minHeight */
  displacementScale?: number;
  /** For MeshStandardMaterial displacement: displacementBias = minHeight */
  displacementBias?: number;
}

export interface BuildHeightmapUniformsOptions {
  /** World-space terrain size (e.g. TerrainScale * 320). From same config as HeightmapSource when used. */
  terrainSize?: number;
}

/**
 * Builds uniform block from HeightmapSource. Fail fast if required values are missing.
 *
 * @param source - HeightmapSource (non-null when VTF path is used)
 * @param options - Optional terrainSize from the same config path
 * @returns Uniform block: u_SimRes, u_StoredHeightMin, u_StoredHeightMax, u_HeightDecodeScale; optionally u_TerrainSize, displacementScale, displacementBias
 */
export function buildHeightmapUniforms(
  source: HeightmapSource,
  options?: BuildHeightmapUniformsOptions
): HeightmapUniformsBlock {
  const block: HeightmapUniformsBlock = {
    u_SimRes: { value: source.simres },
    u_StoredHeightMin: { value: source.minHeight * source.simres },
    u_StoredHeightMax: { value: source.maxHeight * source.simres },
    u_HeightDecodeScale: { value: 1.0 / source.simres },
  };
  if (options?.terrainSize !== undefined) {
    block.u_TerrainSize = { value: options.terrainSize };
  }
  block.displacementScale = source.maxHeight - source.minHeight;
  block.displacementBias = source.minHeight;
  return block;
}
