#version 300 es


uniform mat4 u_Model;
uniform mat4 u_ModelInvTr;
uniform mat4 u_ViewProj;
uniform vec2 u_PlanePos; // Our location in the virtual world displayed by the plane

uniform mat4 u_sproj;
uniform mat4 u_sview;

uniform sampler2D hightmap;
uniform sampler2D sedimap;
uniform sampler2D lavamap;
uniform float u_SimRes;

in vec4 vs_Pos;
in vec4 vs_Nor;
in vec4 vs_Col;
in vec2 vs_Uv;

out vec3 fs_Pos;
out vec4 fs_Nor;
out vec4 fs_Col;
out vec2 fs_Uv;
out vec4 fs_shadowPos;

const float LAVA_MAX_VOLUME = 50.0;



void main()
{

  fs_Uv = vs_Uv;
  float sval = 1.f*texture(sedimap,vs_Uv).x;
  float yval = 1.f*texture(hightmap,vs_Uv).x;
  float wval = 1.f*texture(hightmap,vs_Uv).y;
  // Sample lava volume for pooling (like water), but DO NOT raise terrain by water volume.
  // Terrain geometry should be based on terrain height + sediment + lava only.
  // Water bulges are rendered by the separate water mesh (water-vert.glsl).
  float lval = 0.0;
  vec4 lavaData = texture(lavamap, vs_Uv);
  float sampledVolume = lavaData.x;
  float sampledTemp = lavaData.y;
  // Only use lava volume if it's valid (prevents reading garbage/shadow map data)
  // Valid lava: volume >= 0 (clamped), temp >= 0 and <= 2000.0
  float clampedVolume = clamp(sampledVolume, 0.0, LAVA_MAX_VOLUME);
  if (sampledVolume >= 0.0 &&
      sampledTemp >= 0.0 && sampledTemp <= 2000.0) {
      lval = clampedVolume;
  }
  // IMPORTANT:
  // - yval: base terrain height
  // - sval: deposited sediment height
  // - lval: lava volume for pooling
  // We intentionally exclude wval here so the water surface (water-vert.glsl),
  // which uses (yval + sval + wval), can properly bulge above the terrain.
  vec4 modelposition = vec4(vs_Pos.x, (yval + sval + lval)/u_SimRes, vs_Pos.z, 1.0);
  fs_Pos = modelposition.xyz;


  modelposition = u_Model * modelposition;

  fs_shadowPos = u_sproj * u_sview * modelposition;

  gl_Position = u_ViewProj * modelposition;
}
