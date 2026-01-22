/**
 * Utility to convert THREE.Terrain geometry to GPU texture format
 * Extracts height data from terrain geometry and creates a texture for GPU simulation
 */

import * as THREE from 'three';

/**
 * Extracts height values from THREE.Terrain geometry and converts to heightmap texture
 * 
 * @param geometry - THREE.Terrain generated geometry
 * @param simres - Simulation resolution (width/height of texture)
 * @returns Float32Array containing height data in RGBA format (height in R channel)
 */
export function extractHeightmapFromGeometry(
  geometry: THREE.BufferGeometry,
  simres: number
): Float32Array {
  const positions = geometry.attributes.position;
  if (!positions) {
    throw new Error('Geometry missing position attribute');
  }

  const positionArray = positions.array as Float32Array;
  const vertexCount = positions.count;
  
  // THREE.Terrain generates a plane with (xSegments+1) * (ySegments+1) vertices
  // We need to extract z-values (heights) and reshape to simres × simres
  const expectedVertices = (simres + 1) * (simres + 1);
  
  if (vertexCount !== expectedVertices) {
    console.warn(
      `Vertex count mismatch: expected ${expectedVertices} (for ${simres}x${simres} terrain), got ${vertexCount}`
    );
  }

  // Decide which axis actually stores height.
  // THREE.Terrain may rotate the plane, so height isn't guaranteed to be Y.
  const axisRanges = [
    { axis: 0, name: 'x', min: Infinity, max: -Infinity },
    { axis: 1, name: 'y', min: Infinity, max: -Infinity },
    { axis: 2, name: 'z', min: Infinity, max: -Infinity },
  ];

  for (let i = 0; i < positionArray.length; i += 3) {
    axisRanges[0].min = Math.min(axisRanges[0].min, positionArray[i]);
    axisRanges[0].max = Math.max(axisRanges[0].max, positionArray[i]);
    axisRanges[1].min = Math.min(axisRanges[1].min, positionArray[i + 1]);
    axisRanges[1].max = Math.max(axisRanges[1].max, positionArray[i + 1]);
    axisRanges[2].min = Math.min(axisRanges[2].min, positionArray[i + 2]);
    axisRanges[2].max = Math.max(axisRanges[2].max, positionArray[i + 2]);
  }

  axisRanges.forEach(r => (r['range'] = r.max - r.min));

  // Pick the axis with the smallest non‑zero range as height (width/depth ranges are much larger)
  const SMALL_EPS = 1e-4;
  const nonFlatAxes = axisRanges.filter(r => (r as any).range > SMALL_EPS);
  const heightAxis =
    nonFlatAxes.sort((a, b) => (a as any).range - (b as any).range)[0] ?? axisRanges[1]; // default to Y

  const heights = new Float32Array(simres * simres);
  const heightAxisIndex = heightAxis.axis;
  const heightRange = (heightAxis as any).range;
  const minHeight = (heightAxis as any).min;
  const maxHeight = (heightAxis as any).max;
  
  // Reshape heights to 2D grid (simres × simres)
  // THREE.Terrain generates vertices row by row: (xSegments+1) × (ySegments+1) vertices
  // We need to sample simres × simres points from this grid
  const gridWidth = simres + 1; // THREE.Terrain creates (segments+1) vertices per dimension
  const gridHeight = simres + 1;
  
  for (let row = 0; row < simres; row++) {
    for (let col = 0; col < simres; col++) {
      // Map heightmap coordinates to vertex grid coordinates
      // THREE.Terrain stores vertices row by row: vertex at (row, col) is at index row * gridWidth + col
      const vertexRow = Math.min(row, gridHeight - 1);
      const vertexCol = Math.min(col, gridWidth - 1);
      const vertexIndex = vertexRow * gridWidth + vertexCol;
      
      if (vertexIndex < vertexCount) {
        // Position array is interleaved: [x0, y0, z0, x1, y1, z1, ...]
        // So vertex at index i has position at i * 3, i * 3 + 1, i * 3 + 2
        const arrayIndex = vertexIndex * 3;
        if (arrayIndex + 2 < positionArray.length) {
          const x = positionArray[arrayIndex];
          const y = positionArray[arrayIndex + heightAxisIndex]; // height coordinate (detected axis)
          const z = positionArray[arrayIndex + 2];
          
          // Debug: Log first few vertices to understand structure
          if (row < 2 && col < 2) {
            console.log(`Vertex [${row},${col}]: x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)}, vertexIndex=${vertexIndex}, arrayIndex=${arrayIndex}`);
          }
          
          // The shader does: (yval + sval + lval) / u_SimRes to get world height
          // So if we want world height of y (e.g., 0-240), we need to store y * simres
          // This matches the format: stored value / simres = world height
          // Example: store 240*1024 = 245760, then 245760/1024 = 240 (world height)
          const heightmapIndex = row * simres + col;
          heights[heightmapIndex] = y * simres; // Multiply by simres to match shader format
      }
    }
  }

  // Create RGBA format texture data (height in R channel, rest zeros)
  const textureData = new Float32Array(simres * simres * 4);
  for (let i = 0; i < simres * simres; i++) {
    textureData[i * 4 + 0] = heights[i]; // R = height
    textureData[i * 4 + 1] = 0.0;       // G = rainfall (initialized to 0)
    textureData[i * 4 + 2] = 0.0;       // B = unused
    textureData[i * 4 + 3] = 1.0;       // A = 1.0
  }

  return textureData;
}

}

/**
 * Creates a THREE.DataTexture from heightmap data
 * 
 * @param heightmapData - Float32Array with RGBA height data
 * @param width - Texture width
 * @param height - Texture height
 * @returns THREE.DataTexture ready for GPU use
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
 * Uses a simple copy shader to upload the data
 * 
 * @param renderer - Three.js renderer
 * @param heightmapData - Float32Array with RGBA height data
 * @param target - Render target to upload to
 * @param fullscreenQuad - Fullscreen quad geometry
 * @param camera - Orthographic camera for GPGPU
 */
export function uploadHeightmapToRenderTarget(
  renderer: THREE.WebGLRenderer,
  heightmapData: Float32Array,
  target: THREE.WebGLRenderTarget,
  fullscreenQuad: THREE.BufferGeometry,
  camera: THREE.OrthographicCamera
): void {
  // Create a data texture from the heightmap
  const sourceTexture = createHeightmapTexture(
    heightmapData,
    target.width,
    target.height
  );

  // Create a simple copy shader to upload the texture to the render target
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

  // Render to target
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  
  // Force GPU to finish before we try to read back
  const gl = renderer.getContext() as WebGL2RenderingContext;
  gl.finish();
  
  renderer.setRenderTarget(null);

  // Cleanup
  material.dispose();
  sourceTexture.dispose();
  
  // Verify the upload worked by checking texture
  console.log('Heightmap upload complete, target texture:', {
    type: target.texture.type,
    format: target.texture.format,
    width: target.width,
    height: target.height
  });
}
