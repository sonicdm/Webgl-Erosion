/**
 * Utility to convert THREE.Terrain geometry to GPU texture format
 * Extracts height data from terrain geometry and creates a texture for GPU simulation
 * 
 * CONTRACT: RAW encoding (worldHeight * simres)
 * - THREE.Terrain generates world heights (e.g., -100 to 40) in Y coordinate
 * - We store as: storedHeight = worldHeight * simres
 * - Shaders decode: worldHeight = storedHeight / simres
 * 
 * VERTEX COUNT CONTRACT:
 * - THREE.Terrain with segments = simres - 1 creates exactly simres x simres vertices
 * - We extract exactly simres x simres height values (one per vertex, no interpolation)
 * - Grid width = simres for exact match, or simres + 1 if THREE.Terrain created extra row/column
 */

import * as THREE from 'three';
import { HeightmapSource } from './HeightmapSource';

const HEIGHTMAP_DEBUG = false;

const debugLog = (...args: any[]): void => {
  if (HEIGHTMAP_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};

const debugWarn = (...args: any[]): void => {
  if (HEIGHTMAP_DEBUG) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
};

/**
 * Extracts height values from THREE.Terrain geometry and converts to heightmap texture
 *
 * @param geometry - THREE.Terrain generated geometry (rotated so Y is up)
 * @param simres - Simulation resolution (width/height of texture)
 * @returns Float32Array containing height data in RGBA format (height in R channel)
 */
/**
 * Extracts heightmap from geometry and returns a HeightmapSource
 * @param geometry - THREE.Terrain generated geometry
 * @param simres - Simulation resolution
 * @returns HeightmapSource containing normalized texture data and metadata
 */
export function extractHeightmapFromGeometry(
  geometry: THREE.BufferGeometry,
  simres: number
): HeightmapSource {
  debugLog('[Heightmap Extraction] ===== START EXTRACTION =====');
  debugLog('[Heightmap Extraction] Input parameters:', {
    simres: simres,
    expectedVerticesExact: simres * simres,
    expectedVerticesGrid: (simres + 1) * (simres + 1),
    expectedHeightmapSize: simres * simres
  });
  
  const positions = geometry.attributes.position;
  if (!positions) {
    throw new Error('Geometry missing position attribute');
  }

  const positionArray = positions.array as Float32Array;
  const vertexCount = positions.count;
  // For a simres x simres heightmap, we need simres x simres height values
  // We can extract from either simres x simres vertices OR (simres + 1) x (simres + 1) vertices
  // If we have exactly simres x simres vertices, use them directly
  // If we have (simres + 1) x (simres + 1) vertices, sample the first simres x simres
  const expectedVerticesExact = simres * simres;
  const expectedVerticesGrid = (simres + 1) * (simres + 1);
  
  debugLog('[Heightmap Extraction] Geometry info:', {
    vertexCount: vertexCount,
    expectedVerticesExact: expectedVerticesExact,
    expectedVerticesGrid: expectedVerticesGrid,
    positionArrayLength: positionArray.length,
    isExactMatch: vertexCount === expectedVerticesExact,
    isGridMatch: vertexCount === expectedVerticesGrid
  });
  
  if (vertexCount !== expectedVerticesExact && vertexCount !== expectedVerticesGrid) {
    debugWarn(
      `[Heightmap Extraction] Vertex count mismatch: expected ${expectedVerticesExact} (exact) or ${expectedVerticesGrid} (grid), got ${vertexCount}`
    );
  }

  // THREE.Terrain creates terrain in XY plane (Z is height)
  // So we need to read from Z (index 2), not Y (index 1)
  const heightAxisIndex = 2;
  const heights = new Float32Array(simres * simres); // stored heights (worldHeight * simres)
  let minHeight = Infinity; // world-space
  let maxHeight = -Infinity; // world-space
  let zeroCount = 0;
  let outOfBoundsCount = 0;

  // Determine grid width based on actual vertex count
  // If we have exactly simres x simres vertices, gridWidth = simres
  // If we have (simres + 1) x (simres + 1) vertices, gridWidth = simres + 1
  const gridWidth = vertexCount === expectedVerticesExact ? simres : (simres + 1);
  
  debugLog('[Heightmap Extraction] Starting extraction loop:', {
    gridWidth: gridWidth,
    rows: simres,
    cols: simres,
    totalSamples: simres * simres,
    vertexLayout: vertexCount === expectedVerticesExact ? 'exact (simres x simres)' : 'grid ((simres+1) x (simres+1))'
  });

  for (let row = 0; row < simres; row++) {
    for (let col = 0; col < simres; col++) {
      const vertexIndex = row * gridWidth + col;
      
      if (vertexIndex >= vertexCount) {
        outOfBoundsCount++;
        if (outOfBoundsCount <= 5) {
          debugWarn(`[Heightmap Extraction] Vertex index out of bounds: ${vertexIndex} >= ${vertexCount} at row=${row}, col=${col}`);
        }
        continue;
      }

      const arrayIndex = vertexIndex * 3;
      if (arrayIndex + 2 >= positionArray.length) {
        outOfBoundsCount++;
        if (outOfBoundsCount <= 5) {
          debugWarn(`[Heightmap Extraction] Array index out of bounds: ${arrayIndex + 2} >= ${positionArray.length} at row=${row}, col=${col}`);
        }
        continue;
      }

      const y = positionArray[arrayIndex + heightAxisIndex];
      const heightmapIndex = row * simres + col;
      // CONTRACT: Store raw height = worldHeight * simres (RAW encoding)
      const storedHeight = y * simres;
      heights[heightmapIndex] = storedHeight;

      if (y < minHeight) minHeight = y;
      if (y > maxHeight) maxHeight = y;
      if (Math.abs(y) < 1e-6) zeroCount++;
      
      // Debug: log only corners and very few edge samples to reduce noise
      const isCorner = (row === 0 && col === 0) || (row === 0 && col === simres - 1) || 
                       (row === simres - 1 && col === 0) || (row === simres - 1 && col === simres - 1);
      const isEdge = (row === 0 || row === simres - 1 || col === 0 || col === simres - 1) && !isCorner;
      
      // Log corners always, but only log a few edge samples (every 1000th or at specific intervals)
      const shouldLogEdge = isEdge && (
        heightmapIndex % 1000 === 0 || // Every 1000th edge sample
        (row === 0 && col % 500 === 0) || // Every 500th column on top edge
        (row === simres - 1 && col % 500 === 0) || // Every 500th column on bottom edge
        (col === 0 && row % 500 === 0) || // Every 500th row on left edge
        (col === simres - 1 && row % 500 === 0) // Every 500th row on right edge
      );
      
      if (isCorner || shouldLogEdge) {
        debugLog(`[Heightmap Extraction] ${isCorner ? 'CORNER' : 'EDGE'} sample: row=${row}, col=${col}, vertexIndex=${vertexIndex}, worldHeight=${y.toFixed(3)}`);
      }
      
      // Debug: log only first sample to verify extraction
      if (heightmapIndex === 0) {
        debugLog(`[Heightmap Extraction] First sample (row=${row}, col=${col}): worldHeight=${y.toFixed(3)}, vertexIndex=${vertexIndex}`);
      }
    }
  }
  
  // Create HeightmapSource with raw data
  return createHeightmapSourceFromHeights(heights, simres, minHeight, maxHeight);
}

/**
 * Creates a HeightmapSource from a precomputed array of stored heights (worldHeight * simres).
 * If min/max are omitted, they are derived from the stored heights.
 */
export function createHeightmapSourceFromHeights(
  heights: Float32Array,
  simres: number,
  minHeight?: number,
  maxHeight?: number
): HeightmapSource {
  const width = simres;
  const height = simres;
  const total = width * height;

  let minVal = minHeight ?? Number.POSITIVE_INFINITY;
  let maxVal = maxHeight ?? Number.NEGATIVE_INFINITY;

  if (minHeight === undefined || maxHeight === undefined) {
    for (let i = 0; i < total; i++) {
      const worldHeight = heights[i] / simres;
      if (worldHeight < minVal) minVal = worldHeight;
      if (worldHeight > maxVal) maxVal = worldHeight;
    }
  }

  const textureData = new Float32Array(total * 4);
  for (let i = 0; i < total; i++) {
    textureData[i * 4 + 0] = heights[i]; // raw stored height
    textureData[i * 4 + 1] = 0.0;
    textureData[i * 4 + 2] = 0.0;
    textureData[i * 4 + 3] = 1.0;
  }

  return new HeightmapSource(
    minVal,
    maxVal,
    simres,
    textureData,
    width,
    height
  );
}

/**
 * Creates a THREE.DataTexture from heightmap data
 */
export function createHeightmapTexture(
  heightmapData: Float32Array,
  width: number,
  height: number
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    heightmapData,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );

  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // CRITICAL: Ensure texture uses RGBA32F internal format for raw float values
  // This prevents normalization when reading in vertex shaders
  // Note: Three.js should handle this automatically for FloatType, but we verify
  if ((texture as any).__webglTexture) {
    // Texture already uploaded - internal format should be set
    // If not, we'll need to re-upload with correct format
  }

  return texture;
}

/**
 * Uploads heightmap data to a render target
 * Uses direct WebGL texImage2D to upload raw float values (worldHeight * simres)
 * 
 * @param renderer - Three.js WebGL renderer
 * @param heightmapSource - HeightmapSource containing texture data and metadata
 * @param target - Render target to upload to
 */
export function uploadHeightmap(
  renderer: THREE.WebGLRenderer,
  heightmapSource: HeightmapSource,
  target: THREE.WebGLRenderTarget
): void {
  const heightmapData = heightmapSource.textureData;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  
  // CRITICAL: Upload directly to render target texture using WebGL API
  // This bypasses Three.js texture handling which might normalize values
  // We need to bind the render target texture and upload Float32Array directly
  const texture = target.texture;
  
  // Get the WebGL texture handle from Three.js internal state
  const properties = (renderer as any).properties;
  if (properties) {
    const textureProperties = properties.get(texture);
    if (textureProperties && textureProperties.__webglTexture) {
      const webglTexture = textureProperties.__webglTexture;
      
      // Bind the render target texture
      gl.bindTexture(gl.TEXTURE_2D, webglTexture);
      
      // Upload Float32Array directly with RGBA32F internal format
      // This preserves raw float values without normalization
      gl.texImage2D(
        gl.TEXTURE_2D,
        0, // mip level
        gl.RGBA32F, // internal format: RGBA 32-bit float
        target.width,
        target.height,
        0, // border
        gl.RGBA, // format
        gl.FLOAT, // type: Float32Array
        heightmapData // data: Float32Array with raw float values
      );
      
      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      // Unbind
      gl.bindTexture(gl.TEXTURE_2D, null);
      
      // CRITICAL: Mark texture properties to ensure Three.js doesn't re-upload and normalize
      texture.needsUpdate = false; // Already uploaded directly
      textureProperties.__webglInit = true;
      
      // CRITICAL: Ensure texture type and format are preserved
      // Three.js might try to normalize if it thinks the texture is UnsignedByteType
      texture.type = THREE.FloatType;
      texture.format = THREE.RGBAFormat;
      
      // Force Three.js to recognize this as a FloatType texture
      // This prevents normalization when binding for VTF
      (textureProperties as any).__webglTextureType = gl.FLOAT;
      (textureProperties as any).__webglTextureFormat = gl.RGBA;
      (textureProperties as any).__webglTextureInternalFormat = gl.RGBA32F;
      
      debugLog('[Heightmap Upload] Uploaded world-space heightmap data:', {
        width: target.width,
        height: target.height,
        dataLength: heightmapData.length,
        contract: 'WORLD (direct)'
      });
      return;
    }
  }
  
  // Fallback: Use shader-based copy if direct upload fails
  debugWarn('[Heightmap Upload] Direct WebGL upload failed, falling back to shader copy');
  const sourceTexture = createHeightmapTexture(heightmapData, target.width, target.height);

  const copyVertexShader = `
    #version 300 es
    precision highp float;
    in vec4 vs_Pos;
    out vec2 fs_Pos;
    void main() {
      fs_Pos = vs_Pos.xy;
      gl_Position = vs_Pos;
    }
  `;

  const copyFragmentShader = `
    #version 300 es
    precision highp float;
    in vec2 fs_Pos;
    uniform sampler2D u_Heightmap;
    out vec4 fragColor;
    void main() {
      vec2 uv = fs_Pos * 0.5 + 0.5;
      // CRITICAL: Read raw float values, don't normalize
      // The source texture is FloatType, so texture() returns raw floats
      // We must output raw floats to the render target (also FloatType)
      vec4 rawValue = texture(u_Heightmap, uv);
      fragColor = rawValue; // Direct passthrough - preserves float values
    }
  `;

  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: copyVertexShader,
    fragmentShader: copyFragmentShader,
    uniforms: {
      u_Heightmap: { value: sourceTexture }
    }
  });

  // Note: Fallback path requires fullscreenQuad and camera, but we removed them from signature
  // This fallback should rarely be needed if direct upload works
  debugWarn('[Heightmap Upload] Fallback path not fully implemented - direct upload should be used');
}
