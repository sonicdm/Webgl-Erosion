/**
 * textureFormatVTF — centralize RGBA32F + FloatType for Vertex Texture Fetch.
 * Replaces ad-hoc configureTextureForVTF and internal-format pokes in
 * TerrainSync, PingPongTarget, MRTRenderTarget, and createHeightmapTexture.
 */

import * as THREE from 'three';

const RGBA32F = 0x8814;

/**
 * Sets VTF-safe format on a single texture: FloatType, RGBAFormat, filter/wrap,
 * generateMipmaps false. If renderer is provided, also sets __webglTextureType,
 * __webglTextureFormat, __webglTextureInternalFormat on the renderer's
 * texture properties (so Three.js binds with RGBA32F, not normalized).
 */
export function ensureTextureFloat(
  texture: THREE.Texture,
  renderer?: THREE.WebGLRenderer | null
): void {
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  if (renderer) {
    const properties = (renderer as any).properties;
    if (properties) {
      const textureProperties = properties.get(texture);
      if (textureProperties) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        (textureProperties as any).__webglTextureType = gl.FLOAT;
        (textureProperties as any).__webglTextureFormat = gl.RGBA;
        (textureProperties as any).__webglTextureInternalFormat = gl.RGBA32F || RGBA32F;
      }
    }
  }
}

/**
 * Configures a texture for Vertex Texture Fetch (VTF).
 * Alias for ensureTextureFloat for call-sites that use this name.
 */
export function configureTextureForVTF(
  texture: THREE.Texture,
  renderer?: THREE.WebGLRenderer | null
): void {
  ensureTextureFloat(texture, renderer);
}

/**
 * Ensures a WebGLRenderTarget's texture uses FloatType and RGBAFormat.
 * When renderer is provided, also pokes __webgl* on the texture's properties
 * so the internal format is RGBA32F. Call after the target has been used
 * (so the texture exists in the renderer's properties) when possible.
 */
export function ensureRenderTargetFloat(
  renderTarget: THREE.WebGLRenderTarget,
  renderer?: THREE.WebGLRenderer | null
): void {
  ensureTextureFloat(renderTarget.texture, renderer);
}
