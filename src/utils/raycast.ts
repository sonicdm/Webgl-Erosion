import {vec2, vec3} from 'gl-matrix';

// Configuration constants for adaptive raycasting
const INITIAL_STEP_SIZE = 0.05;              // Larger step for initial traversal
const REFINEMENT_STEP_SIZE = 0.001;         // Smaller step near terrain
const TERRAIN_PROXIMITY_THRESHOLD = 0.02;   // Distance threshold to switch to refinement
const MAX_RAY_DISTANCE = 2.0;                // Maximum distance to search
const MAX_ITERATIONS = 200;                  // Maximum iterations (increased from 100)

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
        let startScaledTexSpace = vec2.create();
        startScaledTexSpace[0] = startTexSpace[0] * simres;
        startScaledTexSpace[1] = startTexSpace[1] * simres;
        vec2.floor(startScaledTexSpace, startScaledTexSpace);
        let startHvalcoordinate = startScaledTexSpace[1] * simres * 4 + startScaledTexSpace[0] * 4 + 0;
        if (startHvalcoordinate >= 0 && startHvalcoordinate < HightMapCpuBuf.length) {
            let startHval = HightMapCpuBuf[startHvalcoordinate];
            let startTerrainHeight = startHval / simres;
            if (ro[1] <= startTerrainHeight) {
                // Ray starts at or below terrain, return current position
                out[0] = startTexSpace[0];
                out[1] = startTexSpace[1];
                return;
            }
        }
    }
    
    // Main ray marching loop with adaptive step sizing
    for (let i = 0; i < MAX_ITERATIONS; ++i) {
        // Check if we've exceeded max distance
        if (totalDistance > MAX_RAY_DISTANCE) {
            break;
        }
        
        // Convert current position to texture space
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
        
        // Calculate buffer index
        scaledTexSpace[0] = curTexSpace[0] * simres;
        scaledTexSpace[1] = curTexSpace[1] * simres;
        vec2.floor(scaledTexSpace, scaledTexSpace);
        let hvalcoordinate = scaledTexSpace[1] * simres * 4 + scaledTexSpace[0] * 4 + 0;
        
        // Only access buffer if coordinate is valid
        if (hvalcoordinate >= 0 && hvalcoordinate < HightMapCpuBuf.length) {
            let hval = HightMapCpuBuf[hvalcoordinate];
            let terrainHeight = hval / simres;
            
            // Check if we've hit the terrain (first hit detection)
            if (cur[1] < terrainHeight) {
                // First hit detected - store position for binary search
                vec3.copy(hitPosition, cur);
                vec3.copy(binarySearchStart, prev);
                vec3.copy(binarySearchEnd, cur);
                foundHit = true;
                
                // Binary search refinement for precise intersection
                for (let j = 0; j < 10; ++j) {
                    vec3.lerp(binarySearchMid, binarySearchStart, binarySearchEnd, 0.5);
                    
                    // Check height at midpoint
                    let midTexSpace = vec2.create();
                    midTexSpace[0] = (binarySearchMid[0] + 0.50) / 1.0;
                    midTexSpace[1] = (binarySearchMid[2] + 0.50) / 1.0;
                    
                    if (midTexSpace[0] < 0.0 || midTexSpace[0] > 1.0 || 
                        midTexSpace[1] < 0.0 || midTexSpace[1] > 1.0) {
                        break;
                    }
                    
                    let midScaledTexSpace = vec2.create();
                    midScaledTexSpace[0] = midTexSpace[0] * simres;
                    midScaledTexSpace[1] = midTexSpace[1] * simres;
                    vec2.floor(midScaledTexSpace, midScaledTexSpace);
                    let midHvalcoordinate = midScaledTexSpace[1] * simres * 4 + midScaledTexSpace[0] * 4 + 0;
                    
                    if (midHvalcoordinate >= 0 && midHvalcoordinate < HightMapCpuBuf.length) {
                        let midHval = HightMapCpuBuf[midHvalcoordinate];
                        let midTerrainHeight = midHval / simres;
                        
                        if (binarySearchMid[1] < midTerrainHeight) {
                            // Still below terrain, move start forward
                            vec3.copy(binarySearchStart, binarySearchMid);
                        } else {
                            // Above terrain, move end back
                            vec3.copy(binarySearchEnd, binarySearchMid);
                        }
                    } else {
                        break;
                    }
                }
                
                // Use refined position, but ensure it's still valid
                vec3.copy(hitPosition, binarySearchEnd);
                
                // Verify the final position is still valid (within bounds and below/at terrain)
                let finalTexSpace = vec2.create();
                finalTexSpace[0] = (hitPosition[0] + 0.50) / 1.0;
                finalTexSpace[1] = (hitPosition[2] + 0.50) / 1.0;
                
                if (finalTexSpace[0] >= 0.0 && finalTexSpace[0] <= 1.0 && 
                    finalTexSpace[1] >= 0.0 && finalTexSpace[1] <= 1.0) {
                    let finalScaledTexSpace = vec2.create();
                    finalScaledTexSpace[0] = finalTexSpace[0] * simres;
                    finalScaledTexSpace[1] = finalTexSpace[1] * simres;
                    vec2.floor(finalScaledTexSpace, finalScaledTexSpace);
                    let finalHvalcoordinate = finalScaledTexSpace[1] * simres * 4 + finalScaledTexSpace[0] * 4 + 0;
                    
                    if (finalHvalcoordinate >= 0 && finalHvalcoordinate < HightMapCpuBuf.length) {
                        let finalHval = HightMapCpuBuf[finalHvalcoordinate];
                        let finalTerrainHeight = finalHval / simres;
                        
                        // If binary search moved us above terrain, use the previous position instead
                        if (hitPosition[1] > finalTerrainHeight + 0.001) {
                            vec3.copy(hitPosition, prev);
                        }
                    }
                }
                
                // Convert to texture coordinates
                out[0] = (hitPosition[0] + 0.50) / 1.0;
                out[1] = (hitPosition[2] + 0.50) / 1.0;
                break;
            }
            
            // Adaptive step sizing: use smaller steps when approaching terrain
            let distanceToTerrain = Math.abs(cur[1] - terrainHeight);
            if (distanceToTerrain < TERRAIN_PROXIMITY_THRESHOLD) {
                step = REFINEMENT_STEP_SIZE;
            } else if (distanceToTerrain < TERRAIN_PROXIMITY_THRESHOLD * 2) {
                // Medium step size for intermediate distances
                step = INITIAL_STEP_SIZE * 0.5;
            } else {
                step = INITIAL_STEP_SIZE;
            }
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

