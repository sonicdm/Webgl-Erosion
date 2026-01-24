/**
 * Holds simulation state: resolution, frame count, pause flag, terrain geometry dirty flag
 * Replaces global exports from simulation-state.ts
 */
export class SimulationStateHolder {
  private _simres: number;
  private _simFramecnt: number = 0;
  private _pauseGeneration: boolean = false;
  private _terrainGeometryDirty: boolean = true;
  private _speed: number = 3;

  constructor(initialSimres: number = 1024) {
    this._simres = initialSimres;
  }

  get simres(): number {
    return this._simres;
  }

  set simres(value: number) {
    this._simres = value;
  }

  get simFramecnt(): number {
    return this._simFramecnt;
  }

  set simFramecnt(value: number) {
    this._simFramecnt = value;
  }

  incrementSimFramecnt(): void {
    this._simFramecnt++;
  }

  get pauseGeneration(): boolean {
    return this._pauseGeneration;
  }

  set pauseGeneration(value: boolean) {
    this._pauseGeneration = value;
  }

  get terrainGeometryDirty(): boolean {
    return this._terrainGeometryDirty;
  }

  set terrainGeometryDirty(value: boolean) {
    this._terrainGeometryDirty = value;
  }

  get speed(): number {
    return this._speed;
  }

  set speed(value: number) {
    this._speed = value;
  }
}
