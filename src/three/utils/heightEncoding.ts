/**
 * Height Encoding/Decoding Utilities
 * 
 * CONTRACT: RAW encoding (worldHeight * simres)
 * - storedHeight = worldHeight * simres
 * - Shader decodes: worldHeight = storedHeight / simres
 * 
 * All height data is stored as raw floats (worldHeight * simres) in textures.
 */

/**
 * Encodes world height to stored height (raw float)
 * @param worldHeight - World-space height value
 * @param simres - Simulation resolution
 * @returns Stored height (worldHeight * simres)
 */
export function encodeRaw(worldHeight: number, simres: number): number {
  return worldHeight * simres;
}

/**
 * Decodes stored height back to world height
 * @param storedHeight - Stored height (worldHeight * simres)
 * @param simres - Simulation resolution
 * @returns World-space height value
 */
export function decodeRaw(storedHeight: number, simres: number): number {
  return storedHeight / simres;
}
