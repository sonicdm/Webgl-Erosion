/**
 * Shader configuration describing paths, uniforms, and defines
 */
export interface ShaderConfig {
  name: string;
  vertPath?: string;  // Optional vertex shader path
  fragPath?: string;  // Optional fragment shader path
  uniforms?: string[]; // Expected uniform names (for validation)
  defines?: Record<string, string | number>; // Shader defines/preprocessor values
  domain: 'water' | 'sediment' | 'thermal' | 'lava' | 'terrain' | 'common';
}

/**
 * Shader ID type - union of all valid shader identifiers
 */
export type ShaderId = 
  // Water domain
  | 'rain' | 'flow' | 'waterHeight' | 'evaporation' | 'waterVert' | 'waterFrag'
  // Sediment domain
  | 'sediment' | 'sedimentAdvect' | 'maccormack' | 'average'
  // Thermal domain
  | 'maxSlippageHeight' | 'thermalFlux' | 'thermalApply'
  // Lava domain
  | 'lavaFlow' | 'lavaUpdate' | 'lavaTerrain'
  // Terrain domain
  | 'initial' | 'terrainProceduralFrag' | 'terrainProceduralVert' | 'terrainFrag' | 'terrainVert' | 'shadowmapFrag' | 'shadowmapVert'
  // Common domain
  | 'quadVert' | 'clean' | 'flatFrag' | 'flatVert' | 'velocityAdvect' | 'combine' | 'sceneDepth' | 'bilateralBlur';

/**
 * Import all shader sources at module load time
 * These are statically analyzed by Vite/TypeScript at build time
 */
// Water domain shaders
import rainFragSource from './water/rain-frag.glsl?raw';
import flowFragSource from './water/flow-frag.glsl?raw';
import waterHeightFragSource from './water/water-height-frag.glsl?raw';
import evaporationFragSource from './water/evaporation-frag.glsl?raw';
import waterVertSource from './water/water-vert.glsl?raw';
import waterFragSource from './water/water-frag.glsl?raw';

// Sediment domain shaders
import sedimentFragSource from './sediment/sediment-frag.glsl?raw';
import sedimentAdvectFragSource from './sediment/sediment-advect-frag.glsl?raw';
import maccormackFragSource from './sediment/maccormack-frag.glsl?raw';
import averageFragSource from './sediment/average-frag.glsl?raw';

// Thermal domain shaders
import maxSlippageHeightFragSource from './thermal/max-slippage-height-frag.glsl?raw';
import thermalFluxFragSource from './thermal/thermal-flux-frag.glsl?raw';
import thermalApplyFragSource from './thermal/thermal-apply-frag.glsl?raw';

// Lava domain shaders
import lavaFlowFragSource from './lava/lava-flow-frag.glsl?raw';
import lavaUpdateFragSource from './lava/lava-update-frag.glsl?raw';
import lavaTerrainFragSource from './lava/lava-terrain-frag.glsl?raw';

// Terrain domain shaders
import initialFragSource from './terrain/initial-frag.glsl?raw';
import terrainProceduralFragSource from './terrain/terrain-procedural-frag.glsl?raw';
import terrainProceduralVertSource from './terrain/terrain-procedural-vert.glsl?raw';
import terrainFragSource from './terrain/terrain-frag.glsl?raw';
import terrainVertSource from './terrain/terrain-vert.glsl?raw';
import shadowmapFragSource from './terrain/shadowmap-frag.glsl?raw';
import shadowmapVertSource from './terrain/shadowmap-vert.glsl?raw';

// Common domain shaders
import quadVertSource from './common/quad-vert.glsl?raw';
import cleanFragSource from './common/clean-frag.glsl?raw';
import flatFragSource from './common/flat-frag.glsl?raw';
import flatVertSource from './common/flat-vert.glsl?raw';
import velocityAdvectFragSource from './common/velocity-advect-frag.glsl?raw';
import combineFragSource from './common/combine-frag.glsl?raw';
import sceneDepthFragSource from './common/scene-depth-frag.glsl?raw';
import bilateralBlurFragSource from './common/bilateral-blur-frag.glsl?raw';

/**
 * Shader source map - maps paths to imported shader sources
 * This is populated by importing all shaders at module load time
 */
const SHADER_SOURCE_MAP: Record<string, string> = {
  // Water domain
  'shaders/water/rain-frag.glsl': rainFragSource,
  'shaders/water/flow-frag.glsl': flowFragSource,
  'shaders/water/water-height-frag.glsl': waterHeightFragSource,
  'shaders/water/evaporation-frag.glsl': evaporationFragSource,
  'shaders/water/water-vert.glsl': waterVertSource,
  'shaders/water/water-frag.glsl': waterFragSource,
  
  // Sediment domain
  'shaders/sediment/sediment-frag.glsl': sedimentFragSource,
  'shaders/sediment/sediment-advect-frag.glsl': sedimentAdvectFragSource,
  'shaders/sediment/maccormack-frag.glsl': maccormackFragSource,
  'shaders/sediment/average-frag.glsl': averageFragSource,
  
  // Thermal domain
  'shaders/thermal/max-slippage-height-frag.glsl': maxSlippageHeightFragSource,
  'shaders/thermal/thermal-flux-frag.glsl': thermalFluxFragSource,
  'shaders/thermal/thermal-apply-frag.glsl': thermalApplyFragSource,
  
  // Lava domain
  'shaders/lava/lava-flow-frag.glsl': lavaFlowFragSource,
  'shaders/lava/lava-update-frag.glsl': lavaUpdateFragSource,
  'shaders/lava/lava-terrain-frag.glsl': lavaTerrainFragSource,
  
  // Terrain domain
  'shaders/terrain/initial-frag.glsl': initialFragSource,
  'shaders/terrain/terrain-procedural-frag.glsl': terrainProceduralFragSource,
  'shaders/terrain/terrain-procedural-vert.glsl': terrainProceduralVertSource,
  'shaders/terrain/terrain-frag.glsl': terrainFragSource,
  'shaders/terrain/terrain-vert.glsl': terrainVertSource,
  'shaders/terrain/shadowmap-frag.glsl': shadowmapFragSource,
  'shaders/terrain/shadowmap-vert.glsl': shadowmapVertSource,
  
  // Common domain
  'shaders/common/quad-vert.glsl': quadVertSource,
  'shaders/common/clean-frag.glsl': cleanFragSource,
  'shaders/common/flat-frag.glsl': flatFragSource,
  'shaders/common/flat-vert.glsl': flatVertSource,
  'shaders/common/velocity-advect-frag.glsl': velocityAdvectFragSource,
  'shaders/common/combine-frag.glsl': combineFragSource,
  'shaders/common/scene-depth-frag.glsl': sceneDepthFragSource,
  'shaders/common/bilateral-blur-frag.glsl': bilateralBlurFragSource,
};

/**
 * Shader manifest providing typed access to shader configurations
 * Centralizes shader discovery, naming, and access
 */
export class ShaderManifest {
  private shaders: Map<ShaderId, ShaderConfig> = new Map();

  constructor() {
    this.registerAllShaders();
  }

  /**
   * Registers all shader configurations
   */
  private registerAllShaders(): void {
    // Water domain
    this.registerShader('rain', {
      name: 'rain',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/water/rain-frag.glsl',
      uniforms: ['u_time', 'u_SimRes', 'u_BrushPos', 'u_RainDegree'],
      domain: 'water',
    });
    
    this.registerShader('flow', {
      name: 'flow',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/water/flow-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'water',
    });
    
    this.registerShader('waterHeight', {
      name: 'waterHeight',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/water/water-height-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'water',
    });
    
    this.registerShader('evaporation', {
      name: 'evaporation',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/water/evaporation-frag.glsl',
      uniforms: ['u_SimRes', 'u_timestep'],
      domain: 'water',
    });
    
    this.registerShader('waterVert', {
      name: 'waterVert',
      vertPath: 'shaders/water/water-vert.glsl',
      fragPath: undefined,
      domain: 'water',
    });
    
    this.registerShader('waterFrag', {
      name: 'waterFrag',
      vertPath: undefined,
      fragPath: 'shaders/water/water-frag.glsl',
      domain: 'water',
    });
    
    // Sediment domain
    this.registerShader('sediment', {
      name: 'sediment',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/sediment/sediment-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'sediment',
    });
    
    this.registerShader('sedimentAdvect', {
      name: 'sedimentAdvect',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/sediment/sediment-advect-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'sediment',
    });
    
    this.registerShader('maccormack', {
      name: 'maccormack',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/sediment/maccormack-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'sediment',
    });
    
    this.registerShader('average', {
      name: 'average',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/sediment/average-frag.glsl',
      uniforms: ['u_SimRes'],
      domain: 'sediment',
    });
    
    // Thermal domain
    this.registerShader('maxSlippageHeight', {
      name: 'maxSlippageHeight',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/thermal/max-slippage-height-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea', 'unif_TalusScale', 'unif_rainMode'],
      domain: 'thermal',
    });
    
    this.registerShader('thermalFlux', {
      name: 'thermalFlux',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/thermal/thermal-flux-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea', 'unif_thermalRate'],
      domain: 'thermal',
    });
    
    this.registerShader('thermalApply', {
      name: 'thermalApply',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/thermal/thermal-apply-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea', 'unif_thermalErosionScale'],
      domain: 'thermal',
    });
    
    // Lava domain
    this.registerShader('lavaFlow', {
      name: 'lavaFlow',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/lava/lava-flow-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'lava',
    });
    
    this.registerShader('lavaUpdate', {
      name: 'lavaUpdate',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/lava/lava-update-frag.glsl',
      uniforms: ['u_SimRes', 'u_timestep'],
      domain: 'lava',
    });
    
    this.registerShader('lavaTerrain', {
      name: 'lavaTerrain',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/lava/lava-terrain-frag.glsl',
      uniforms: ['u_SimRes', 'u_timestep'],
      domain: 'lava',
    });
    
    // Terrain domain
    this.registerShader('initial', {
      name: 'initial',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/terrain/initial-frag.glsl',
      uniforms: ['u_SimRes'],
      domain: 'terrain',
    });
    
    this.registerShader('terrainProceduralFrag', {
      name: 'terrainProceduralFrag',
      vertPath: undefined,
      fragPath: 'shaders/terrain/terrain-procedural-frag.glsl',
      domain: 'terrain',
    });
    
    this.registerShader('terrainProceduralVert', {
      name: 'terrainProceduralVert',
      vertPath: 'shaders/terrain/terrain-procedural-vert.glsl',
      fragPath: undefined,
      domain: 'terrain',
    });
    
    this.registerShader('terrainFrag', {
      name: 'terrainFrag',
      vertPath: undefined,
      fragPath: 'shaders/terrain/terrain-frag.glsl',
      domain: 'terrain',
    });
    
    this.registerShader('terrainVert', {
      name: 'terrainVert',
      vertPath: 'shaders/terrain/terrain-vert.glsl',
      fragPath: undefined,
      domain: 'terrain',
    });
    
    this.registerShader('shadowmapFrag', {
      name: 'shadowmapFrag',
      vertPath: undefined,
      fragPath: 'shaders/terrain/shadowmap-frag.glsl',
      domain: 'terrain',
    });
    
    this.registerShader('shadowmapVert', {
      name: 'shadowmapVert',
      vertPath: 'shaders/terrain/shadowmap-vert.glsl',
      fragPath: undefined,
      domain: 'terrain',
    });
    
    // Common domain
    this.registerShader('quadVert', {
      name: 'quadVert',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: undefined,
      domain: 'common',
    });
    
    this.registerShader('clean', {
      name: 'clean',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/common/clean-frag.glsl',
      uniforms: [],
      domain: 'common',
    });
    
    this.registerShader('flatFrag', {
      name: 'flatFrag',
      vertPath: undefined,
      fragPath: 'shaders/common/flat-frag.glsl',
      domain: 'common',
    });
    
    this.registerShader('flatVert', {
      name: 'flatVert',
      vertPath: 'shaders/common/flat-vert.glsl',
      fragPath: undefined,
      domain: 'common',
    });
    
    this.registerShader('velocityAdvect', {
      name: 'velocityAdvect',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/common/velocity-advect-frag.glsl',
      uniforms: ['u_SimRes', 'u_PipeLen', 'u_timestep', 'u_PipeArea'],
      domain: 'common',
    });
    
    this.registerShader('combine', {
      name: 'combine',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/common/combine-frag.glsl',
      uniforms: ['u_SimRes'],
      domain: 'common',
    });
    
    this.registerShader('sceneDepth', {
      name: 'sceneDepth',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/common/scene-depth-frag.glsl',
      uniforms: [],
      domain: 'common',
    });
    
    this.registerShader('bilateralBlur', {
      name: 'bilateralBlur',
      vertPath: 'shaders/common/quad-vert.glsl',
      fragPath: 'shaders/common/bilateral-blur-frag.glsl',
      uniforms: [],
      domain: 'common',
    });
  }

  /**
   * Registers a shader configuration
   */
  public registerShader(id: ShaderId, config: ShaderConfig): void {
    this.shaders.set(id, config);
  }

  /**
   * Gets shader source by ID
   * Returns both vertex and fragment shader sources if available
   */
  public getShaderSource(id: ShaderId): { vert?: string; frag?: string } {
    const config = this.shaders.get(id);
    if (!config) {
      throw new Error(`Shader not found: ${id}`);
    }

    return {
      vert: config.vertPath ? this.loadShaderSource(config.vertPath) : undefined,
      frag: config.fragPath ? this.loadShaderSource(config.fragPath) : undefined,
    };
  }

  /**
   * Gets shader configuration by ID
   */
  public getShaderConfig(id: ShaderId): ShaderConfig | undefined {
    return this.shaders.get(id);
  }

  /**
   * Gets all shaders by domain
   */
  public getShadersByDomain(domain: ShaderConfig['domain']): ShaderConfig[] {
    return Array.from(this.shaders.values()).filter(s => s.domain === domain);
  }

  /**
   * Validates that provided uniforms match expected uniforms for a shader
   * Returns missing uniforms if any
   */
  public validateUniforms(id: ShaderId, providedUniforms: string[]): string[] {
    const config = this.shaders.get(id);
    if (!config || !config.uniforms) {
      return [];
    }

    const missing: string[] = [];
    for (const requiredUniform of config.uniforms) {
      if (!providedUniforms.includes(requiredUniform)) {
        missing.push(requiredUniform);
      }
    }
    return missing;
  }

  /**
   * Loads shader source from path (uses static imports mapped at build time)
   */
  private loadShaderSource(path: string): string {
    const source = SHADER_SOURCE_MAP[path];
    if (!source) {
      throw new Error(`Shader source not found for path: ${path}`);
    }
    return source;
  }
}

/**
 * Singleton instance of shader manifest
 */
export const shaderManifest = new ShaderManifest();
