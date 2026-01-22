import * as THREE from 'three';
import { BufferGeometry } from 'three';

/**
 * Creates a water scene with a mesh that can be updated from water height data.
 * Uses MeshPhysicalMaterial for water rendering.
 */
export function createWaterScene(): {
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  updateGeometry: (geometry: BufferGeometry) => void;
} {
  const scene = new THREE.Scene();

  // Create initial plane geometry (will be updated from water height data)
  const geometry = new THREE.PlaneGeometry(2, 2, 100, 100);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x1e3a8a,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  return {
    scene,
    mesh,
    updateGeometry: (newGeometry: BufferGeometry) => {
      const oldGeometry = mesh.geometry;
      mesh.geometry = newGeometry;
      oldGeometry.dispose();
    },
  };
}

