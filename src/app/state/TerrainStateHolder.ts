import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * Holds terrain state: geometry, BVH, heightmap CPU buffer, update counters
 * Replaces global exports from simulation-state.ts
 */
export class TerrainStateHolder {
  private _terrainGeometry: BufferGeometry | null = null;
  private _terrainBVH: MeshBVH | null = null;
  private _terrainBVHBuildInProgress: boolean = false;
  private _heightMapCpuBuf: Float32Array;
  private _heightMapBufCounter: number = 0;
  private _heightMapBufIsFresh: boolean = false;
  private _geometryUpdateCounter: number = 0;
  private _geometryNeedsUpdate: boolean = false;
  private _geometryUpdateInterval: number = 2000;
  private _enableBVHUpdates: boolean = true;

  // Constants
  readonly MaxHeightMapBufCounter = 200;
  readonly ActiveHeightmapReadInterval = 2;
  readonly HoverHeightmapReadInterval = 4;

  constructor(initialSimres: number = 1024) {
    this._heightMapCpuBuf = new Float32Array(initialSimres * initialSimres * 4);
  }

  get terrainGeometry(): BufferGeometry | null {
    return this._terrainGeometry;
  }

  set terrainGeometry(value: BufferGeometry | null) {
    this._terrainGeometry = value;
  }

  get terrainBVH(): MeshBVH | null {
    return this._terrainBVH;
  }

  set terrainBVH(value: MeshBVH | null) {
    this._terrainBVH = value;
    // Clear in-progress flag when BVH is set (build complete or cancelled)
    this._terrainBVHBuildInProgress = false;
  }

  get terrainBVHBuildInProgress(): boolean {
    return this._terrainBVHBuildInProgress;
  }

  set terrainBVHBuildInProgress(value: boolean) {
    this._terrainBVHBuildInProgress = value;
  }

  get heightMapCpuBuf(): Float32Array {
    return this._heightMapCpuBuf;
  }

  resizeHeightMapCpuBuf(newRes: number): void {
    const newSize = newRes * newRes * 4;
    if (!this._heightMapCpuBuf || this._heightMapCpuBuf.length !== newSize) {
      this._heightMapCpuBuf = new Float32Array(newSize);
    }
  }

  get heightMapBufCounter(): number {
    return this._heightMapBufCounter;
  }

  incrementHeightMapBufCounter(): void {
    this._heightMapBufCounter++;
  }

  resetHeightMapBufCounter(): void {
    this._heightMapBufCounter = 0;
  }

  get heightMapBufIsFresh(): boolean {
    return this._heightMapBufIsFresh;
  }

  set heightMapBufIsFresh(value: boolean) {
    this._heightMapBufIsFresh = value;
  }

  get geometryUpdateCounter(): number {
    return this._geometryUpdateCounter;
  }

  incrementGeometryUpdateCounter(): void {
    this._geometryUpdateCounter++;
  }

  resetGeometryUpdateCounter(): void {
    this._geometryUpdateCounter = 0;
  }

  get geometryNeedsUpdate(): boolean {
    return this._geometryNeedsUpdate;
  }

  set geometryNeedsUpdate(value: boolean) {
    this._geometryNeedsUpdate = value;
  }

  get geometryUpdateInterval(): number {
    return this._geometryUpdateInterval;
  }

  set geometryUpdateInterval(value: number) {
    this._geometryUpdateInterval = Math.max(1, value);
  }

  get enableBVHUpdates(): boolean {
    return this._enableBVHUpdates;
  }

  set enableBVHUpdates(value: boolean) {
    this._enableBVHUpdates = value;
  }

  shouldUpdateGeometry(): boolean {
    return this._enableBVHUpdates && (this._geometryNeedsUpdate || this._geometryUpdateCounter >= this._geometryUpdateInterval);
  }

  shouldReadHeightmap(brushPressed: boolean, brushVisible: boolean, simres: number): boolean {
    if (brushPressed) {
      const scale = this.getResolutionScale(simres);
      return this._heightMapBufCounter % (this.ActiveHeightmapReadInterval * scale) === 0;
    }
    if (brushVisible) {
      const scale = this.getResolutionScale(simres);
      return this._heightMapBufCounter % (this.HoverHeightmapReadInterval * scale) === 0;
    }
    return this._heightMapBufCounter >= this.MaxHeightMapBufCounter;
  }

  private getResolutionScale(simres: number): number {
    const basePixels = 1024 * 1024;
    const currentPixels = simres * simres;
    return Math.max(1, Math.round(currentPixels / basePixels));
  }
}
