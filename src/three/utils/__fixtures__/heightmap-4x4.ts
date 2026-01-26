/**
 * Deterministic 4×4 synthetic heightmap fixture for tests.
 * Shared by: upload/readback regression, HeightmapUniforms, decode/encode tests.
 * Prevents silent drift between encode/decode, uniform builder, and upload/readback.
 *
 * CONTRACT: RAW encoding (stored = worldHeight * simres).
 */

import { encodeRaw } from '../heightEncoding';
import { createHeightmapSourceFromHeights } from '../terrain-heightmap-converter';
import type { HeightmapSource } from '../HeightmapSource';

export const HEIGHTMAP_4X4_SIMRES = 4;

/** World-space heights, row-major 4×4. Non-uniform pattern. */
export const HEIGHTMAP_4X4_WORLD_HEIGHTS: number[] = [
  0, 1, 2, 3,
  1, 2, 3, 4,
  2, 3, 4, 5,
  3, 4, 5, 6,
];

export const HEIGHTMAP_4X4_EXPECTED_MIN = 0;
export const HEIGHTMAP_4X4_EXPECTED_MAX = 6;

/** Stored heights (worldHeight * simres) for RAW encoding. */
export const HEIGHTMAP_4X4_STORED: Float32Array = new Float32Array(
  HEIGHTMAP_4X4_WORLD_HEIGHTS.map((h) => encodeRaw(h, HEIGHTMAP_4X4_SIMRES))
);

/**
 * Builds a HeightmapSource from the 4×4 fixture.
 */
export function createHeightmapSource4x4(): HeightmapSource {
  return createHeightmapSourceFromHeights(
    HEIGHTMAP_4X4_STORED,
    HEIGHTMAP_4X4_SIMRES,
    HEIGHTMAP_4X4_EXPECTED_MIN,
    HEIGHTMAP_4X4_EXPECTED_MAX
  );
}
