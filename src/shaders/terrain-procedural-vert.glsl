precision highp float;

// VTF (Vertex Texture Fetch) is supported in WebGL 2.0 / GLSL ES 3.00
// No extensions needed - it's part of the core spec

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

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vUv = uv;
  
  // Read height from heightmap texture (VTF - Vertex Texture Fetch)
  // Texture stores: storedHeight = worldHeight * simres
  // Shader reads: yval = texture(u_Heightmap, vUv).x
  // World height = yval / u_SimRes (matches terrain-vert.glsl line 59)
  // Note: Dummy textures are provided initially to prevent compilation errors
  float yval = texture(u_Heightmap, vUv).x;
  float sval = texture(u_Sediment, vUv).x;
  
  // Displace vertex Y position based on heightmap + sediment
  // Keep X and Z from geometry (flat plane), only displace Y
  // Protect against division by zero
  float simResSafe = max(u_SimRes, 1.0);
  vec3 worldPosition = vec3(position.x, (yval + sval) / simResSafe, position.z);
  
  vPosition = (modelMatrix * vec4(worldPosition, 1.0)).xyz;
  
  // Calculate normal from displaced positions (sample neighbors for accurate normals)
  // UV space: [0,1] range, so texel size in UV space is 1.0 / u_SimRes
  vec2 texelSizeUV = vec2(1.0 / simResSafe, 1.0 / simResSafe);
  float heightL = texture(u_Heightmap, vUv + vec2(-texelSizeUV.x, 0.0)).x;
  float heightR = texture(u_Heightmap, vUv + vec2(texelSizeUV.x, 0.0)).x;
  float heightD = texture(u_Heightmap, vUv + vec2(0.0, -texelSizeUV.y)).x;
  float heightU = texture(u_Heightmap, vUv + vec2(0.0, texelSizeUV.y)).x;
  
  float worldHeightL = heightL / simResSafe;
  float worldHeightR = heightR / simResSafe;
  float worldHeightD = heightD / simResSafe;
  float worldHeightU = heightU / simResSafe;
  
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
