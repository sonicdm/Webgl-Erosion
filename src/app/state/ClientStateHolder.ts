/**
 * Holds client state: canvas dimensions, last mouse position
 * Replaces global exports from simulation-state.ts
 */
export class ClientStateHolder {
  private _clientWidth: number = 0;
  private _clientHeight: number = 0;
  private _lastX: number = 0;
  private _lastY: number = 0;

  get clientWidth(): number {
    return this._clientWidth;
  }

  set clientWidth(value: number) {
    this._clientWidth = value;
  }

  get clientHeight(): number {
    return this._clientHeight;
  }

  set clientHeight(value: number) {
    this._clientHeight = value;
  }

  setClientDimensions(width: number, height: number): void {
    this._clientWidth = width;
    this._clientHeight = height;
  }

  get lastX(): number {
    return this._lastX;
  }

  get lastY(): number {
    return this._lastY;
  }

  setLastMousePosition(x: number, y: number): void {
    this._lastX = x;
    this._lastY = y;
  }
}
