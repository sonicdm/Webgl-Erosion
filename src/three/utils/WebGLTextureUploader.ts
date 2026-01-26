/**
 * WebGLTextureUploader — encapsulates direct WebGL upload and Three.js
 * property access for heightmap/float textures. Hides (renderer as any).properties
 * and __webgl* pokes at call sites.
 *
 * Used by uploadHeightmap in terrain-heightmap-converter. On failure (e.g. no
 * __webglTexture) returns false; uploadHeightmap decides to throw or try a fallback.
 */

import * as THREE from 'three';

/**
 * Uploads Float32Array (RGBA) to a WebGL texture with RGBA32F internal format.
 * Sets texture.type=FloatType, texture.format=RGBAFormat, and
 * __webglTextureType/Format/InternalFormat on the renderer's texture properties.
 *
 * @param renderer - Three.js WebGL renderer
 * @param texture - Three.js texture (e.g. target.texture) to upload into
 * @param data - RGBA Float32Array (width*height*4)
 * @param width - texture width
 * @param height - texture height
 * @returns true on success; false if properties/textureProperties/__webglTexture missing
 */
export function uploadFloatRGBAToTexture(
  renderer: THREE.WebGLRenderer,
  texture: THREE.Texture,
  data: Float32Array,
  width: number,
  height: number
): boolean {
  const properties = (renderer as any).properties;
  if (!properties) return false;
  const textureProperties = properties.get(texture);
  if (!textureProperties?.__webglTexture) return false;

  const gl = renderer.getContext() as WebGL2RenderingContext;
  const webglTexture = textureProperties.__webglTexture;

  gl.bindTexture(gl.TEXTURE_2D, webglTexture);
  
  // Check for WebGL errors before upload
  const preError = gl.getError();
  if (preError !== gl.NO_ERROR) {
    console.warn(`[WebGLTextureUploader] Pre-upload WebGL error: ${preError}`);
    gl.getError(); // Clear the error
  }
  
  // CRITICAL: Always use texImage2D to ensure the texture is created with RGBA32F format
  // texSubImage2D requires the texture to already exist with the correct format,
  // but Three.js may have created it with a different format (e.g., RGBA8)
  // texImage2D will recreate the texture with the correct format
  let uploadSuccess = false;
  let uploadError: number | null = null;
  
  try {
    // Use texImage2D to create/recreate texture with RGBA32F format
    // This will work even if texture is attached to framebuffer (WebGL2 allows it)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    uploadError = gl.getError();
    if (uploadError === gl.NO_ERROR) {
      uploadSuccess = true;
      console.log(`[WebGLTextureUploader] Uploaded via texImage2D: ${width}x${height} RGBA32F texture data`);
    } else {
      console.error(`[WebGLTextureUploader] texImage2D failed with error ${uploadError} (${uploadError === gl.INVALID_OPERATION ? 'INVALID_OPERATION - texture may be attached to framebuffer' : 'OTHER'})`);
      
      // If texImage2D failed due to framebuffer attachment, try texSubImage2D as fallback
      // (but this will only work if texture format matches)
      if (uploadError === gl.INVALID_OPERATION) {
        console.warn(`[WebGLTextureUploader] Attempting texSubImage2D fallback...`);
        while (gl.getError() !== gl.NO_ERROR) {} // Clear errors
        
        try {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data);
          uploadError = gl.getError();
          if (uploadError === gl.NO_ERROR) {
            uploadSuccess = true;
            console.log(`[WebGLTextureUploader] Uploaded via texSubImage2D fallback: ${width}x${height} float texture data`);
          } else {
            console.error(`[WebGLTextureUploader] texSubImage2D fallback also failed: ${uploadError}`);
          }
        } catch (e) {
          console.error(`[WebGLTextureUploader] texSubImage2D fallback threw exception: ${e}`);
        }
      }
    }
  } catch (e) {
    console.error(`[WebGLTextureUploader] texImage2D threw exception: ${e}`);
  }
  
  if (!uploadSuccess) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    return false;
  }
  
  // Set texture parameters (must be done while texture is bound)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // Verify no errors after setting parameters
  const paramError = gl.getError();
  if (paramError !== gl.NO_ERROR) {
    console.error(`[WebGLTextureUploader] Error setting texture parameters: ${paramError}`);
  }
  
  gl.bindTexture(gl.TEXTURE_2D, null);

  texture.needsUpdate = false;
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  textureProperties.__webglInit = true;
  (textureProperties as any).__webglTextureType = gl.FLOAT;
  (textureProperties as any).__webglTextureFormat = gl.RGBA;
  (textureProperties as any).__webglTextureInternalFormat = gl.RGBA32F;

  return true;
}
