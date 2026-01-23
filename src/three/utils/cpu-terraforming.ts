import * as THREE from 'three';
import { vec2, vec3 } from 'gl-matrix';

/**
 * CPU-side terraforming: Directly modifies terrain geometry vertices based on brush operations.
 * This avoids the need for GPU readback which doesn't work with float textures.
 * 
 * Based on Three.js terrain sculpting approach:
 * 1. Find vertices within brush radius using UV coordinates
 * 2. Modify vertex positions directly
 * 3. Update normals and mark geometry for update
 */

export interface TerraformParams {
  brushPos: [number, number]; // UV coordinates [0-1, 0-1]
  brushSize: number; // Brush size (0-20, matches shader)
  brushStrength: number; // Brush strength (0-1)
  brushType: number; // 1=terrain, 2=water, 3=rock, 4=smooth, 5=flatten, 6=slope
  brushOperation: number; // 0=add/raise, 1=subtract/lower
  flattenTargetHeight?: number; // For flatten brush
  slopeStartPos?: [number, number]; // For slope brush
  slopeEndPos?: [number, number]; // For slope brush
}

/**
 * Applies terraforming to terrain geometry based on brush parameters.
 * Modifies vertex positions directly on CPU side.
 */
export function applyTerraforming(
  geometry: THREE.BufferGeometry,
  simres: number,
  params: TerraformParams
): void {
  const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uvAttribute = geometry.getAttribute('uv') as THREE.BufferAttribute;
  
  if (!positionAttribute) {
    console.warn('[Terraforming] Geometry has no position attribute');
    return;
  }
  
  const positions = positionAttribute.array as Float32Array;
  const uvs = uvAttribute ? uvAttribute.array as Float32Array : null;
  
  // Get actual vertex count from geometry
  const vertexCount = positionAttribute.count;
  const width = simres;
  const height = simres;
  
  // Validate inputs
  if (vertexCount === 0 || positions.length < vertexCount * 3) {
    console.warn('[Terraforming] Invalid geometry - vertex count mismatch');
    return;
  }
  
  // Brush radius in UV space (matches shader: 0.01 * u_BrushSize)
  const brushRadiusUV = 0.01 * params.brushSize;
  const brushCenterUV: vec2 = [params.brushPos[0], params.brushPos[1]];
  
  // Amount to modify in world space
  // Shader: addterrain = 0.0006 * u_BrushStrength * 280.0 (in texture space, per frame)
  // Texture stores: storedHeight = worldHeight * simres
  // So texture delta = 0.0006 * strength * 280.0
  // World delta = textureDelta / simres = (0.0006 * strength * 280.0) / simres
  // 
  // The shader's per-frame delta is extremely small (0.000041 for strength=0.25, simres=1024)
  // and accumulates over many frames. For CPU-side terraforming to be immediately visible,
  // we need to scale it significantly.
  //
  // Reference: skulpt.js uses 0.04 units per operation on a 10-unit terrain (0.4% of terrain size)
  // Our terrain has height range ~240 units (-100 to 140), so 0.4% would be ~0.96 units
  // Since we apply every frame (not per operation), we use a smaller per-frame amount
  // but still need it to be visible. Scale based on typical terrain height range.
  const textureSpaceDelta = 0.0006 * params.brushStrength * 280.0;
  const baseWorldDelta = textureSpaceDelta / simres;
  
  // Scale to be visible: target ~0.1-0.2 units per frame for immediate visibility
  // This is roughly 0.04-0.08% of height range per frame, which accumulates quickly
  // Multiply by a factor that makes it visually noticeable (similar to skulpt's 0.04 on 10-unit terrain)
  const terrainHeightRange = 240.0; // Approximate height range (-100 to 140)
  const targetPercentOfRange = 0.08; // 0.08% of height range per frame = ~0.19 units
  const scaleFactor = (terrainHeightRange * targetPercentOfRange) / baseWorldDelta;
  const baseAmount = baseWorldDelta * scaleFactor;
  
  // Track if any vertices were modified
  let modified = false;
  let verticesInBrush = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let avgHeightBefore = 0;
  let avgHeightAfter = 0;
  let heightSumBefore = 0;
  let heightSumAfter = 0;
  
  // Iterate through all vertices (handle both grid and non-grid geometries)
  for (let i = 0; i < vertexCount; i++) {
    const posIdx = i * 3;
    
    // Bounds check
    if (posIdx + 2 >= positions.length) {
      continue;
    }
    
    // Get UV coordinates for this vertex
    let u: number, v: number;
    if (uvs && i * 2 + 1 < uvs.length) {
      const uvIdx = i * 2;
      u = uvs[uvIdx];
      v = uvs[uvIdx + 1];
    } else {
      // For non-grid geometries, try to calculate UV from position
      // This is a fallback - ideally geometry should have UVs
      const x = positions[posIdx];
      const z = positions[posIdx + 2];
      u = (x + 0.5) / 1.0; // Assuming terrain spans -0.5 to 0.5
      v = (z + 0.5) / 1.0;
    }
    
    // Validate UV coordinates
    if (isNaN(u) || isNaN(v) || !isFinite(u) || !isFinite(v)) {
      continue;
    }
    
    // Check if vertex is within brush radius
    const vertexUV: vec2 = [u, v];
    const distToBrush = vec2.distance(vertexUV, brushCenterUV);
    
    if (distToBrush < brushRadiusUV) {
      verticesInBrush++;
      
      // Calculate density (falloff from center) - matches shader formula
      // Shader: dens = (0.01 * u_BrushSize - pdis2fragment * 0.5) / (0.01 * u_BrushSize)
      // This creates a more gradual falloff than simple linear
      const dens = Math.max(0.0, (brushRadiusUV - distToBrush * 0.5) / brushRadiusUV);
      
      // Get current height (Y position) - validate it's not NaN
      const currentHeight = positions[posIdx + 1];
      if (isNaN(currentHeight) || !isFinite(currentHeight)) {
        continue; // Skip invalid vertices
      }
        
        let heightDelta = 0.0;
        
        // Apply brush type logic (matching rain-frag.glsl)
        if (params.brushType === 1) {
          // Terrain brush - raise/lower
          // IMPORTANT: Shader does NOT use density for terrain brush (line 151: addterrain = amount * 1.0 * 280.0)
          // All vertices within brush radius get the same delta, preserving relative heights
          heightDelta = baseAmount; // No density multiplication - matches shader behavior
          heightDelta = params.brushOperation === 0 ? heightDelta : -heightDelta;
        } else if (params.brushType === 2) {
          // Water brush - handled by GPU shader, skip here
          continue;
        } else if (params.brushType === 3) {
          // Rock brush - handled by GPU shader (modifies texture channel), skip here
          continue;
        } else if (params.brushType === 4) {
          // Smooth brush - average with neighbors
          // For non-grid geometries, skip smooth brush (would need spatial neighbor finding)
          // This is a simplified version that only works for grid geometries
          if (params.brushOperation === 0 && vertexCount === width * height) {
            // Only do neighbor smoothing if we have a grid geometry
            const z = Math.floor(i / width);
            const x = i % width;
            
            let neighborSum = 0.0;
            let neighborCount = 0;
            
            if (z > 0) {
              const topIdx = ((z - 1) * width + x) * 3;
              if (topIdx + 1 < positions.length) {
                const h = positions[topIdx + 1];
                if (!isNaN(h) && isFinite(h)) {
                  neighborSum += h;
                  neighborCount++;
                }
              }
            }
            if (x < width - 1) {
              const rightIdx = (z * width + (x + 1)) * 3;
              if (rightIdx + 1 < positions.length) {
                const h = positions[rightIdx + 1];
                if (!isNaN(h) && isFinite(h)) {
                  neighborSum += h;
                  neighborCount++;
                }
              }
            }
            if (z < height - 1) {
              const bottomIdx = ((z + 1) * width + x) * 3;
              if (bottomIdx + 1 < positions.length) {
                const h = positions[bottomIdx + 1];
                if (!isNaN(h) && isFinite(h)) {
                  neighborSum += h;
                  neighborCount++;
                }
              }
            }
            if (x > 0) {
              const leftIdx = (z * width + (x - 1)) * 3;
              if (leftIdx + 1 < positions.length) {
                const h = positions[leftIdx + 1];
                if (!isNaN(h) && isFinite(h)) {
                  neighborSum += h;
                  neighborCount++;
                }
              }
            }
            
            if (neighborCount > 0) {
              const avgHeight = neighborSum / neighborCount;
              const smoothAmount = dens * params.brushStrength * 0.1;
              heightDelta = (avgHeight - currentHeight) * smoothAmount;
            }
          }
        } else if (params.brushType === 5) {
          // Flatten brush - move toward target height
          if (params.brushOperation === 0 && params.flattenTargetHeight !== undefined) {
            // Convert target height from 0-500 range to world space (matching shader)
            // Shader: targetHeightTextureSpace = u_FlattenTargetHeight * (maxTextureHeight / 500.0)
            // Then world height = textureSpace / simres
            const maxTextureHeight = 2000.30;
            const targetHeightWorld = (params.flattenTargetHeight * (maxTextureHeight / 500.0)) / simres;
            if (isFinite(targetHeightWorld)) {
              const flattenAmount = dens * params.brushStrength * 0.2;
              heightDelta = (targetHeightWorld - currentHeight) * flattenAmount;
            }
          }
        } else if (params.brushType === 6) {
          // Slope brush - create slope between two points
          if (params.slopeStartPos && params.slopeEndPos) {
            const slopeDir: vec2 = [
              params.slopeEndPos[0] - params.slopeStartPos[0],
              params.slopeEndPos[1] - params.slopeStartPos[1]
            ];
            const slopeLength = vec2.length(slopeDir);
            
            if (slopeLength > 0.001) {
              const slopeDirNorm: vec2 = [slopeDir[0] / slopeLength, slopeDir[1] / slopeLength];
              
              // Project vertex onto slope line
              const toVertex: vec2 = [
                vertexUV[0] - params.slopeStartPos[0],
                vertexUV[1] - params.slopeStartPos[1]
              ];
              const projDist = vec2.dot(toVertex, slopeDirNorm);
              
              // Get heights at start and end (sample from current positions)
              // For simplicity, use current height at those UV positions
              // In a full implementation, we'd sample the actual heights
              const t = Math.max(0, Math.min(1, projDist / slopeLength));
              
              // Calculate target height (interpolate between start and end)
              // For now, use a simple approach - in full implementation, sample actual heights
              const targetHeight = currentHeight; // Placeholder
              const slopeAmount = dens * params.brushStrength * 0.3;
              heightDelta = (targetHeight - currentHeight) * slopeAmount;
            }
          }
        }
        
        // Apply height delta - validate it's finite before applying
        if (heightDelta !== 0.0 && isFinite(heightDelta) && Math.abs(heightDelta) > 0.000001) {
          const newHeight = currentHeight + heightDelta;
          
          // Clamp to valid range
          // NOTE: The shader clamps texture space to [-0.10, 2000.30], which in world space is [-0.0001, 1.95]
          // However, THREE.Terrain generates geometry with heights in range [-100, 140] (world space)
          // Since we're modifying geometry directly (not texture), we should allow the full geometry range
          // Use a reasonable clamp range that matches THREE.Terrain's output range
          // For safety, clamp to a wider range than shader to allow terraforming to work
          const minWorldHeight = -200.0; // Allow lower than THREE.Terrain's -100
          const maxWorldHeight = 300.0;  // Allow higher than THREE.Terrain's ~140
          const clampedHeight = Math.max(minWorldHeight, Math.min(maxWorldHeight, newHeight));
          
          // Final validation - ensure result is finite and actually changed
          if (isFinite(clampedHeight) && !isNaN(clampedHeight) && Math.abs(clampedHeight - currentHeight) > 0.000001) {
            // Track height statistics
            heightSumBefore += currentHeight;
            heightSumAfter += clampedHeight;
            minHeight = Math.min(minHeight, clampedHeight);
            maxHeight = Math.max(maxHeight, clampedHeight);
            
            positions[posIdx + 1] = clampedHeight;
            modified = true;
          }
        }
      }
    }
  
  // Mark geometry for update if modified
  if (modified) {
    positionAttribute.needsUpdate = true;
    
    // Recompute normals for correct lighting
    geometry.computeVertexNormals();
    
    // Update bounding box
    geometry.computeBoundingBox();
    
    // Log concise summary
    avgHeightBefore = heightSumBefore / verticesInBrush;
    avgHeightAfter = heightSumAfter / verticesInBrush;
    const avgDelta = avgHeightAfter - avgHeightBefore;
    
    console.log(`[Terraforming] Modified ${verticesInBrush} vertices | Avg height: ${avgHeightBefore.toFixed(4)} → ${avgHeightAfter.toFixed(4)} (Δ${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(4)}) | Range: [${minHeight.toFixed(4)}, ${maxHeight.toFixed(4)}]`);
  } else if (verticesInBrush === 0) {
    console.warn(`[Terraforming] No vertices found within brush radius ${brushRadiusUV.toFixed(4)} at position [${params.brushPos[0].toFixed(3)}, ${params.brushPos[1].toFixed(3)}]`);
  }
}
