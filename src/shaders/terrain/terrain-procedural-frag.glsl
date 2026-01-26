precision highp float;

uniform float u_MinHeight;
uniform float u_MaxHeight;
uniform float u_SnowRange;
uniform float u_ForestRange;
uniform int u_TerrainPalette; // 0 = AlpineMtn, 1 = Desert, 2 = Jungle
uniform int u_DebugMode;      // 0 = normal, 1 = height grayscale, 2 = UVs, 3 = normals, 4 = worldY, 5 = flat detector
uniform float u_DebugScale;   // scale divisor for debug visualizations (e.g., max height range)

// Brush uniforms for visualization
uniform int u_BrushType;
uniform float u_BrushSize;
uniform vec2 u_BrushPos;

in float vSampledHeight;
in float vSediment;
in vec3 vWorldPos;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUv;

out vec4 fragColor;

// Color definitions matching terrain-frag.glsl
vec3 forestcol = vec3(63.0/255.0, 155.0/255.0, 7.0/255.0) * 0.6;
vec3 mtncolor = vec3(0.99, 0.99, 0.99);
vec3 dirtcol = vec3(0.45, 0.45, 0.45);
vec3 grass = vec3(193.0/255.0, 235.0/255.0, 27.0/255.0);
vec3 sand = vec3(214.0/255.0, 184.0/255.0, 96.0/255.0);
vec3 rock1 = vec3(0.35, 0.38, 0.45);
vec3 rock2 = vec3(0.25, 0.28, 0.35);
vec3 rock3 = vec3(0.15, 0.18, 0.25);

// Improved noise functions for procedural texturing
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractal Brownian Motion for texture detail (fixed 4 octaves)
float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  // Fixed 4 octaves (GLSL doesn't support variable loop counts)
  value += amplitude * noise(st * frequency);
  frequency *= 2.0;
  amplitude *= 0.5;
  value += amplitude * noise(st * frequency);
  frequency *= 2.0;
  amplitude *= 0.5;
  value += amplitude * noise(st * frequency);
  frequency *= 2.0;
  amplitude *= 0.5;
  value += amplitude * noise(st * frequency);
  return value;
}

// Ridged noise for rock texture
float ridgedNoise(vec2 st) {
  float n = noise(st);
  return 1.0 - abs(n * 2.0 - 1.0);
}

void main() {
  // Debug visualization modes
  if (u_DebugMode == 1) {
    float h = (vSampledHeight - u_MinHeight) / max(u_MaxHeight - u_MinHeight, 0.0001);
    h = clamp(h, 0.0, 1.0);
    fragColor = vec4(vec3(h), 1.0);
    return;
  } else if (u_DebugMode == 2) {
    fragColor = vec4(vUv, 0.0, 1.0);
    return;
  } else if (u_DebugMode == 3) {
    fragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
    return;
  } else if (u_DebugMode == 4) {
    float yNorm = (vWorldPos.y - u_MinHeight) / max(u_MaxHeight - u_MinHeight, 0.0001);
    yNorm = clamp(yNorm, 0.0, 1.0);
    fragColor = vec4(yNorm, 0.0, 1.0 - yNorm, 1.0);
    return;
  } else if (u_DebugMode == 5) {
    // Intentionally gated by u_DebugMode: flat detector (red |y|<0.1, yellow |y|<1.0) for VTF/displacement debugging.
    float debugY = vPosition.y;
    if (abs(debugY) < 0.1) {
      fragColor = vec4(1.0, 0.0, 0.0, 1.0);
      return;
    } else if (abs(debugY) < 1.0) {
      fragColor = vec4(1.0, 1.0, 0.0, 1.0);
      return;
    }
  }
  
  // Calculate height normalized to [0, 1]
  float height = (vPosition.y - u_MinHeight) / (u_MaxHeight - u_MinHeight);
  height = clamp(height, 0.0, 1.0);
  
  // Calculate slope from normal (y component = how "up" the surface is)
  float slope = abs(vNormal.y); // 1.0 = flat, 0.0 = vertical
  
  // Add procedural texture detail using FBM
  float detailNoise = fbm(vUv * 20.0) * 0.15;
  float rockDetail = ridgedNoise(vUv * 30.0) * 0.1;
  
  // Combine noise based on slope (more rock detail on steep slopes)
  float noiseVal = mix(detailNoise, rockDetail, 1.0 - slope);
  
  // Base color based on height
  vec3 finalcol;
  
  if (u_TerrainPalette == 1) {
    // Desert palette
    if (height < 0.2) {
      finalcol = sand;
    } else if (height < 0.4) {
      finalcol = mix(sand, dirtcol, (height - 0.2) / 0.2);
    } else if (height < 0.6) {
      finalcol = mix(dirtcol, grass, (height - 0.4) / 0.2);
    } else if (height < 0.8) {
      finalcol = mix(grass, dirtcol, (height - 0.6) / 0.2);
    } else {
      finalcol = mix(dirtcol, mtncolor, (height - 0.8) / 0.2);
    }
  } else if (u_TerrainPalette == 2) {
    // Jungle palette
    if (height < 0.3) {
      finalcol = mix(sand, grass, height / 0.3);
    } else if (height < 0.6) {
      finalcol = mix(grass, forestcol, (height - 0.3) / 0.3);
    } else if (height < 0.8) {
      finalcol = mix(forestcol, dirtcol, (height - 0.6) / 0.2);
    } else {
      finalcol = mix(dirtcol, mtncolor, (height - 0.8) / 0.2);
    }
  } else {
    // AlpineMtn palette (default)
    if (height < 0.2) {
      finalcol = sand;
    } else if (height < 0.4) {
      finalcol = mix(sand, grass, (height - 0.2) / 0.2);
    } else if (height < 0.6) {
      finalcol = mix(grass, dirtcol, (height - 0.4) / 0.2);
    } else if (height < 0.8) {
      finalcol = mix(dirtcol, mtncolor, (height - 0.6) / 0.2);
    } else {
      finalcol = mtncolor;
    }
  }
  
  // Apply slope-based modifications
  // Steep slopes (low slope value) = more rock/dirt
  if (slope < 0.75) {
    vec3 rockCol = mix(rock3, rock1, slope / 0.75);
    finalcol = mix(rockCol, finalcol, pow(slope / 0.75, u_SnowRange));
  }
  
  // Forest effect on flatter areas
  finalcol = mix(mtncolor, finalcol, clamp(pow(abs(vNormal.y), u_ForestRange), 0.0, 1.0));
  
  // Add noise variation
  finalcol += vec3(noiseVal);
  
  // Brush visualization (matching terrain-frag.glsl)
  vec3 addcol = vec3(0.0);
  // Force brush visualization for testing - always show if brushType > 0
  if(u_BrushType != 0){
    // Brush position comes from BVH raycast in [0,1] UV space
    // vUv should also be in [0,1] space from the mesh UV attribute
    // If there's an offset, it might be due to UV coordinate system mismatch
    vec2 pointOnPlane = u_BrushPos;
    float pdis2fragment = distance(pointOnPlane, vUv);
    float brushRadius = 0.01 * u_BrushSize;
    // Make brush more visible - use larger radius check
    if (pdis2fragment < brushRadius){
      float dens = (brushRadius - pdis2fragment) / brushRadius;
      dens = clamp(dens, 0.0, 1.0);
      
      if(u_BrushType == 1){
        addcol = sand * 0.8 * dens;
      }else if(u_BrushType == 2){
        addcol = vec3(0.1, 0.3, 0.8) * 0.8 * dens; // watercol
      }else if(u_BrushType == 3){
        addcol = vec3(0.35, 0.38, 0.45) * 0.8 * dens; // rock
      }else if(u_BrushType == 4){
        addcol = vec3(0.5, 0.8, 1.0) * 0.8 * dens; // smooth
      }else if(u_BrushType == 5){
        addcol = vec3(1.0, 1.0, 0.3) * 0.8 * dens; // flatten
      }else if(u_BrushType == 6){
        addcol = vec3(0.3, 1.0, 0.3) * 0.8 * dens; // slope
      }else if(u_BrushType == 7){
        addcol = vec3(1.0, 0.3, 0.0) * 0.8 * dens; // lava
      }
    }
  }
  finalcol += addcol;
  
  // Simple lighting based on normal
  float lightIntensity = max(dot(vNormal, vec3(0.5, 1.0, 0.3)), 0.3);
  finalcol *= lightIntensity;
  
  fragColor = vec4(finalcol, 1.0);
}
