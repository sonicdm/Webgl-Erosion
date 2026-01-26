import * as THREE from 'three';
import { BufferGeometry } from 'three';

/**
 * Creates a lava scene with a mesh that uses temperature-based color and emission.
 * For Phase 1: Uses MeshStandardMaterial with temperature-based emissive color.
 * The mesh geometry matches terrain resolution and is updated from lava volume texture.
 */
export function createLavaScene(
  simres: number,
  lavaTexture?: THREE.Texture
): {
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  updateTextures: (textures: { lava?: THREE.Texture }) => void;
  updateUniforms: (uniforms: {
    simres?: number;
    lavaInitialTemp?: number;
    lavaSolidificationTemp?: number;
    lavaAmbientTemp?: number;
    lavaGlowIntensity?: number;
  }) => void;
} {
  const scene = new THREE.Scene();

  // Create plane geometry matching terrain resolution
  // The geometry will be displaced by lava volume in the vertex shader (similar to water)
  const geometry = new THREE.PlaneGeometry(1, 1, simres - 1, simres - 1);
  geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane (Y up)

  // Create material with temperature-based emission
  // Phase 1: Use MeshStandardMaterial with emissive properties
  // Temperature-based color gradient will be applied via emissive color updates
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000, // Base color (black, emission provides the color)
    emissive: 0xff4400, // Orange emissive (will be updated based on temperature)
    emissiveIntensity: 1.0,
    side: THREE.DoubleSide,
    transparent: false, // Lava is opaque
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Store lava texture reference for temperature sampling
  let currentLavaTexture: THREE.Texture | null = lavaTexture || null;

  // Helper to update textures
  const updateTextures = (textures: { lava?: THREE.Texture }) => {
    if (textures.lava !== undefined) {
      currentLavaTexture = textures.lava;
      // For Phase 1, we'll update emissive color based on temperature in updateUniforms
      // In Phase 2, we can create an emissive map texture from temperature
    }
  };

  // Helper to update uniforms and temperature-based colors
  const updateUniforms = (uniforms: {
    simres?: number;
    lavaInitialTemp?: number;
    lavaSolidificationTemp?: number;
    lavaAmbientTemp?: number;
    lavaGlowIntensity?: number;
  }) => {
    // For Phase 1: Update emissive color based on average temperature
    // In Phase 2, we'll create a proper emissive map texture
    // For now, use a simple temperature-based color gradient
    if (uniforms.lavaInitialTemp !== undefined && 
        uniforms.lavaSolidificationTemp !== undefined &&
        uniforms.lavaAmbientTemp !== undefined) {
      // Default to medium-hot temperature for visualization
      const avgTemp = (uniforms.lavaInitialTemp + uniforms.lavaSolidificationTemp) / 2;
      const tempRange = uniforms.lavaInitialTemp - uniforms.lavaAmbientTemp;
      const tempNorm = (avgTemp - uniforms.lavaAmbientTemp) / Math.max(tempRange, 1.0);
      
      // Color gradient: orange (hot) -> yellow (medium) -> red (cool)
      let r = 1.0, g = 0.3, b = 0.0;
      if (tempNorm > 0.7) {
        // Hot: orange-yellow
        r = 1.0;
        g = 0.7 + (tempNorm - 0.7) * 0.3;
        b = 0.0;
      } else if (tempNorm > 0.4) {
        // Medium: orange-red
        r = 1.0;
        g = 0.3 + (tempNorm - 0.4) * 0.4;
        b = 0.0;
      } else {
        // Cool: deep red
        r = 0.8 + tempNorm * 0.2;
        g = 0.0;
        b = 0.0;
      }
      
      const glowIntensity = uniforms.lavaGlowIntensity || 1.0;
      material.emissive.setRGB(r, g, b);
      material.emissiveIntensity = glowIntensity;
    }
  };

  return {
    scene,
    mesh,
    updateTextures,
    updateUniforms,
  };
}

