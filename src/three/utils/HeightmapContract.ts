/**
 * HeightmapContract — encoding invariants and assertRawHeightmap.
 * Ensures heightmap textures use RAW (stored = worldHeight * simres) and
 * are configured with FloatType + RGBA32F so the GPU does not normalize.
 *
 * In dev (NODE_ENV !== 'production'): assertRawHeightmap throws on mismatch.
 * In production: no-op.
 */

import * as THREE from 'three';
import type { HeightmapSource } from './HeightmapSource';

/** Single encoding identifier: stored = worldHeight * simres, decode = 1/simres */
export const ENCODING = 'RAW_SIMRES' as const;

const RGBA32F = 0x8814;
const FLOAT = 0x1406;

/**
 * Asserts that a heightmap texture (or its metadata) is configured for raw float (no normalization).
 * Call after upload or configureTextureForVTF in dev.
 *
 * @param options.source - Optional HeightmapSource for encoding cross-check (e.g. simres > 0)
 * @param options.texture - Optional Three.js texture; checks texture.type === FloatType
 * @param options.textureType - Optional WebGL type (e.g. gl.FLOAT)
 * @param options.format - Optional WebGL format (e.g. gl.RGBA); not currently enforced
 * @param options.internalFormat - Optional WebGL internal format (e.g. gl.RGBA32F)
 * @param options.renderer - Optional; if provided with texture, used to resolve __webglTextureInternalFormat
 * @throws In dev, when texture.type !== FloatType or internalFormat !== RGBA32F
 */
export function assertRawHeightmap(options: {
  source?: HeightmapSource | null;
  texture?: THREE.Texture | null;
  textureType?: number;
  format?: number;
  internalFormat?: number;
  renderer?: THREE.WebGLRenderer | null;
}): void {
  const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  if (isProd) return;

  const { source, texture, textureType, internalFormat, renderer } = options;

  if (source != null) {
    if (typeof source.simres !== 'number' || source.simres < 1) {
      throw new Error(`[HeightmapContract] HeightmapSource.simres must be >= 1, got ${source.simres}`);
    }
  }

  if (texture != null) {
    if (texture.type !== THREE.FloatType) {
      throw new Error(
        `[HeightmapContract] Texture must use FloatType (${THREE.FloatType}) for RAW heightmap; got type=${texture.type} (UnsignedByteType would normalize)`
      );
    }
  }

  if (textureType !== undefined && textureType !== null) {
    if (textureType !== FLOAT) {
      throw new Error(
        `[HeightmapContract] textureType must be FLOAT (${FLOAT}) for RAW heightmap; got ${textureType}`
      );
    }
  }

  if (internalFormat !== undefined && internalFormat !== null) {
    if (internalFormat !== RGBA32F) {
      throw new Error(
        `[HeightmapContract] internalFormat must be RGBA32F (${RGBA32F}) for RAW heightmap; got ${internalFormat} (normalized format would clamp values)`
      );
    }
  }

  // If texture and renderer provided, try to check __webglTextureInternalFormat
  if (texture != null && renderer != null) {
    const properties = (renderer as any).properties;
    if (properties) {
      const textureProperties = properties.get(texture);
      const iff = textureProperties && (textureProperties as any).__webglTextureInternalFormat;
      if (iff !== undefined && iff !== null && iff !== RGBA32F) {
        throw new Error(
          `[HeightmapContract] Resolved __webglTextureInternalFormat must be RGBA32F (${RGBA32F}); got ${iff}`
        );
      }
    }
  }
}
