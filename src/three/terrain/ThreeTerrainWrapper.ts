import { BaseTerrainType } from './BaseTerrainType';
import { TerrainGenerationOptions } from './TerrainGenerationOptions';
import { getEasing } from './THREE.Terrain';

/**
 * Wrapper for THREE.Terrain methods
 * Adapts THREE.Terrain method signatures to our standardized BaseTerrainType interface
 * 
 * Supports all 17 THREE.Terrain methods:
 * - DiamondSquare, Perlin, Simplex, Worley, Cosine, Fault, Feature, ParticleDeposition
 * - Value, Weierstrass, Brownian, CosineLayers, PerlinDiamond, PerlinLayers
 * - SimplexLayers, Hill, HillIsland
 */
export class ThreeTerrainWrapper extends BaseTerrainType {
  constructor(
    private methodName: string,
    private terrainMethod: (zs: Float32Array | number[], options: any) => void
  ) {
    super();
  }

  getName(): string {
    return this.methodName;
  }

  getDisplayName(): string {
    // Convert method name to display format (e.g., "DiamondSquare" -> "Diamond Square")
    return this.methodName.replace(/([A-Z])/g, ' $1').trim();
  }

  getDefaultParams() {
    // Default parameters for THREE.Terrain methods based on their characteristics
    // These defaults are tuned to make each method look its best
    const defaults: Record<string, {
      steps?: number;
      turbulent?: boolean;
      easing?: string;
      smoothing?: string;
      size?: number;
      ratio?: number;
    }> = {
      'DiamondSquare': { steps: 4, turbulent: false, easing: 'Linear', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Perlin': { steps: 5, turbulent: false, easing: 'EaseOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Simplex': { steps: 5, turbulent: false, easing: 'EaseOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Worley': { steps: 1, turbulent: false, easing: 'Linear', smoothing: 'Gaussian 0.5,7', size: 1024, ratio: 1.0 },
      'Cosine': { steps: 3, turbulent: false, easing: 'EaseInOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Fault': { steps: 6, turbulent: false, easing: 'Linear', smoothing: 'Conservative 0.5', size: 1024, ratio: 1.0 },
      'Feature': { steps: 4, turbulent: false, easing: 'EaseIn', smoothing: 'Gaussian 0.5,7', size: 1024, ratio: 1.0 },
      'ParticleDeposition': { steps: 3, turbulent: false, easing: 'EaseOut', smoothing: 'Mean 1', size: 1024, ratio: 1.0 },
      'Value': { steps: 4, turbulent: false, easing: 'Linear', smoothing: 'Gaussian 0.5,7', size: 1024, ratio: 1.0 },
      'Weierstrass': { steps: 6, turbulent: false, easing: 'EaseInOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Brownian': { steps: 7, turbulent: true, easing: 'EaseInOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'CosineLayers': { steps: 6, turbulent: false, easing: 'EaseInOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'PerlinDiamond': { steps: 5, turbulent: false, easing: 'EaseOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'PerlinLayers': { steps: 6, turbulent: false, easing: 'EaseOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'SimplexLayers': { steps: 6, turbulent: false, easing: 'EaseOut', smoothing: 'None', size: 1024, ratio: 1.0 },
      'Hill': { steps: 6, turbulent: false, easing: 'EaseIn', smoothing: 'Gaussian 0.5,7', size: 1024, ratio: 1.0 },
      'HillIsland': { steps: 6, turbulent: false, easing: 'EaseIn', smoothing: 'Gaussian 0.5,7', size: 1024, ratio: 1.0 },
    };

    const methodDefaults = defaults[this.methodName] || {
      steps: 4,
      turbulent: false,
      easing: 'Linear',
      smoothing: 'None',
      size: 1024,
      ratio: 1.0
    };

    return {
      steps: methodDefaults.steps,
      turbulent: methodDefaults.turbulent,
      easing: methodDefaults.easing,
      smoothing: methodDefaults.smoothing,
      size: methodDefaults.size,
      ratio: methodDefaults.ratio,
      edges: {
        type: 'Box',
        direction: 'Normal',
        curve: 'Linear',
        distance: 256
      }
    };
  }

  generateHeightmap(zs: Float32Array | number[], options: TerrainGenerationOptions): void {
    // Map standardized options to THREE.Terrain format
    const threeTerrainOptions: any = {
      xSegments: options.xSegments,
      ySegments: options.ySegments,
      xSize: options.xSize,
      ySize: options.ySize,
      steps: options.terrainSteps,
      turbulent: options.terrainTurbulent,
    };

    // Add optional THREE.Terrain parameters if provided
    if (options.frequency !== undefined) {
      threeTerrainOptions.frequency = options.frequency;
    }
    if (options.easing !== undefined) {
      threeTerrainOptions.easing = options.easing;
    } else {
      // Default to Linear easing if not provided
      threeTerrainOptions.easing = getEasing('Linear');
    }
    if (options.after !== undefined) {
      threeTerrainOptions.after = options.after;
    }

    // Call the THREE.Terrain method with mapped options
    // THREE.Terrain methods modify zs in place
    this.terrainMethod(zs, threeTerrainOptions);
  }
}
