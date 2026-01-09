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
    let origin = new Vector3(rayOrigin[0], rayOrigin[1], rayOrigin[2]);
    const direction = new Vector3(rayDirection[0], rayDirection[1], rayDirection[2]);
    
    // Ensure direction is normalized (should already be, but double-check for precision)
    const dirLength = direction.length();
    if (dirLength > 0.0001) {
        direction.normalize();
    } else {
        // Invalid direction, return false
        return false;
    }
    
    // Check if ray is nearly parallel to Y plane (flat terrain case)
    // If the Y component of direction is very small, the ray is nearly horizontal
    const isNearlyHorizontal = Math.abs(direction.y) < 0.05;
    
    // For nearly horizontal rays, use a more robust approach
    // Try multiple ray origins slightly offset to improve hit rate on flat surfaces
    let hit: any = null;
    const maxDistance = isNearlyHorizontal ? 5000.0 : 1000.0; // Much longer for nearly horizontal rays
    
    // For nearly horizontal rays, try a slight upward offset to improve hit reliability
    // This helps when the ray is nearly parallel to flat terrain
    if (isNearlyHorizontal) {
        // Try with a small upward offset first (most reliable for flat terrain)
        const offsetOrigin = origin.clone().addScaledVector(new Vector3(0, 1, 0), 0.001);
        const offsetRay = new Ray(offsetOrigin, direction);
        hit = bvh.raycastFirst(offsetRay, maxDistance);
        
        // If offset ray didn't hit, try original
        if (!hit || hit.distance < 0) {
            const ray = new Ray(origin, direction);
            hit = bvh.raycastFirst(ray, maxDistance);
        }
    } else {
        // For normal rays, use standard approach
        const ray = new Ray(origin, direction);
        hit = bvh.raycastFirst(ray, maxDistance);
    }
    
    if (hit && hit.distance >= 0) {
        // hit.point contains the intersection point in world space
        // hit.faceIndex contains the triangle index
        // hit.distance contains the distance along the ray
        
        // For stability, always use world position to calculate UV coordinates
        // This is more consistent than triangle interpolation, especially for flat terrain
        // Terrain spans from -0.5 to 0.5 in X and Z (scale = 1.0)
        const worldX = hit.point.x;
        const worldZ = hit.point.z;
        
        // Convert to UV space [0, 1]
        // Inverse of: worldX = (u - 0.5) * scale, so u = worldX / scale + 0.5
        let u = worldX + 0.5;
        let v = worldZ + 0.5;
        
        // Clamp to valid range [0, 1]
        u = Math.max(0, Math.min(1, u));
        v = Math.max(0, Math.min(1, v));
        
        // Validate UV coordinates are reasonable
        // If they're way out of bounds, try triangle interpolation as fallback
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            out[0] = u;
            out[1] = v;
        } else {
            // Fallback to triangle interpolation if world position conversion fails
            const hitInfo = getTriangleHitPointInfo(hit.point, geometry, hit.faceIndex, {});
            if (hitInfo && hitInfo.uv) {
                out[0] = Math.max(0, Math.min(1, hitInfo.uv.x));
                out[1] = Math.max(0, Math.min(1, hitInfo.uv.y));
            } else {
                // Last resort: clamp the world position UV
                out[0] = Math.max(0, Math.min(1, u));
                out[1] = Math.max(0, Math.min(1, v));
            }
        }
        
        return true;
    }
    
    return false;
}

