import { BaseTerrainType } from './BaseTerrainType';
import { ThreeTerrainWrapper } from './ThreeTerrainWrapper';
import { getTerrainMethod } from './THREE.Terrain';
import { OrdinaryFBMTerrainType } from './types/OrdinaryFBMTerrainType';
import { DomainWarpTerrainType } from './types/DomainWarpTerrainType';
import { TerraceTerrainType } from './types/TerraceTerrainType';
import { VoronoiTerrainType } from './types/VoronoiTerrainType';
import { RidgeNoiseTerrainType } from './types/RidgeNoiseTerrainType';
import { BillowNoiseTerrainType } from './types/BillowNoiseTerrainType';
import { TurbulenceTerrainType } from './types/TurbulenceTerrainType';
import { CratersTerrainType } from './types/CratersTerrainType';
import { DunesTerrainType } from './types/DunesTerrainType';
import { CanyonsTerrainType } from './types/CanyonsTerrainType';
import { MountainsTerrainType } from './types/MountainsTerrainType';
import { BillowyRidgesTerrainType } from './types/BillowyRidgesTerrainType';

/**
 * Registry for all terrain types
 * Maps UI selections (numeric IDs and string names) to terrain type instances
 * 
 * Priority: Shader terrain types (0-11) are PRIMARY, THREE.Terrain methods are secondary/wrappers
 */
export class TerrainTypeRegistry {
  private shaderTypes: Map<number, BaseTerrainType> = new Map();
  private threeTerrainTypes: Map<string, BaseTerrainType> = new Map();
  private threeTerrainTypesRegistered: boolean = false;

  constructor() {
    this.registerShaderTypes();
    // THREE.Terrain types are registered lazily (when first accessed)
    // because ensureTerrainLibrary() must be called first (async)
  }

  /**
   * Register all 12 shader-based terrain types (PRIMARY)
   */
  private registerShaderTypes(): void {
    this.shaderTypes.set(0, new OrdinaryFBMTerrainType());
    this.shaderTypes.set(1, new DomainWarpTerrainType());
    this.shaderTypes.set(2, new TerraceTerrainType());
    this.shaderTypes.set(3, new VoronoiTerrainType());
    this.shaderTypes.set(4, new RidgeNoiseTerrainType());
    this.shaderTypes.set(5, new BillowNoiseTerrainType());
    this.shaderTypes.set(6, new TurbulenceTerrainType());
    this.shaderTypes.set(7, new CratersTerrainType());
    this.shaderTypes.set(8, new DunesTerrainType());
    this.shaderTypes.set(9, new CanyonsTerrainType());
    this.shaderTypes.set(10, new MountainsTerrainType());
    this.shaderTypes.set(11, new BillowyRidgesTerrainType());
  }

  /**
   * Register all 17 THREE.Terrain methods (SECONDARY)
   * Called lazily when first THREE.Terrain type is accessed
   */
  private registerThreeTerrainTypes(): void {
    if (this.threeTerrainTypesRegistered) return;
    
    const threeTerrainMethods = [
      'DiamondSquare',
      'Perlin',
      'Simplex',
      'Worley',
      'Cosine',
      'Fault',
      'Feature',
      'ParticleDeposition',
      'Value',
      'Weierstrass',
      'Brownian',
      'CosineLayers',
      'PerlinDiamond',
      'PerlinLayers',
      'SimplexLayers',
      'Hill',
      'HillIsland',
    ];

    for (const methodName of threeTerrainMethods) {
      try {
        const terrainMethod = getTerrainMethod(methodName);
        if (terrainMethod) {
          this.threeTerrainTypes.set(methodName, new ThreeTerrainWrapper(methodName, terrainMethod));
        } else {
          console.warn(`[TerrainTypeRegistry] THREE.Terrain method '${methodName}' not available`);
        }
      } catch (error) {
        // Silently fail - THREE.Terrain library may not be loaded yet
        // Will be registered when ensureTerrainLibrary() is called
      }
    }
    
    this.threeTerrainTypesRegistered = true;
  }

  /**
   * Get terrain type by numeric ID (for shader types 0-11)
   */
  getById(id: number): BaseTerrainType | null {
    return this.shaderTypes.get(id) || null;
  }

  /**
   * Get terrain type by string name (for THREE.Terrain methods)
   */
  getByName(name: string): BaseTerrainType | null {
    // Try lazy registration if not already done
    if (!this.threeTerrainTypesRegistered) {
      this.registerThreeTerrainTypes();
    }
    return this.threeTerrainTypes.get(name) || null;
  }

  /**
   * Get terrain type from UI selection (handles both numeric IDs and string names)
   */
  get(baseType: number | string): BaseTerrainType | null {
    // Accept numeric strings by coercing before lookup
    if (typeof baseType === 'string') {
      const asNumber = Number(baseType);
      if (Number.isFinite(asNumber)) {
        baseType = asNumber;
      }
    }

    if (typeof baseType === 'number') {
      // Numeric ID -> shader terrain type (0-11)
      return this.getById(baseType);
    }

    // String name -> THREE.Terrain method
    return this.getByName(baseType);
  }

  /**
   * Get all registered shader terrain types
   */
  getAllShaderTypes(): Map<number, BaseTerrainType> {
    return new Map(this.shaderTypes);
  }

  /**
   * Get all registered THREE.Terrain methods
   */
  getAllThreeTerrainTypes(): Map<string, BaseTerrainType> {
    return new Map(this.threeTerrainTypes);
  }
}

// Singleton instance
let registryInstance: TerrainTypeRegistry | null = null;

/**
 * Get the global terrain type registry instance
 */
export function getTerrainTypeRegistry(): TerrainTypeRegistry {
  if (!registryInstance) {
    registryInstance = new TerrainTypeRegistry();
  }
  return registryInstance;
}
