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

const float LAVA_MAX_VOLUME = 10.0;



void main()
{

  fs_Uv = vs_Uv;
  float sval = 1.f*texture(sedimap,vs_Uv).x;
  float yval = 1.f*texture(hightmap,vs_Uv).x;
  float wval = 1.f*texture(hightmap,vs_Uv).y;
  // Sample lava volume for pooling (like water)
  // CRITICAL: Use a safe sampling approach to prevent ghosting
  // Try-catch equivalent: sample and immediately validate
  float lval = 0.0;
  vec4 lavaData = texture(lavamap, vs_Uv);
  float sampledVolume = lavaData.x;
  float sampledTemp = lavaData.y;
  // Only use lava volume if it's valid (prevents reading garbage/shadow map data)
  // Valid lava: volume >= 0 (clamped), temp >= 0 and <= 2000.0
  // Also check that if volume exists, temp must be reasonable (> 100°C to avoid shadow map data)
  float clampedVolume = clamp(sampledVolume, 0.0, LAVA_MAX_VOLUME);
  if (sampledVolume >= 0.0 && 
      sampledTemp >= 0.0 && sampledTemp <= 2000.0 &&
      (clampedVolume < 0.001 || sampledTemp > 100.0)) {
      lval = clampedVolume;
  }
  vec4 modelposition = vec4(vs_Pos.x, (yval + sval + wval + lval)/u_SimRes, vs_Pos.z, 1.0);
  fs_Pos = modelposition.xyz;


  modelposition = u_Model * modelposition;

  fs_shadowPos = u_sproj * u_sview * modelposition;

  gl_Position = u_ViewProj * modelposition;
}
