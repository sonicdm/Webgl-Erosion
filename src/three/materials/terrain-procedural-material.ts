/**
 * Procedural terrain material using shader-based texturing
 * Replicates the height/slope-based coloring from terrain-frag.glsl
 */

import * as THREE from 'three';

// Vertex shader - GLSL 1.0 for ShaderMaterial (Three.js handles uniforms automatically)
const terrainVertexShaderGLSL1 = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Vertex shader - GLSL 3.0 for RawShaderMaterial (explicit uniforms)
const terrainVertexShader = `
  #version 300 es
  precision highp float;
  
  in vec3 position;
  in vec3 normal;
  in vec2 uv;
  
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  
  out vec3 vPosition;
  out vec3 vNormal;
  out vec2 vUv;
  
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader - GLSL 1.0 for ShaderMaterial
const terrainFragmentShaderGLSL1 = `
  uniform float u_MinHeight;
  uniform float u_MaxHeight;
  uniform float u_SnowRange;
  uniform float u_ForestRange;
  uniform int u_TerrainPalette; // 0 = AlpineMtn, 1 = Desert, 2 = Jungle
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  
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
    
    // Simple lighting based on normal
    float lightIntensity = max(dot(vNormal, vec3(0.5, 1.0, 0.3)), 0.3);
    finalcol *= lightIntensity;
    
    gl_FragColor = vec4(finalcol, 1.0);
  }
`;

// Fragment shader - GLSL 3.0 for RawShaderMaterial (kept for future use)
const terrainFragmentShader = `
  #version 300 es
  precision highp float;
  
  uniform float u_MinHeight;
  uniform float u_MaxHeight;
  uniform float u_SnowRange;
  uniform float u_ForestRange;
  uniform int u_TerrainPalette; // 0 = AlpineMtn, 1 = Desert, 2 = Jungle
  
  in vec3 vPosition;
  in vec3 vNormal;
  in vec2 vUv;
  
  out vec4 fragColor;
  
  // Color definitions matching terrain-frag.glsl
  vec3 forestcol = vec3(63.0/255.0, 155.0/255.0, 7.0/255.0) * 0.6;
  vec3 mtncolor = vec3(0.99, 0.99, 0.99);
  vec3 dirtcol = vec3(0.45, 0.45, 0.45);
  vec3 grass = vec3(193.0/255.0, 235.0/255.0, 27.0/255.0);
  vec3 sand = vec3(214.0/255.0, 184.0/96.0, 96.0/255.0);
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
    
    // Simple lighting based on normal
    float lightIntensity = max(dot(vNormal, vec3(0.5, 1.0, 0.3)), 0.3);
    finalcol *= lightIntensity;
    
    fragColor = vec4(finalcol, 1.0);
  }
`;

export interface TerrainProceduralMaterialParams {
  minHeight?: number;
  maxHeight?: number;
  snowRange?: number;
  forestRange?: number;
  terrainPalette?: number; // 0 = AlpineMtn, 1 = Desert, 2 = Jungle
}

/**
 * Creates a procedural terrain material that colors based on height and slope
 */
export function createTerrainProceduralMaterial(params: TerrainProceduralMaterialParams = {}): THREE.ShaderMaterial {
  const {
    minHeight = 0.0,
    maxHeight = 240.0, // Default from TerrainHeight * 120.0
    snowRange = 0.0,
    forestRange = 0.0,
    terrainPalette = 1, // Default to Desert
  } = params;

  // Use ShaderMaterial instead of RawShaderMaterial so Three.js handles standard uniforms automatically
  // But we need to use GLSL 1.0 syntax for ShaderMaterial
  const material = new THREE.ShaderMaterial({
    vertexShader: terrainVertexShaderGLSL1,
    fragmentShader: terrainFragmentShaderGLSL1,
    uniforms: {
      u_MinHeight: { value: minHeight },
      u_MaxHeight: { value: maxHeight },
      u_SnowRange: { value: snowRange },
      u_ForestRange: { value: forestRange },
      u_TerrainPalette: { value: terrainPalette },
    },
    side: THREE.DoubleSide,
    wireframe: false,
  });
  
  // Explicitly ensure wireframe is false
  (material as any).wireframe = false;
  
  return material;
}

/**
 * Updates the procedural material uniforms
 */
export function updateTerrainProceduralMaterial(
  material: THREE.ShaderMaterial | THREE.RawShaderMaterial,
  params: TerrainProceduralMaterialParams
): void {
  // Ensure uniforms object exists
  if (!material.uniforms) {
    console.warn('Material has no uniforms object, cannot update');
    return;
  }
  
  // Update uniforms with null checks
  if (params.minHeight !== undefined && material.uniforms.u_MinHeight) {
    material.uniforms.u_MinHeight.value = params.minHeight;
  }
  if (params.maxHeight !== undefined && material.uniforms.u_MaxHeight) {
    material.uniforms.u_MaxHeight.value = params.maxHeight;
  }
  if (params.snowRange !== undefined && material.uniforms.u_SnowRange) {
    material.uniforms.u_SnowRange.value = params.snowRange;
  }
  if (params.forestRange !== undefined && material.uniforms.u_ForestRange) {
    material.uniforms.u_ForestRange.value = params.forestRange;
  }
  if (params.terrainPalette !== undefined && material.uniforms.u_TerrainPalette) {
    material.uniforms.u_TerrainPalette.value = params.terrainPalette;
  }
  
  // Mark material as needing update
  material.needsUpdate = true;
}

