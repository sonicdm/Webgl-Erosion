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
