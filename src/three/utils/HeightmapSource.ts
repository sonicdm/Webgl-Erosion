/**
 * HeightmapSource - Centralized heightmap data and uniform management
 * 
 * CONTRACT: RAW encoding
 * - Height values are stored as worldHeight * simres
 * - Shaders decode: worldHeight = storedHeight / simres
 */
export class HeightmapSource {
  public readonly minHeight: number;
  public readonly maxHeight: number;
  public readonly simres: number;
  public readonly textureData: Float32Array;
  public readonly width: number;
  public readonly height: number;

  constructor(
    minHeight: number,
    maxHeight: number,
    simres: number,
    textureData: Float32Array,
    width: number,
    height: number
  ) {
    this.minHeight = minHeight;
    this.maxHeight = maxHeight;
    this.simres = simres;
    this.textureData = textureData;
    this.width = width;
    this.height = height;
  }

  /**
   * Returns a uniform block for the terrain material
   * Contains uniforms needed for height decoding and denormalization in VTF path
   */
  public getUniformBlock(): {
    u_SimRes: { value: number };
    u_StoredHeightMin: { value: number };
    u_StoredHeightMax: { value: number };
  } {
    return {
      u_SimRes: { value: this.simres },
      u_StoredHeightMin: { value: this.minHeight * this.simres },
      u_StoredHeightMax: { value: this.maxHeight * this.simres }
    };
  }

  /**
   * Logs the heightmap contract for debugging
   */
  public logContract(debug = false): void {
    if (!debug) return;
    console.log('[HeightmapSource] Contract:', {
      encoding: 'RAW (worldHeight * simres)',
      worldHeightRange: { min: this.minHeight, max: this.maxHeight },
      storedHeightRange: { min: this.minHeight * this.simres, max: this.maxHeight * this.simres },
      simres: this.simres,
      textureSize: { width: this.width, height: this.height },
      dataLength: this.textureData.length,
      exampleDecode: {
        stored: 0,
        world: 0 / Math.max(1, this.simres)
      }
    });
  }
}
