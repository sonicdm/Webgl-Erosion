import { BaseTerrainType } from '../BaseTerrainType';
import { TerrainGenerationOptions } from '../TerrainGenerationOptions';
import { fbm } from './terrain-noise-utils';

/**
 * Ordinary FBM terrain type (ID: 0)
 * Matches initial-frag.glsl: pow(fbm(cpos * 2.0) * 1.1, 3.0)
 * This is the default terrain type when no explicit type is selected
 */
export class OrdinaryFBMTerrainType extends BaseTerrainType {
  getName(): string {
    return 'OrdinaryFBM';
  }

  getDisplayName(): string {
    return 'Ordinary FBM';
  }

  getDefaultParams() {
    return {
      steps: 8, // Maps to OCTAVES in shader - currently 8
      turbulent: false, // FBM is smooth, not turbulent
      easing: 'Linear', // No easing needed for FBM
      smoothing: 'None', // FBM is already smooth
      size: 1024,
      ratio: 1.0,
      edges: {
        type: 'Box',
        direction: 'Normal',
        curve: 'Linear',
        distance: 256
      }
    };
  }

  generateHeightmap(zs: Float32Array | number[], options: TerrainGenerationOptions): void {
    const xSegments = options.xSegments;
    const ySegments = options.ySegments;
    const terrainScale = options.terrainScale;
    const timer = options.timer;
    const seedOffset = options.terrainRandom?.seedOffset || [0, 0];
    
    // Use new THREE parameters (with fallbacks for backward compatibility)
    const xSize = options.xSize ?? (terrainScale * 320.0);
    const ySize = options.ySize ?? (terrainScale * 320.0);
    const steps = options.terrainSteps ?? 8; // Default to 8 octaves (matches shader OCTAVES)
    const turbulent = options.terrainTurbulent ?? false;
    
    const xl = xSegments + 1;
    const yl = ySegments + 1;
    
    for (let y = 0; y < yl; y++) {
      for (let x = 0; x < xl; x++) {
        const idx = y * xl + x;
        const u = x / xSegments;
        const v = y / ySegments;
        
        // Calculate position using xSize/ySize for coordinate scaling
        // Scale UV coordinates by xSize/ySize to match world space
        const scaleX = xSize / 1024.0; // Normalize to default size of 1024
        const scaleY = ySize / 1024.0;
        const cpos: [number, number] = [
          1.5 * u * terrainScale * scaleX + (Math.sin(timer / 3.0) + 2.1) + seedOffset[0],
          1.5 * v * terrainScale * scaleY + (Math.cos(timer / 17.0) + 3.6) + seedOffset[1]
        ];
        
        // Use steps parameter for octave count in fbm
        let base_height: number;
        if (turbulent) {
          // Add domain warping for turbulent effect (similar to DomainWarp type)
          const warp1 = fbm(cpos, steps);
          const warp2 = fbm([cpos[0] + warp1, cpos[1] + warp1], steps);
          base_height = Math.pow(fbm([cpos[0] + warp2, cpos[1] + warp2], steps) * 1.1, 3.0);
        } else {
          // Match shader exactly: float base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0);
          base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0], steps) * 1.1, 3.0);
        }
        
        // Apply easing if provided (post-process before height scaling)
        let terrain_height = base_height;
        if (options.easing) {
          // Normalize height to [0,1] range for easing, then scale back
          // For FBM, heights are typically in [0,1] range already, but we'll be safe
          terrain_height = options.easing(Math.max(0, Math.min(1, base_height)));
        }
        
        // Apply height scaling (matching shader: terrain_height *= u_TerrainHeight*120.0)
        zs[idx] = terrain_height * options.terrainHeight * 120.0;
      }
    }
  }
}
