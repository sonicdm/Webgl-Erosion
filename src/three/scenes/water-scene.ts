import * as THREE from 'three';
import { BufferGeometry } from 'three';
import { shaderManifest } from '../../shaders/manifest';

/**
 * Maps Three.js standard attributes to shader's expected attribute names.
 * The water shader expects vs_Pos (vec4), vs_Nor (vec4), vs_Col (vec4), vs_Uv (vec2),
 * but Three.js PlaneGeometry provides position (vec3), normal (vec3), uv (vec2).
 * 
 * Note: The shader only actually uses vs_Pos.x, vs_Pos.z, and vs_Uv, but declares all for compatibility.
 */
function mapShaderAttributes(shaderSource: string): string {
  let mapped = shaderSource;
  
  // Remove original attribute declarations
  mapped = mapped.replace(/in vec4 vs_Pos;\s*/g, '');
  mapped = mapped.replace(/in vec4 vs_Nor;\s*/g, '');
  mapped = mapped.replace(/in vec4 vs_Col;\s*/g, '');
  mapped = mapped.replace(/in vec2 vs_Uv;\s*/g, '');
  
  // Add standard Three.js attributes after version directive
  if (!mapped.includes('in vec3 position')) {
    mapped = mapped.replace(/#version 300 es/, `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;`);
  }
  
  // Add attribute mapping at the start of main()
  const attributeMapping = `
  // Map Three.js attributes to shader attributes
  vec4 vs_Pos = vec4(position, 1.0);
  vec4 vs_Nor = vec4(normal, 0.0);
  vec4 vs_Col = vec4(1.0, 1.0, 1.0, 1.0); // Default white (not used in water shader)
  vec2 vs_Uv = uv;
  `;
  
  // Find the start of main() and insert attribute mapping
  const mainIndex = mapped.indexOf('void main()');
  if (mainIndex !== -1) {
    const braceIndex = mapped.indexOf('{', mainIndex);
    if (braceIndex !== -1) {
      // Insert attribute mapping at start of main()
      mapped = mapped.slice(0, braceIndex + 1) + attributeMapping + mapped.slice(braceIndex + 1);
    }
  }
  
  return mapped;
}

/**
 * Creates a water scene with a mesh that uses custom shaders to sample water height from textures.
 * The vertex shader dynamically calculates positions from terrain heightmap, sediment, and water volume.
 * This matches the original WebGL implementation where water geometry is computed in the vertex shader.
 */
export function createWaterScene(
  simres: number,
  terrainTexture?: THREE.Texture,
  sedimentTexture?: THREE.Texture,
  normalTexture?: THREE.Texture
): {
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  updateTextures: (textures: {
    terrain?: THREE.Texture;
    sediment?: THREE.Texture;
    normal?: THREE.Texture;
    sceneDepth?: THREE.Texture;
    colorReflection?: THREE.Texture;
  }) => void;
  updateUniforms: (uniforms: {
    simres?: number;
    waterTransparency?: number;
    terrainType?: number;
    lightPos?: THREE.Vector3;
    camera?: THREE.Camera;
    dimensions?: THREE.Vector2;
  }) => void;
} {
  const scene = new THREE.Scene();

  // Create plane geometry matching terrain resolution
  // The vertex shader will sample textures to calculate actual positions
  const geometry = new THREE.PlaneGeometry(1, 1, simres - 1, simres - 1);
  geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane (Y up)

  // Get shader sources from ShaderManifest
  const waterVertShader = shaderManifest.getShaderSource('waterVert');
  const waterFragShader = shaderManifest.getShaderSource('waterFrag');
  
  // Create custom shader material using water shaders
  // Map Three.js standard attributes (position, normal, uv) to shader attributes (vs_Pos, vs_Nor, vs_Col, vs_Uv)
  const mappedVertexShader = mapShaderAttributes(waterVertShader.vert!);
  
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: mappedVertexShader,
    fragmentShader: waterFragShader.frag!,
    uniforms: {
      // Matrices
      u_Model: { value: new THREE.Matrix4() },
      u_ModelInvTr: { value: new THREE.Matrix4() },
      u_ViewProj: { value: new THREE.Matrix4() },
      u_PlanePos: { value: new THREE.Vector2(0, 0) },
      
      // Textures
      heightmap: { value: terrainTexture || null },
      sedimap: { value: sedimentTexture || null },
      normap: { value: normalTexture || null },
      sceneDepth: { value: null },
      colorReflection: { value: null },
      
      // Simulation parameters
      u_SimRes: { value: simres },
      
      // Water rendering parameters
      u_WaterTransparency: { value: 0.5 },
      u_TerrainType: { value: 0 },
      u_Dimensions: { value: new THREE.Vector2(1, 1) },
      unif_LightPos: { value: new THREE.Vector3(0.4, 0.2, -1.0) },
      u_far: { value: 1000.0 },
      u_near: { value: 0.1 },
      
      // Camera vectors (for reflection calculations)
      u_Eye: { value: new THREE.Vector3(0, 0, 0) },
      u_Ref: { value: new THREE.Vector3(0, 0, 0) },
      u_Up: { value: new THREE.Vector3(0, 1, 0) },
      
      // Unused but required by shader
      fs_Sine: { value: 0.0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Helper to update textures
  const updateTextures = (textures: {
    terrain?: THREE.Texture;
    sediment?: THREE.Texture;
    normal?: THREE.Texture;
    sceneDepth?: THREE.Texture;
    colorReflection?: THREE.Texture;
  }) => {
    if (textures.terrain !== undefined) {
      material.uniforms.heightmap.value = textures.terrain;
    }
    if (textures.sediment !== undefined) {
      material.uniforms.sedimap.value = textures.sediment;
    }
    if (textures.normal !== undefined) {
      material.uniforms.normap.value = textures.normal;
    }
    if (textures.sceneDepth !== undefined) {
      material.uniforms.sceneDepth.value = textures.sceneDepth;
    }
    if (textures.colorReflection !== undefined) {
      material.uniforms.colorReflection.value = textures.colorReflection;
    }
  };

  // Helper to update uniforms
  const updateUniforms = (uniforms: {
    simres?: number;
    waterTransparency?: number;
    terrainType?: number;
    lightPos?: THREE.Vector3;
    camera?: THREE.Camera;
    dimensions?: THREE.Vector2;
  }) => {
    if (uniforms.simres !== undefined) {
      material.uniforms.u_SimRes.value = uniforms.simres;
    }
    if (uniforms.waterTransparency !== undefined) {
      material.uniforms.u_WaterTransparency.value = uniforms.waterTransparency;
    }
    if (uniforms.terrainType !== undefined) {
      material.uniforms.u_TerrainType.value = uniforms.terrainType;
    }
    if (uniforms.lightPos !== undefined) {
      material.uniforms.unif_LightPos.value = uniforms.lightPos;
    }
    if (uniforms.dimensions !== undefined) {
      material.uniforms.u_Dimensions.value = uniforms.dimensions;
    }
    if (uniforms.camera) {
      const camera = uniforms.camera;
      if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
        material.uniforms.u_Eye.value.copy(camera.position);
        // Calculate camera forward and up vectors
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        material.uniforms.u_Ref.value.copy(camera.position).add(forward);
        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(camera.quaternion);
        material.uniforms.u_Up.value.copy(up);
      }
    }
  };

  return {
    scene,
    mesh,
    updateTextures,
    updateUniforms,
  };
}

