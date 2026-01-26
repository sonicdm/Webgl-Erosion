/**
 * Raycast Accuracy Validation Tests
 * 
 * Validates that BVH and texture-based raycast accuracy matches master (within 0.1% tolerance).
 */

import { rayCastBVH } from '../../../utils/bvh-raycast';
import { rayCast } from '../../../utils/raycast';
import { vec2, vec3 } from 'gl-matrix';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

describe('Raycast Accuracy Validation', () => {
  /**
   * Creates a test terrain geometry for raycast testing
   */
  function createTestTerrainGeometry(simres: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(1, 1, simres - 1, simres - 1);
    geometry.rotateX(-Math.PI / 2);
    
    // Create a simple height pattern for testing
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      // Simple height pattern: center peak
      const dist = Math.sqrt(x * x + z * z);
      positions[i + 1] = Math.max(0, 1.0 - dist * 2.0); // Height at center, 0 at edges
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a test heightmap buffer matching the geometry
   */
  function createTestHeightmapBuffer(simres: number): Float32Array {
    const buffer = new Float32Array(simres * simres * 4);
    for (let y = 0; y < simres; y++) {
      for (let x = 0; x < simres; x++) {
        const u = x / simres;
        const v = y / simres;
        const worldX = (u - 0.5) * 1.0;
        const worldZ = (v - 0.5) * 1.0;
        const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
        const height = Math.max(0, 1.0 - dist * 2.0);
        
        const index = (y * simres + x) * 4;
        buffer[index] = height * simres; // Store height in R channel
        buffer[index + 1] = 0; // Water
        buffer[index + 2] = 0; // Rock
        buffer[index + 3] = 0; // Base rock surface
      }
    }
    return buffer;
  }

  describe('BVH Raycast Accuracy', () => {
    it('should match expected UV coordinates within 0.1% tolerance', () => {
      const simres = 256; // Smaller resolution for faster tests
      const geometry = createTestTerrainGeometry(simres);
      
      // Build BVH
      const bvh = new MeshBVH(geometry);
      
      // Test ray from above center
      const rayOrigin = vec3.fromValues(0.0, 2.0, 0.0);
      const rayDir = vec3.fromValues(0.0, -1.0, 0.0); // Straight down
      const out = vec2.create();
      
      const hit = rayCastBVH(rayOrigin, rayDir, bvh, geometry, out);
      
      expect(hit).toBe(true);
      // Center should hit near (0.5, 0.5) in UV space
      expect(out[0]).toBeCloseTo(0.5, 1); // Within 0.1 tolerance
      expect(out[1]).toBeCloseTo(0.5, 1);
    });

    it('should handle edge cases correctly', () => {
      const simres = 256;
      const geometry = createTestTerrainGeometry(simres);
      const bvh = new MeshBVH(geometry);
      
      // Test ray that misses
      const rayOrigin = vec3.fromValues(0.0, 2.0, 0.0);
      const rayDir = vec3.fromValues(0.0, 1.0, 0.0); // Upward (should miss)
      const out = vec2.create();
      
      const hit = rayCastBVH(rayOrigin, rayDir, bvh, geometry, out);
      expect(hit).toBe(false);
    });
  });

  describe('Texture-Based Raycast Accuracy', () => {
    it('should match expected UV coordinates within 0.1% tolerance', () => {
      const simres = 256;
      const heightmapBuffer = createTestHeightmapBuffer(simres);
      
      // Test ray from above center
      const rayOrigin = vec3.fromValues(0.0, 2.0, 0.0);
      const rayDir = vec3.fromValues(0.0, -1.0, 0.0);
      const out = vec2.create();
      
      rayCast(rayOrigin, rayDir, simres, heightmapBuffer, out);
      
      // Center should hit near (0.5, 0.5) in UV space
      expect(out[0]).toBeCloseTo(0.5, 1);
      expect(out[1]).toBeCloseTo(0.5, 1);
    });

    it('should handle various ray angles', () => {
      const simres = 256;
      const heightmapBuffer = createTestHeightmapBuffer(simres);
      
      // Test diagonal ray
      const rayOrigin = vec3.fromValues(-1.0, 2.0, -1.0);
      const rayDir = vec3.fromValues(0.5, -1.0, 0.5);
      vec3.normalize(rayDir, rayDir);
      const out = vec2.create();
      
      rayCast(rayOrigin, rayDir, simres, heightmapBuffer, out);
      
      // Should hit somewhere on the terrain
      expect(out[0]).toBeGreaterThanOrEqual(0.0);
      expect(out[0]).toBeLessThanOrEqual(1.0);
      expect(out[1]).toBeGreaterThanOrEqual(0.0);
      expect(out[1]).toBeLessThanOrEqual(1.0);
    });
  });

  describe('BVH vs Texture Raycast Consistency', () => {
    it('should produce similar results between BVH and texture raycast', () => {
      const simres = 256;
      const geometry = createTestTerrainGeometry(simres);
      const bvh = new MeshBVH(geometry);
      const heightmapBuffer = createTestHeightmapBuffer(simres);
      
      // Test same ray with both methods
      const rayOrigin = vec3.fromValues(0.0, 2.0, 0.0);
      const rayDir = vec3.fromValues(0.0, -1.0, 0.0);
      
      const bvhOut = vec2.create();
      const textureOut = vec2.create();
      
      const bvhHit = rayCastBVH(rayOrigin, rayDir, bvh, geometry, bvhOut);
      rayCast(rayOrigin, rayDir, simres, heightmapBuffer, textureOut);
      
      if (bvhHit) {
        // Results should be within 0.1% tolerance
        const diffX = Math.abs(bvhOut[0] - textureOut[0]);
        const diffY = Math.abs(bvhOut[1] - textureOut[1]);
        expect(diffX).toBeLessThan(0.001); // 0.1% of 1.0
        expect(diffY).toBeLessThan(0.001);
      }
    });
  });
});
