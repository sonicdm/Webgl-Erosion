/**
 * Utility to convert THREE.Terrain geometry to GPU texture format
 * Extracts height data from terrain geometry and creates a texture for GPU simulation
 * 
 * CONTRACT (must match shader exactly):
 * - THREE.Terrain generates world heights (e.g., -100 to 100) in Y coordinate
 * - We store as: storedHeight = worldHeight * simres
 * - Shader reads and divides: worldHeight = yval / u_SimRes (see terrain-vert.glsl line 59)
 * - This ensures: storedHeight / simres = worldHeight (round-trip is exact)
 * 
 * VERTEX COUNT CONTRACT:
 * - THREE.Terrain with segments = simres - 1 creates exactly simres x simres vertices
 * - We extract exactly simres x simres height values (one per vertex, no interpolation)
 * - Grid width = simres for exact match, or simres + 1 if THREE.Terrain created extra row/column
 */

import * as THREE from 'three';

/**
 * Extracts height values from THREE.Terrain geometry and converts to heightmap texture
 *
 * @param geometry - THREE.Terrain generated geometry (rotated so Y is up)
 * @param simres - Simulation resolution (width/height of texture)
 * @returns Float32Array containing height data in RGBA format (height in R channel)
 */
export function extractHeightmapFromGeometry(
  geometry: THREE.BufferGeometry,
  simres: number
): Float32Array {
  console.log('[Heightmap Extraction] ===== START EXTRACTION =====');
  console.log('[Heightmap Extraction] Input parameters:', {
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
  
  console.log('[Heightmap Extraction] Geometry info:', {
    vertexCount: vertexCount,
    expectedVerticesExact: expectedVerticesExact,
    expectedVerticesGrid: expectedVerticesGrid,
    positionArrayLength: positionArray.length,
    isExactMatch: vertexCount === expectedVerticesExact,
    isGridMatch: vertexCount === expectedVerticesGrid
  });
  
  if (vertexCount !== expectedVerticesExact && vertexCount !== expectedVerticesGrid) {
    console.warn(
      `[Heightmap Extraction] Vertex count mismatch: expected ${expectedVerticesExact} (exact) or ${expectedVerticesGrid} (grid), got ${vertexCount}`
    );
  }

  // THREE.Terrain creates terrain in XY plane (Z is height)
  // So we need to read from Z (index 2), not Y (index 1)
  const heightAxisIndex = 2;
  const heights = new Float32Array(simres * simres);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let zeroCount = 0;
  let outOfBoundsCount = 0;

  // Determine grid width based on actual vertex count
  // If we have exactly simres x simres vertices, gridWidth = simres
  // If we have (simres + 1) x (simres + 1) vertices, gridWidth = simres + 1
  const gridWidth = vertexCount === expectedVerticesExact ? simres : (simres + 1);
  
  console.log('[Heightmap Extraction] Starting extraction loop:', {
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
          console.warn(`[Heightmap Extraction] Vertex index out of bounds: ${vertexIndex} >= ${vertexCount} at row=${row}, col=${col}`);
        }
        continue;
      }

      const arrayIndex = vertexIndex * 3;
      if (arrayIndex + 2 >= positionArray.length) {
        outOfBoundsCount++;
        if (outOfBoundsCount <= 5) {
          console.warn(`[Heightmap Extraction] Array index out of bounds: ${arrayIndex + 2} >= ${positionArray.length} at row=${row}, col=${col}`);
        }
        continue;
      }

      const y = positionArray[arrayIndex + heightAxisIndex];
      const heightmapIndex = row * simres + col;
      // CONTRACT: Store world height * simres (shader divides by u_SimRes to get world height back)
      // This matches terrain-vert.glsl: (yval + sval + lval)/u_SimRes
      // where yval is the stored height from texture (storedHeight)
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
        console.log(`[Heightmap Extraction] ${isCorner ? 'CORNER' : 'EDGE'} sample: row=${row}, col=${col}, vertexIndex=${vertexIndex}, worldHeight=${y.toFixed(3)}, stored=${storedHeight.toFixed(1)}`);
      }
      
      // Debug: log only first sample to verify extraction
      if (heightmapIndex === 0) {
        console.log(`[Heightmap Extraction] First sample (row=${row}, col=${col}): worldHeight=${y.toFixed(3)}, storedHeight=${storedHeight.toFixed(3)}, vertexIndex=${vertexIndex}`);
      }
    }
  }
  
  console.log('[Heightmap Extraction] Extraction complete:', {
    extractedHeights: heights.length,
    worldHeightRange: { min: minHeight.toFixed(2), max: maxHeight.toFixed(2) },
    storedHeightRange: { min: (minHeight * simres).toFixed(2), max: (maxHeight * simres).toFixed(2) },
    zeroHeights: zeroCount,
    outOfBoundsCount: outOfBoundsCount,
    sampleHeights: {
      topLeft: { world: heights[0] / simres, stored: heights[0] },
      topRight: { world: heights[simres - 1] / simres, stored: heights[simres - 1] },
      center: { world: heights[Math.floor(simres * simres / 2)] / simres, stored: heights[Math.floor(simres * simres / 2)] },
      bottomLeft: { world: heights[(simres - 1) * simres] / simres, stored: heights[(simres - 1) * simres] },
      bottomRight: { world: heights[simres * simres - 1] / simres, stored: heights[simres * simres - 1] }
    }
  });

  const textureData = new Float32Array(simres * simres * 4);
  for (let i = 0; i < simres * simres; i++) {
    textureData[i * 4 + 0] = heights[i];
    textureData[i * 4 + 1] = 0.0;
    textureData[i * 4 + 2] = 0.0;
    textureData[i * 4 + 3] = 1.0;
  }
  
  console.log('[Heightmap Extraction] Texture data created:', {
    textureDataLength: textureData.length,
    expectedLength: simres * simres * 4,
    first16Values: Array.from(textureData.slice(0, 16)).map(v => v.toFixed(2))
  });
  console.log('[Heightmap Extraction] ===== EXTRACTION COMPLETE =====');

  return textureData;
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

  return texture;
}

/**
 * Uploads heightmap data to a render target
 */
export function uploadHeightmapToRenderTarget(
  renderer: THREE.WebGLRenderer,
  heightmapData: Float32Array,
  target: THREE.WebGLRenderTarget,
  fullscreenQuad: THREE.BufferGeometry,
  camera: THREE.OrthographicCamera
): void {
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
      fragColor = texture(u_Heightmap, uv);
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

  const mesh = new THREE.Mesh(fullscreenQuad, material);
  const scene = new THREE.Scene();
  scene.add(mesh);

  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  (renderer.getContext() as WebGL2RenderingContext).finish();
  renderer.setRenderTarget(null);

  material.dispose();
  sourceTexture.dispose();
}
