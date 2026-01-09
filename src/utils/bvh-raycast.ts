import { vec2, vec3 } from 'gl-matrix';
import { MeshBVH } from 'three-mesh-bvh';
import { BufferGeometry, Ray, Vector3, Triangle, Vector2 } from 'three';
import { getTriangleHitPointInfo } from 'three-mesh-bvh';

/**
 * BVH-based raycast function.
 * Uses three-mesh-bvh for fast raycasting against terrain geometry.
 * 
 * @param rayOrigin - Ray origin in world space (vec3)
 * @param rayDirection - Ray direction in world space (normalized vec3)
 * @param bvh - MeshBVH instance built from terrain geometry
 * @param geometry - BufferGeometry of the terrain mesh
 * @param out - Output vec2 to store UV coordinates [0-1, 0-1]
 * @returns true if intersection found, false otherwise
 */
export function rayCastBVH(
    rayOrigin: vec3,
    rayDirection: vec3,
    bvh: MeshBVH,
    geometry: BufferGeometry,
    out: vec2
): boolean {
    // Initialize output to invalid values
    out[0] = -10.0;
    out[1] = -10.0;
    
    if (!bvh || !geometry) {
        return false;
    }
    
    // Convert gl-matrix vectors to Three.js vectors
    const origin = new Vector3(rayOrigin[0], rayOrigin[1], rayOrigin[2]);
    const direction = new Vector3(rayDirection[0], rayDirection[1], rayDirection[2]).normalize();
    
    // Create a Three.js Ray object
    const ray = new Ray(origin, direction);
    
    // Use BVH's raycastFirst for fast single-hit raycasting
    // Second parameter is max distance - increased for better accuracy at distance
    const hit = bvh.raycastFirst(ray, 100.0);
    
    if (hit) {
        // hit.point contains the intersection point in world space
        // hit.faceIndex contains the triangle index
        
        // Use getTriangleHitPointInfo to get accurate UV coordinates from triangle interpolation
        // This is more accurate than converting from world position
        const hitInfo = getTriangleHitPointInfo(hit.point, geometry, hit.faceIndex, {});
        
        if (hitInfo && hitInfo.uv) {
            // Use interpolated UV from triangle (most accurate)
            out[0] = hitInfo.uv.x;
            out[1] = hitInfo.uv.y;
        } else {
            // Fallback: Convert world position to UV coordinates
            // Terrain spans from -0.5 to 0.5 in X and Z (scale = 1.0)
            const worldX = hit.point.x;
            const worldZ = hit.point.z;
            
            // Convert to UV space [0, 1]
            // Inverse of: worldX = (u - 0.5) * scale, so u = worldX / scale + 0.5
            const u = worldX + 0.5;
            const v = worldZ + 0.5;
            
            // Clamp to valid range [0, 1]
            out[0] = Math.max(0, Math.min(1, u));
            out[1] = Math.max(0, Math.min(1, v));
        }
        
        return true;
    }
    
    return false;
}

