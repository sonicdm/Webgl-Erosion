import {vec2} from 'gl-matrix';

// Simulation state variables
export const simresolution = 1024;
export const shadowMapResolution = 4096;
export const enableBilateralBlur = false;

export let speed = 3;
export let SimFramecnt = 0;
export let TerrainGeometryDirty = true;
export let PauseGeneration = false;
// CPU buffer for raycasting - dynamically sized to match simulation resolution
export let HightMapCpuBuf = new Float32Array(1024 * 1024 * 4); // Initial size, will be resized
export let HightMapBufCounter = 0;

export function incrementHightMapBufCounter(): void {
    HightMapBufCounter++;
}
// Read heightmap to CPU every 200 frames for raycasting
export const MaxHightMapBufCounter = 200;
export let simres: number = simresolution;

export function resizeHightMapCpuBuf(newRes: number): void {
    // Resize CPU buffer to match simulation resolution for accurate raycasting
    HightMapCpuBuf = new Float32Array(newRes * newRes * 4);
}

// Global state
export let clientWidth: number;
export let clientHeight: number;
export let lastX = 0;
export let lastY = 0;
export let gl_context: WebGL2RenderingContext;

// Update functions
export function setSimRes(newRes: number): void {
    simres = newRes;
}

export function setGlContext(context: WebGL2RenderingContext): void {
    gl_context = context;
}

export function setClientDimensions(width: number, height: number): void {
    clientWidth = width;
    clientHeight = height;
}

export function setLastMousePosition(x: number, y: number): void {
    lastX = x;
    lastY = y;
}

export function setPauseGeneration(value: boolean): void {
    PauseGeneration = value;
}

export function setSimFramecnt(value: number): void {
    SimFramecnt = value;
}

export function incrementSimFramecnt(): void {
    SimFramecnt++;
}

export function setTerrainGeometryDirty(value: boolean): void {
    TerrainGeometryDirty = value;
}

