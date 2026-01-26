import * as THREE from 'three';

/**
 * Utility for GPU readback of heightmap textures
 * Reads small patches from FloatType textures and computes min/max statistics
 */
export class HeightmapReadbackUtil {
  /**
   * Reads a patch from a FloatType render target and computes min/max/range
   * 
   * @param renderer - THREE.WebGLRenderer (required for readback)
   * @param renderTarget - THREE.WebGLRenderTarget (must be FloatType)
   * @param simres - Simulation resolution
   * @param patchSize - Size of patch to read (default: 4x4)
   * @returns Promise with min/max/range and stats
   */
  static async readHeightmapMinMax(
    renderer: THREE.WebGLRenderer,
    renderTarget: THREE.WebGLRenderTarget,
    simres: number,
    patchSize: number = 4
  ): Promise<{ min: number; max: number; range: number; stats: any }> {
    if (!renderTarget) {
      throw new Error('[HeightmapReadback] Render target is required for readback');
    }

    // Read a small patch from the render target
    // Use the center of the texture to avoid edge artifacts
    const startX = Math.max(0, Math.floor((simres - patchSize) / 2));
    const startY = Math.max(0, Math.floor((simres - patchSize) / 2));
    const actualPatchSize = Math.min(patchSize, simres - startX, simres - startY);

    // Read pixels from render target (FloatType)
    const pixels = new Float32Array(actualPatchSize * actualPatchSize * 4);
    renderer.readRenderTargetPixels(renderTarget, startX, startY, actualPatchSize, actualPatchSize, pixels);

    // Compute min/max from red channel (height) with decode scale
    const decodeScale = 1.0 / simres;
    let min = Infinity;
    let max = -Infinity;
    let validSamples = 0;

    for (let i = 0; i < actualPatchSize * actualPatchSize; i++) {
      const storedHeight = pixels[i * 4]; // Red channel contains stored height
      if (Number.isFinite(storedHeight)) {
        // Decode: worldHeight = storedHeight * decodeScale
        const worldHeight = storedHeight * decodeScale;
        if (Number.isFinite(worldHeight)) {
          min = Math.min(min, worldHeight);
          max = Math.max(max, worldHeight);
          validSamples++;
        }
      }
    }

    const range = max - min;

    const stats = {
      width: actualPatchSize,
      height: actualPatchSize,
      decodeScale,
      min,
      max,
      range,
      simres,
      validSamples,
      startX,
      startY,
    };

    return { min, max, range, stats };
  }
}
