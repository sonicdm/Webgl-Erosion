import * as THREE from 'three';
import { BufferGeometry } from 'three';

/**
 * Creates a lava scene with a mesh that can be updated from lava data.
 * Uses MeshStandardMaterial with emissive properties for lava rendering.
 */
export function createLavaScene(): {
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  updateGeometry: (geometry: BufferGeometry) => void;
  updateEmissive: (texture: THREE.Texture) => void;
} {
  const scene = new THREE.Scene();

  // Create initial plane geometry (will be updated from lava volume data)
  const geometry = new THREE.PlaneGeometry(2, 2, 100, 100);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff4400,
    emissiveIntensity: 1.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const updateGeometry = (newGeometry: BufferGeometry) => {
    const oldGeometry = mesh.geometry;
    mesh.geometry = newGeometry;
    oldGeometry.dispose();
  };

  const updateEmissive = (texture: THREE.Texture) => {
    material.emissiveMap = texture;
    material.needsUpdate = true;
  };

  return {
    scene,
    mesh,
    updateGeometry,
    updateEmissive,
  };
}

