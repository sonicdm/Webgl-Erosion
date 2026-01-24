import { SimulationPassManager } from '../simulation/SimulationPassManager';

/**
 * Heightmap bridge service
 * Handles heightmap readback, buffer management, and initialization
 */
export class HeightmapBridge {
  private heightMapCpuBuffer: Float32Array;
  private heightMapInitialized: boolean = false;
  private passManager: SimulationPassManager | null = null;

  constructor(private simres: number) {
    this.heightMapCpuBuffer = new Float32Array(simres * simres * 4);
  }

  /**
   * Sets the pass manager reference
   */
  public setPassManager(passManager: SimulationPassManager | null): void {
    this.passManager = passManager;
  }

  /**
   * Initializes textures with heightmap source
   * This is called during simulation initialization
   */
  public async initializeTextures(
    controls: any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): Promise<void> {
    if (!this.passManager) {
      throw new Error('Pass manager not set. Call setPassManager() first.');
    }
    
    await this.passManager.initializeTextures(controls, timer, heightmapSource, terrainRandom);
    
    // Initialize CPU buffer from initial heightmap if available
    const initialHeightmap = this.passManager.getInitialHeightmap();
    if (initialHeightmap && initialHeightmap.length > 0) {
      const size = this.simres * this.simres;
      const buffer = new Float32Array(size * 4);
      // Only copy if sizes match
      if (initialHeightmap.length === size * 4) {
        buffer.set(initialHeightmap);
        this.heightMapCpuBuffer.set(buffer);
        this.heightMapInitialized = true;
      }
    }
  }

  /**
   * Reads combined height from simulation pass manager
   * Returns the CPU buffer (may be stale if GPU readback is disabled)
   */
  public readCombinedHeight(): Float32Array {
    if (!this.passManager) {
      // Return CPU buffer if pass manager not available
      return this.heightMapCpuBuffer;
    }

    // CRITICAL PERFORMANCE: This function is extremely expensive (2+ seconds per call)
    // GPU readback with FLOAT type is not working - returns normalized values
    // For now, just return the initial heightmap immediately without attempting readback
    // This avoids the 2+ second stall that's killing framerate
    const initialHeightmap = this.passManager.getInitialHeightmap();
    if (initialHeightmap) {
      const size = this.simres * this.simres;
      const buffer = new Float32Array(size * 4);
      buffer.set(initialHeightmap);
      this.heightMapCpuBuffer.set(buffer);
      this.heightMapInitialized = true;
      return buffer;
    }
    
    // If no initial heightmap, return zeros (shouldn't happen)
    const size = this.simres * this.simres;
    const buffer = new Float32Array(size * 4);
    this.heightMapCpuBuffer.set(buffer);
    return buffer;
  }

  /**
   * Gets the CPU heightmap buffer
   * This buffer may be stale if GPU readback is disabled for performance
   */
  public getHeightMapCpuBuffer(): Float32Array {
    return this.heightMapCpuBuffer;
  }

  /**
   * Checks if heightmap has been initialized
   */
  public isHeightMapInitialized(): boolean {
    return this.heightMapInitialized;
  }

  /**
   * Sets the heightmap initialized flag
   */
  public setHeightMapInitialized(initialized: boolean): void {
    this.heightMapInitialized = initialized;
  }
}
