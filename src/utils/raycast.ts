import {vec2, vec3} from 'gl-matrix';

// Configuration constants for adaptive raycasting
const INITIAL_STEP_SIZE = 0.05;              // Larger step for initial traversal
const REFINEMENT_STEP_SIZE = 0.0005;        // Smaller step near terrain (reduced from 0.001 for better precision)
const ULTRA_REFINEMENT_STEP_SIZE = 0.00025; // Ultra-small step when very close to terrain
const TERRAIN_PROXIMITY_THRESHOLD = 0.02;   // Distance threshold to switch to refinement
const MAX_RAY_DISTANCE = 10.0;               // Maximum distance to search (increased from 2.0 to prevent missed hits)
const MAX_ITERATIONS = 200;                  // Maximum iterations (increased from 100)
const BINARY_SEARCH_ITERATIONS = 12;        // Number of binary search iterations for precise intersection (balanced for performance)
const BINARY_SEARCH_CONVERGENCE_THRESHOLD = 0.0001; // Early exit threshold when binary search positions are close enough

/**
 * Get height value from buffer at integer texel coordinates
 */
function getHeightAt(x: number, y: number, simres: number, buffer: Float32Array): number {
    // Clamp coordinates to valid range
    const clampedX = Math.max(0, Math.min(simres - 1, Math.floor(x)));
    const clampedY = Math.max(0, Math.min(simres - 1, Math.floor(y)));
    const index = clampedY * simres * 4 + clampedX * 4 + 0;
    if (index >= 0 && index < buffer.length) {
        return buffer[index];
    }
    return 0;
}

/**
 * Sample height using bilinear interpolation for smooth height values
 * Clamps UV to [0, 1] and texel indices to [0, simres - 1] to prevent out-of-bounds
 */
export function sampleHeightBilinear(uv: vec2, simres: number, buffer: Float32Array): number {
    // Clamp UV to [0, 1]
    const clampedU = Math.max(0, Math.min(1, uv[0]));
    const clampedV = Math.max(0, Math.min(1, uv[1]));
    
    // Calculate texel coordinates
    const x = clampedU * simres;
    const y = clampedV * simres;
    
    // Get integer and fractional parts
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, simres - 1);
    const y1 = Math.min(y0 + 1, simres - 1);
    const fx = x - x0;
    const fy = y - y0;
    
    // Sample 4 corners
    const h00 = getHeightAt(x0, y0, simres, buffer);
    const h10 = getHeightAt(x1, y0, simres, buffer);
    const h01 = getHeightAt(x0, y1, simres, buffer);
    const h11 = getHeightAt(x1, y1, simres, buffer);
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fy) + h1 * fy;
}

export function rayCast(
    ro: vec3,
    rd: vec3,
    simres: number,
    HightMapCpuBuf: Float32Array,
    out: vec2
): void {
    out[0] = -10.0;
    out[1] = -10.0;
    
    // Reusable temporary vectors to avoid allocations
    const cur = vec3.create();
    const prev = vec3.create();
    const curTexSpace = vec2.create();
    const scaledTexSpace = vec2.create();
    const rdscaled = vec3.create();
    const binarySearchStart = vec3.create();
    const binarySearchEnd = vec3.create();
    const binarySearchMid = vec3.create();
    
    vec3.copy(cur, ro);
    vec3.copy(prev, ro);
    let step = INITIAL_STEP_SIZE;
    let totalDistance = 0.0;
    let foundHit = false;
    let hitPosition = vec3.create();
    
    // Check if ray starts below terrain - if so, use current position as hit
    let startTexSpace = vec2.create();
    startTexSpace[0] = (ro[0] + 0.50) / 1.0;
    startTexSpace[1] = (ro[2] + 0.50) / 1.0;
    if (startTexSpace[0] >= 0.0 && startTexSpace[0] <= 1.0 && 
        startTexSpace[1] >= 0.0 && startTexSpace[1] <= 1.0) {
        // Use bilinear sampling for smooth height
        let startHval = sampleHeightBilinear(startTexSpace, simres, HightMapCpuBuf);
        let startTerrainHeight = startHval / simres;
        if (ro[1] <= startTerrainHeight) {
            // Ray starts at or below terrain, return current position
            out[0] = startTexSpace[0];
            out[1] = startTexSpace[1];
            return;
        }
    }
    
    // Main ray marching loop with adaptive step sizing
    for (let i = 0; i < MAX_ITERATIONS; ++i) {
        // Check if we've exceeded max distance
        if (totalDistance > MAX_RAY_DISTANCE) {
            break;
        }
        
        // Convert current position to texture space (unclamped for bounds checks)
        curTexSpace[0] = (cur[0] + 0.50) / 1.0;
        curTexSpace[1] = (cur[2] + 0.50) / 1.0;
        
        // Check bounds - early exit if out of valid terrain bounds
        if (curTexSpace[0] < 0.0 || curTexSpace[0] > 1.0 || 
            curTexSpace[1] < 0.0 || curTexSpace[1] > 1.0) {
            // Out of bounds, but continue if we haven't hit anything yet
            if (!foundHit) {
                rdscaled[0] = rd[0] * step;
                rdscaled[1] = rd[1] * step;
                rdscaled[2] = rd[2] * step;
                vec3.add(cur, cur, rdscaled);
                totalDistance += step;
                continue;
            } else {
                break;
            }
        }
        
        // Use bilinear sampling for smooth height values
        let hval = sampleHeightBilinear(curTexSpace, simres, HightMapCpuBuf);
        let terrainHeight = hval / simres;
        
        // Check if we've hit the terrain (first hit detection)
        if (cur[1] < terrainHeight) {
            // First hit detected - store position for binary search
            vec3.copy(hitPosition, cur);
            vec3.copy(binarySearchStart, prev);
            vec3.copy(binarySearchEnd, cur);
            foundHit = true;
            
            // Binary search refinement for precise intersection
            // Track best position found during search (closest to terrain surface)
            const bestPosition = vec3.create();
            let bestDistanceToSurface = Infinity;
            vec3.copy(bestPosition, binarySearchEnd);
            
            for (let j = 0; j < BINARY_SEARCH_ITERATIONS; ++j) {
                // Check convergence - if positions are very close, we're done
                const searchRange = vec3.distance(binarySearchStart, binarySearchEnd);
                if (searchRange < BINARY_SEARCH_CONVERGENCE_THRESHOLD) {
                    break; // Converged
                }
                
                vec3.lerp(binarySearchMid, binarySearchStart, binarySearchEnd, 0.5);
                
                // Check height at midpoint using bilinear sampling
                let midTexSpace = vec2.create();
                midTexSpace[0] = (binarySearchMid[0] + 0.50) / 1.0;
                midTexSpace[1] = (binarySearchMid[2] + 0.50) / 1.0;
                
                if (midTexSpace[0] < 0.0 || midTexSpace[0] > 1.0 || 
                    midTexSpace[1] < 0.0 || midTexSpace[1] > 1.0) {
                    break;
                }
                
                // Use bilinear sampling for smooth height
                let midHval = sampleHeightBilinear(midTexSpace, simres, HightMapCpuBuf);
                let midTerrainHeight = midHval / simres;
                
                // Track distance to surface for best position selection
                const distanceToSurface = Math.abs(binarySearchMid[1] - midTerrainHeight);
                if (distanceToSurface < bestDistanceToSurface) {
                    bestDistanceToSurface = distanceToSurface;
                    vec3.copy(bestPosition, binarySearchMid);
                }
                
                if (binarySearchMid[1] < midTerrainHeight) {
                    // Still below terrain, move start forward
                    vec3.copy(binarySearchStart, binarySearchMid);
                } else {
                    // Above terrain, move end back
                    vec3.copy(binarySearchEnd, binarySearchMid);
                }
            }
            
            // Use the best position found during binary search (already tracked for minimal distance to surface)
            // This avoids expensive candidate sampling while maintaining accuracy
            vec3.copy(hitPosition, bestPosition);
            
            // Simple validation: if position is significantly above terrain, fall back to previous position
            // This avoids expensive refinement passes while maintaining reasonable accuracy
            let finalTexSpace = vec2.create();
            finalTexSpace[0] = (hitPosition[0] + 0.50) / 1.0;
            finalTexSpace[1] = (hitPosition[2] + 0.50) / 1.0;
            
            if (finalTexSpace[0] >= 0.0 && finalTexSpace[0] <= 1.0 && 
                finalTexSpace[1] >= 0.0 && finalTexSpace[1] <= 1.0) {
                let finalHval = sampleHeightBilinear(finalTexSpace, simres, HightMapCpuBuf);
                let finalTerrainHeight = finalHval / simres;
                
                // Use resolution-dependent threshold for better precision at high resolutions
                const threshold = 0.001 * (1024 / simres);
                
                // If significantly above terrain, fall back to previous position
                if (hitPosition[1] > finalTerrainHeight + threshold * 2) {
                    vec3.copy(hitPosition, prev);
                }
            }
            
            // Convert to texture coordinates
            out[0] = (hitPosition[0] + 0.50) / 1.0;
            out[1] = (hitPosition[2] + 0.50) / 1.0;
            break;
        }
        
        // Adaptive step sizing: use smaller steps when approaching terrain
        let distanceToTerrain = Math.abs(cur[1] - terrainHeight);
        if (distanceToTerrain < TERRAIN_PROXIMITY_THRESHOLD * 0.5) {
            // Ultra-refinement tier: very small steps when extremely close to terrain
            step = ULTRA_REFINEMENT_STEP_SIZE;
        } else if (distanceToTerrain < TERRAIN_PROXIMITY_THRESHOLD) {
            step = REFINEMENT_STEP_SIZE;
        } else if (distanceToTerrain < TERRAIN_PROXIMITY_THRESHOLD * 2) {
            // Medium step size for intermediate distances
            step = INITIAL_STEP_SIZE * 0.5;
        } else {
            step = INITIAL_STEP_SIZE;
        }
        
        // Store previous position before stepping
        vec3.copy(prev, cur);
        
        // Step forward along ray
        rdscaled[0] = rd[0] * step;
        rdscaled[1] = rd[1] * step;
        rdscaled[2] = rd[2] * step;
        vec3.add(cur, cur, rdscaled);
        totalDistance += step;
    }
}

