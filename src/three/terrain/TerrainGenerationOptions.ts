import * as THREE from 'three';

/**
 * Standardized interface for terrain generation options
 * All terrain types (shader-based and THREE.Terrain methods) receive the same options structure
 * Individual implementations can ignore parameters they don't use
 */
export interface TerrainGenerationOptions {
  // Geometry parameters (from THREE.Terrain)
  xSegments: number;
  ySegments: number;
  xSize: number;
  ySize: number;
  
  // UI parameters (standardized - all terrain types receive these)
  terrainScale: number;        // TerrainScale from UI
  terrainHeight: number;       // TerrainHeight from UI
  terrainMask: number;         // TerrainMask from UI (used in post-process, not here)
  terrainSteps: number;        // TerrainSteps from UI
  terrainTurbulent: boolean;   // TerrainTurbulent from UI
  timer: number;               // Current simulation timer
  
  // THREE.Terrain specific parameters
  frequency?: number;          // Frequency parameter for THREE.Terrain methods (controls noise frequency)
  easing?: (t: number) => number; // Easing function for THREE.Terrain
  after?: (vertices: THREE.Vector3[], options: TerrainGenerationOptions) => void; // Post-processing callback
  
  // THREE.Terrain advanced parameters
  terrainEasing?: string; // Easing function name: 'Linear', 'EaseIn', 'EaseOut', 'EaseInOut', 'InEaseOut'
  terrainSize?: number; // World-space terrain size (512-4096)
  terrainWidthLengthRatio?: number; // Aspect ratio for non-square terrains (0.2-2.0)
  terrainSmoothing?: string; // Post-process smoothing: 'None', 'Conservative', 'Gaussian', 'Mean', 'Median' variants
  terrainEdgeType?: 'Box' | 'Radial'; // Edge falloff type
  terrainEdgeDirection?: 'Normal' | 'Up' | 'Down'; // Edge falloff direction
  terrainEdgeCurve?: 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut'; // Edge falloff curve
  terrainEdgeDistance?: number; // Edge falloff distance (0-512)
  
  // Random seed parameters (for custom terrain types)
  terrainRandom?: {
    seedOffset: [number, number];
    duneDir: [number, number];
    craterDensity: number;
    canyonDepth: number;
  };
}
