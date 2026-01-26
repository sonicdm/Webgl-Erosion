/**
 * Service for managing heightmap read counter logic
 * Encapsulates mutable counter state to avoid cross-module mutations
 */
export class CounterService {
  private heightMapBufCounter: number = 0;
  private readonly maxHeightMapBufCounter: number = 200;
  private readonly activeHeightmapReadInterval: number = 2;
  private readonly hoverHeightmapReadInterval: number = 4;

  /**
   * Increments the heightmap buffer counter
   */
  public incrementHeightMapBufCounter(): void {
    this.heightMapBufCounter++;
  }

  /**
   * Resets the heightmap buffer counter to 0
   */
  public resetHeightMapBufCounter(): void {
    this.heightMapBufCounter = 0;
  }

  /**
   * Gets the current heightmap buffer counter value
   */
  public getHeightMapBufCounter(): number {
    return this.heightMapBufCounter;
  }

  /**
   * Gets the maximum heightmap buffer counter threshold
   */
  public getMaxHeightMapBufCounter(): number {
    return this.maxHeightMapBufCounter;
  }

  /**
   * Determines if heightmap should be read based on brush state
   * @param brushPressed - Whether brush is currently pressed
   * @param brushVisible - Whether brush is visible (hovering)
   * @param simres - Simulation resolution (for scaling read intervals)
   * @returns true if heightmap should be read
   */
  public shouldReadHeightmap(brushPressed: boolean, brushVisible: boolean, simres: number): boolean {
    if (brushPressed) {
      const scale = this.getResolutionScale(simres);
      return this.heightMapBufCounter % (this.activeHeightmapReadInterval * scale) === 0;
    }
    if (brushVisible) {
      const scale = this.getResolutionScale(simres);
      return this.heightMapBufCounter % (this.hoverHeightmapReadInterval * scale) === 0;
    }
    return this.heightMapBufCounter >= this.maxHeightMapBufCounter;
  }

  /**
   * Calculates resolution scale factor for read intervals
   * Higher resolutions require more frequent reads to maintain responsiveness
   */
  private getResolutionScale(simres: number): number {
    const basePixels = 1024 * 1024;
    const currentPixels = simres * simres;
    return Math.max(1, Math.round(currentPixels / basePixels));
  }
}
