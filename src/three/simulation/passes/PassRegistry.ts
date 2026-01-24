/**
 * Pass registry for simulation passes
 * Maps pass names to shader paths and uniform configurations
 * Provides metadata for validation and debugging
 */
export interface PassConfig {
  name: string;
  shaderPath: string;
  uniforms: string[]; // List of required uniform names
  domain: 'water' | 'sediment' | 'thermal' | 'lava' | 'post' | 'terrain';
}

export class PassRegistry {
  private passes: Map<string, PassConfig> = new Map();

  /**
   * Registers a pass with its configuration
   */
  public registerPass(config: PassConfig): void {
    this.passes.set(config.name, config);
  }

  /**
   * Gets a pass configuration by name
   */
  public getPass(name: string): PassConfig | undefined {
    return this.passes.get(name);
  }

  /**
   * Gets all registered passes
   */
  public getAllPasses(): PassConfig[] {
    return Array.from(this.passes.values());
  }

  /**
   * Gets passes by domain
   */
  public getPassesByDomain(domain: PassConfig['domain']): PassConfig[] {
    return this.getAllPasses().filter(p => p.domain === domain);
  }

  /**
   * Validates that a pass has all required uniforms
   * Returns missing uniforms if any
   */
  public validatePass(name: string, providedUniforms: string[]): string[] {
    const config = this.getPass(name);
    if (!config) {
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
   * Clears all registered passes
   */
  public clear(): void {
    this.passes.clear();
  }
}
