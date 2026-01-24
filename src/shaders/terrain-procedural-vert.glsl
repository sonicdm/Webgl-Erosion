precision highp float;

// VTF (Vertex Texture Fetch) is supported in WebGL 2.0 / GLSL ES 3.00
// No extensions needed - it's part of the core spec
//
// CONTRACT: WORLD encoding
// - Texture stores worldHeight directly
// - Shader samples worldHeight directly; u_SimRes only for texel size

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform sampler2D u_Heightmap;
uniform sampler2D u_Sediment;
uniform float u_SimRes;
uniform float u_TerrainSize;
uniform float u_HeightDecodeScale; // multiply stored height to get world height

out float vSampledHeight;
out float vSediment;
out vec3 vWorldPos;
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUv;

/**
 * Samples world height from heightmap texture (world units)
 */
float sampleWorldHeight(vec2 uv) {
  // Simulation textures store RAW height = worldHeight * u_SimRes
  float raw = texture(u_Heightmap, uv).x;
  return raw * u_HeightDecodeScale;
}

void main() {
  vUv = uv;
  
  // Sample heights
  float worldY = sampleWorldHeight(vUv);
  // Sediment texture stores same RAW encoding
  float worldS = texture(u_Sediment, vUv).x * u_HeightDecodeScale;
  
  // Displace vertex Y position based on heightmap + sediment
  vec3 worldPosition = vec3(position.x, worldY + worldS, position.z);
  vSampledHeight = worldY;
  vSediment = worldS;
  vWorldPos = worldPosition;
  
  vPosition = (modelMatrix * vec4(worldPosition, 1.0)).xyz;
  
  // Calculate normal from displaced positions (sample neighbors for accurate normals)
  // UV space: [0,1] range, so texel size in UV space is 1.0 / u_SimRes
  float simResSafe = max(u_SimRes, 1.0);
  vec2 texelSizeUV = vec2(1.0 / simResSafe, 1.0 / simResSafe);
  
  // Sample neighbor heights using centralized function
  float worldHeightL = sampleWorldHeight(vUv + vec2(-texelSizeUV.x, 0.0));
  float worldHeightR = sampleWorldHeight(vUv + vec2(texelSizeUV.x, 0.0));
  float worldHeightD = sampleWorldHeight(vUv + vec2(0.0, -texelSizeUV.y));
  float worldHeightU = sampleWorldHeight(vUv + vec2(0.0, texelSizeUV.y));
  
  // Calculate normal from height differences (finite difference method)
  // Use terrain size to calculate world-space spacing between vertices
  float simResMinusOne = max(u_SimRes - 1.0, 1.0);
  float worldSpacingX = u_TerrainSize / simResMinusOne;
  float worldSpacingZ = u_TerrainSize / simResMinusOne;
  
  vec3 tangent = vec3(worldSpacingX, worldHeightR - worldHeightL, 0.0);
  vec3 bitangent = vec3(0.0, worldHeightU - worldHeightD, worldSpacingZ);
  vec3 computedNormal = normalize(cross(tangent, bitangent));
  
  vNormal = normalize(normalMatrix * computedNormal);
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
}
