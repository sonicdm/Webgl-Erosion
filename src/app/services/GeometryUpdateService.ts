/**
 * Service for managing geometry update counter logic
 * Encapsulates mutable counter state to avoid cross-module mutations
 */
export class GeometryUpdateService {
  private geometryUpdateCounter: number = 0;
  private geometryNeedsUpdate: boolean = false;
  private geometryUpdateInterval: number = 2000;
  private enableBVHUpdates: boolean = true;

  /**
   * Increments the geometry update counter
   */
  public incrementGeometryUpdateCounter(): void {
    this.geometryUpdateCounter++;
  }

  /**
   * Resets the geometry update counter to 0
   */
  public resetGeometryUpdateCounter(): void {
    this.geometryUpdateCounter = 0;
  }

  /**
   * Gets the current geometry update counter value
   */
  public getGeometryUpdateCounter(): number {
    return this.geometryUpdateCounter;
  }

  /**
   * Sets whether geometry needs an update
   */
  public setGeometryNeedsUpdate(needsUpdate: boolean): void {
    this.geometryNeedsUpdate = needsUpdate;
  }

  /**
   * Gets whether geometry needs an update
   */
  public getGeometryNeedsUpdate(): boolean {
    return this.geometryNeedsUpdate;
  }

  /**
   * Sets the geometry update interval (number of simulation steps between updates)
   */
  public setGeometryUpdateInterval(interval: number): void {
    this.geometryUpdateInterval = Math.max(1, interval);
  }

  /**
   * Gets the geometry update interval
   */
  public getGeometryUpdateInterval(): number {
    return this.geometryUpdateInterval;
  }

  /**
   * Sets whether BVH updates are enabled
   */
  public setEnableBVHUpdates(enabled: boolean): void {
    this.enableBVHUpdates = enabled;
  }

  /**
   * Gets whether BVH updates are enabled
   */
  public getEnableBVHUpdates(): boolean {
    return this.enableBVHUpdates;
  }

  /**
   * Determines if geometry should be updated
   * @returns true if geometry should be updated
   */
  public shouldUpdateGeometry(): boolean {
    return this.enableBVHUpdates && (this.geometryNeedsUpdate || this.geometryUpdateCounter >= this.geometryUpdateInterval);
  }
}
