/**
 * TerrainRenderMode — CPU vs GPU VTF (Workstream H mode separation).
 *
 * - cpu: world-space heights, baked geometry or MeshStandardMaterial displacement.
 *   Use when WebGL2 or VTF is not available.
 * - gpu_vtf: RAW heightmap (stored = worldHeight * simres). All decode uniforms
 *   from HeightmapSource via HeightmapUniforms. Requires HeightmapSource.
 *
 * Fail-fast: no WebGL2 → use cpu; no HeightmapSource when gpu_vtf → refuse VTF
 * (use CPU-style fallback material).
 */

export type TerrainRenderMode = 'cpu' | 'gpu_vtf';

const MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8b4c;

/**
 * Resolves terrain render mode from WebGL2 capabilities.
 * - gpu_vtf when MAX_VERTEX_TEXTURE_IMAGE_UNITS > 0
 * - cpu otherwise
 */
export function resolveTerrainRenderMode(gl: WebGL2RenderingContext): TerrainRenderMode {
  const n = gl.getParameter(MAX_VERTEX_TEXTURE_IMAGE_UNITS) | 0;
  return n > 0 ? 'gpu_vtf' : 'cpu';
}
