import * as THREE from 'three';
import { BufferGeometry } from 'three';
import { generateBlendedMaterial } from '../terrain/THREE.Terrain';

/**
 * Creates a terrain scene with a mesh that can be updated from height data.
 * Uses THREE.Terrain.generateBlendedMaterial for elevation-based texturing.
 */
export function createTerrainScene(palette: string = 'Desert'): {
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  updateGeometry: (geometry: BufferGeometry) => void;
  updateMaterial: (textures: Array<{ texture: THREE.Texture; levels?: number[]; glsl?: string }>) => void;
} {
  const scene = new THREE.Scene();

  // Create initial plane geometry (will be updated from height data)
  const geometry = new THREE.PlaneGeometry(2, 2, 100, 100);
  geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal

  // Create default material (will be replaced with blended material when textures are available)
  let material: THREE.Material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    wireframe: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Add basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  const updateGeometry = (newGeometry: BufferGeometry) => {
    // Replace geometry while keeping material
    const oldGeometry = mesh.geometry;
    mesh.geometry = newGeometry;
    oldGeometry.dispose();
  };

  const updateMaterial = (textures: Array<{ texture: THREE.Texture; levels?: number[]; glsl?: string }>) => {
    try {
      // Generate blended material using THREE.Terrain
      const blendedMaterial = generateBlendedMaterial(textures);
      const oldMaterial = mesh.material;
      mesh.material = blendedMaterial;
      
      // Dispose old material if it's not the default
      if (oldMaterial && oldMaterial !== material) {
        oldMaterial.dispose();
      }
    } catch (error) {
      console.warn('Failed to generate blended material, using default:', error);
    }
  };

  return { scene, mesh, updateGeometry, updateMaterial };
}

