import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CounterService } from '../services/CounterService';
import { GeometryUpdateService } from '../services/GeometryUpdateService';

/**
 * Holds terrain state: geometry, BVH, heightmap CPU buffer, update counters
 * Replaces global exports from simulation-state.ts
 */
export class TerrainStateHolder {
  private _terrainGeometry: BufferGeometry | null = null;
  private _terrainBVH: MeshBVH | null = null;
  private _terrainBVHBuildInProgress: boolean = false;
  private _heightMapCpuBuf: Float32Array;
  private _heightMapBufIsFresh: boolean = false;
  private readonly counterService: CounterService;
  private readonly geometryUpdateService: GeometryUpdateService;

  // Constants (delegated to services)
  readonly MaxHeightMapBufCounter = 200;
  readonly ActiveHeightmapReadInterval = 2;
  readonly HoverHeightmapReadInterval = 4;

  constructor(initialSimres: number = 1024) {
    this._heightMapCpuBuf = new Float32Array(initialSimres * initialSimres * 4);
    this.counterService = new CounterService();
    this.geometryUpdateService = new GeometryUpdateService();
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
    return this.counterService.getHeightMapBufCounter();
  }

  incrementHeightMapBufCounter(): void {
    this.counterService.incrementHeightMapBufCounter();
  }

  resetHeightMapBufCounter(): void {
    this.counterService.resetHeightMapBufCounter();
  }

  get heightMapBufIsFresh(): boolean {
    return this._heightMapBufIsFresh;
  }

  set heightMapBufIsFresh(value: boolean) {
    this._heightMapBufIsFresh = value;
  }

  get geometryUpdateCounter(): number {
    return this.geometryUpdateService.getGeometryUpdateCounter();
  }

  incrementGeometryUpdateCounter(): void {
    this.geometryUpdateService.incrementGeometryUpdateCounter();
  }

  resetGeometryUpdateCounter(): void {
    this.geometryUpdateService.resetGeometryUpdateCounter();
  }

  get geometryNeedsUpdate(): boolean {
    return this.geometryUpdateService.getGeometryNeedsUpdate();
  }

  set geometryNeedsUpdate(value: boolean) {
    this.geometryUpdateService.setGeometryNeedsUpdate(value);
  }

  get geometryUpdateInterval(): number {
    return this.geometryUpdateService.getGeometryUpdateInterval();
  }

  set geometryUpdateInterval(value: number) {
    this.geometryUpdateService.setGeometryUpdateInterval(value);
  }

  get enableBVHUpdates(): boolean {
    return this.geometryUpdateService.getEnableBVHUpdates();
  }

  set enableBVHUpdates(value: boolean) {
    this.geometryUpdateService.setEnableBVHUpdates(value);
  }

  shouldUpdateGeometry(): boolean {
    return this.geometryUpdateService.shouldUpdateGeometry();
  }

  shouldReadHeightmap(brushPressed: boolean, brushVisible: boolean, simres: number): boolean {
    return this.counterService.shouldReadHeightmap(brushPressed, brushVisible, simres);
  }
}
