import { BufferGeometry, BufferAttribute } from 'three';
import { vec3, vec2 } from 'gl-matrix';
import { sampleHeightBilinear } from './raycast';

/**
 * Creates a secondary Three.js BufferGeometry from heightmap data.
 * This geometry is used ONLY for BVH raycasting, not for rendering.
 * The rendering system continues to use the plane + heightmap texture approach.
 * 
 * @param simres - Simulation resolution (heightmap size)
 * @param heightMapBuffer - CPU buffer containing height data (Float32Array)
 * @param scale - Scale factor for terrain (default: 1.0)
 * @returns Three.js BufferGeometry ready for BVH building
 */
export function createTerrainGeometry(
    simres: number,
    heightMapBuffer: Float32Array,
    scale: number = 1.0
): BufferGeometry {
    const geometry = new BufferGeometry();
    
    // Calculate number of vertices (grid size)
    const width = simres;
    const height = simres;
    const numVertices = width * height;
    
    // Create position array (x, y, z for each vertex)
    const positions = new Float32Array(numVertices * 3);
    // Create UV array for accurate UV interpolation from triangle hits
    const uvs = new Float32Array(numVertices * 2);
    const indices: number[] = [];
    
    // Generate vertices from heightmap
    // Use bilinear interpolation to match shader texture sampling and heightmap raycast
    let posIdx = 0;
    const uv = vec2.create();
    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            // Calculate UV coordinates in [0, 1] range
            // Match Plane geometry UV calculation: uvs are x * normalize where normalize = 1.0 / width
            const u = x / (width - 1);
            const v = z / (height - 1);
            
            // Use bilinear interpolation to sample height (matches shader texture() and heightmap raycast)
            uv[0] = u;
            uv[1] = v;
            const heightValue = sampleHeightBilinear(uv, simres, heightMapBuffer);
            
            // Convert height to world space (matching terrain-vert.glsl calculation)
            // In shader: yval = texture(hightmap, vs_Uv).x / u_SimRes
            const worldHeight = heightValue / simres;
            
            // Position vertices in world space
            // Match coordinate system: terrain spans from -0.5 to 0.5 in X and Z
            // This matches the Plane geometry: x * normalize * scale + center - scale * 0.5
            // where center is (0,0,0) and scale is (1,1)
            const worldX = (u - 0.5) * scale;
            const worldY = worldHeight;
            const worldZ = (v - 0.5) * scale;
            
            positions[posIdx++] = worldX;
            positions[posIdx++] = worldY;
            positions[posIdx++] = worldZ;
            
            // Store UV coordinates for this vertex (for accurate interpolation)
            const uvIdx = (z * width + x) * 2;
            uvs[uvIdx] = u;
            uvs[uvIdx + 1] = v;
        }
    }
    
    // Generate indices for triangles (two triangles per quad)
    for (let z = 0; z < height - 1; z++) {
        for (let x = 0; x < width - 1; x++) {
            const topLeft = z * width + x;
            const topRight = z * width + x + 1;
            const bottomLeft = (z + 1) * width + x;
            const bottomRight = (z + 1) * width + x + 1;
            
            // First triangle: topLeft, bottomLeft, topRight
            indices.push(topLeft, bottomLeft, topRight);
            
            // Second triangle: topRight, bottomLeft, bottomRight
            indices.push(topRight, bottomLeft, bottomRight);
        }
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Compute bounding box for BVH
    geometry.computeBoundingBox();
    
    return geometry;
}

/**
 * Updates an existing terrain geometry with new heightmap data.
 * This is more efficient than creating a new geometry each time.
 * 
 * @param geometry - Existing BufferGeometry to update
 * @param simres - Simulation resolution
 * @param heightMapBuffer - Updated height data
 * @param scale - Scale factor
 */
export function updateTerrainGeometry(
    geometry: BufferGeometry,
    simres: number,
    heightMapBuffer: Float32Array,
    scale: number = 1.0
): void {
    const positionAttribute = geometry.getAttribute('position') as BufferAttribute;
    const uvAttribute = geometry.getAttribute('uv') as BufferAttribute;
    
    if (!positionAttribute) {
        console.warn('Terrain geometry has no position attribute');
        return;
    }
    
    const positions = positionAttribute.array as Float32Array;
    const uvs = uvAttribute ? uvAttribute.array as Float32Array : null;
    const width = simres;
    const height = simres;
    
    // Update vertex positions using bilinear interpolation
    let posIdx = 0;
    let uvIdx = 0;
    const uv = vec2.create();
    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const u = x / (width - 1);
            const v = z / (height - 1);
            
            // Use bilinear interpolation to match shader sampling
            uv[0] = u;
            uv[1] = v;
            const heightValue = sampleHeightBilinear(uv, simres, heightMapBuffer);
            
            const worldHeight = heightValue / simres;
            const worldX = (u - 0.5) * scale;
            const worldY = worldHeight;
            const worldZ = (v - 0.5) * scale;
            
            positions[posIdx++] = worldX;
            positions[posIdx++] = worldY;
            positions[posIdx++] = worldZ;
            
            // Update UV coordinates if they exist
            if (uvs) {
                uvs[uvIdx++] = u;
                uvs[uvIdx++] = v;
            }
        }
    }
    
    // Mark attributes as needing update
    positionAttribute.needsUpdate = true;
    if (uvAttribute) {
        uvAttribute.needsUpdate = true;
    }
    
    // Recompute bounding box
    geometry.computeBoundingBox();
}

