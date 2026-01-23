/**
 * Procedural terrain material using shader-based texturing
 * Replicates the height/slope-based coloring from terrain-frag.glsl
 */

import * as THREE from 'three';
import terrainProceduralVert from '../../shaders/terrain-procedural-vert.glsl?raw';
import terrainProceduralFrag from '../../shaders/terrain-procedural-frag.glsl?raw';

// Shaders are now in dedicated GLSL files:
// - src/shaders/terrain-procedural-vert.glsl
// - src/shaders/terrain-procedural-frag.glsl

export interface TerrainProceduralMaterialParams {
  minHeight?: number;
  maxHeight?: number;
  snowRange?: number;
  forestRange?: number;
  terrainPalette?: number; // 0 = AlpineMtn, 1 = Desert, 2 = Jungle
}

/**
 * Creates a procedural terrain material that colors based on height and slope
 * Uses RawShaderMaterial with GLSL 3.0 to support Vertex Texture Fetch (VTF)
 */
export function createTerrainProceduralMaterial(params: TerrainProceduralMaterialParams = {}): THREE.RawShaderMaterial {
  const {
    minHeight = 0.0,
    maxHeight = 240.0, // Default from TerrainHeight * 120.0
    snowRange = 0.0,
    forestRange = 0.0,
    terrainPalette = 1, // Default to Desert
  } = params;

  // Use RawShaderMaterial with GLSL 3.0 to support Vertex Texture Fetch (VTF)
  // VTF requires WebGL 2.0 / GLSL 3.0, which RawShaderMaterial supports
  // Create dummy textures to prevent shader compilation errors when textures are null
  const dummyHeightmap = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 1]),
    1, 1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  dummyHeightmap.needsUpdate = true;
  
  const dummySediment = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 1]),
    1, 1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  dummySediment.needsUpdate = true;
  
  // Trim shader sources to ensure no leading/trailing whitespace issues
  // Note: We don't include #version directive - Three.js adds it automatically when using
  // RawShaderMaterial with glslVersion: THREE.GLSL3
  const vertexShaderSource = terrainProceduralVert.trim();
  const fragmentShaderSource = terrainProceduralFrag.trim();
  
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    uniforms: {
      // Heightmap textures (will be set by integration.ts)
      // Use dummy textures initially to prevent shader compilation errors
      u_Heightmap: { value: dummyHeightmap }, // Terrain heightmap texture (from terrainPP)
      u_Sediment: { value: dummySediment },   // Sediment texture (from sedimentPP)
      u_SimRes: { value: 1024.0 },  // Simulation resolution
      u_TerrainSize: { value: 1024.0 }, // Terrain world-space size (for normal calculation)
      // Material uniforms
      u_MinHeight: { value: minHeight },
      u_MaxHeight: { value: maxHeight },
      u_SnowRange: { value: snowRange },
      u_ForestRange: { value: forestRange },
      u_TerrainPalette: { value: terrainPalette },
      // Brush uniforms
      u_BrushType: { value: 0 },
      u_BrushSize: { value: 0.0 },
      u_BrushPos: { value: new THREE.Vector2(0.0, 0.0) },
    },
    side: THREE.DoubleSide,
    wireframe: false,
  });
  
  // Explicitly ensure wireframe is false
  (material as any).wireframe = false;
  
  return material;
}

// Legacy GLSL 1.0 shaders (kept for reference, not used - VTF requires GLSL 3.0)
const terrainVertexShaderGLSL1 = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vec3 worldPosition = position;
    vPosition = (modelMatrix * vec4(worldPosition, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
  }
`;

const terrainFragmentShaderGLSL1 = `
  uniform float u_MinHeight;
  uniform float u_MaxHeight;
  uniform float u_SnowRange;
  uniform float u_ForestRange;
  uniform int u_TerrainPalette;
  uniform int u_BrushType;
  uniform float u_BrushSize;
  uniform vec2 u_BrushPos;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  
  void main() {
    gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
  }
`;

/**
 * Updates the procedural material uniforms
 */
export function updateTerrainProceduralMaterial(
  material: THREE.RawShaderMaterial | THREE.ShaderMaterial,
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

