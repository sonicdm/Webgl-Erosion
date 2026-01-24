import {vec2} from 'gl-matrix';
import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * @deprecated This module uses global state and will be replaced by state holders.
 * Use SimulationStateHolder, TerrainStateHolder, and ClientStateHolder from src/app/state/
 * instead. These globals are kept for backward compatibility during migration.
 */

// Simulation state variables
export const simresolution = 1024;
export const shadowMapResolution = 4096;
export const enableBilateralBlur = false;

export let speed = 3;
export let simFrameCount = 0;
export let TerrainGeometryDirty = true;
export let PauseGeneration = false;
// CPU buffer for raycasting - dynamically sized to match simulation resolution
export let heightMapCpuBuf = new Float32Array(1024 * 1024 * 4); // Initial size, will be resized
export let heightMapBufCounter = 0;
// Flag to track if heightmap buffer is fresh (just read after terrain generation)
export let heightMapBufIsFresh = false;

export function setHeightMapBufIsFresh(isFresh: boolean): void {
    heightMapBufIsFresh = isFresh;
}

export function incrementHeightMapBufCounter(): void {
    heightMapBufCounter++;
}

export function resetHeightMapBufCounter(): void {
    heightMapBufCounter = 0;
}

// Read heightmap to CPU every 200 frames for raycasting (when brush is idle)
export const maxHeightMapBufCounter = 200;

// Read heightmap more frequently when brush is active/visible
// Higher values reduce CPU readback cost but can make brush hover slightly stale
export const ActiveHeightmapReadInterval = 2; // every 2 frames when brush is pressed (base, scaled by resolution)
export const HoverHeightmapReadInterval = 4;  // every 4 frames when brush is visible but not pressed (base, scaled by resolution)

// Determine if heightmap should be read based on brush state
// Returns true if brush is active (read every frame) or if counter threshold reached (throttled mode)
function getResolutionScale(simres: number): number {
    const basePixels = 1024 * 1024;
    const currentPixels = simres * simres;
    return Math.max(1, Math.round(currentPixels / basePixels));
}

export function shouldReadHeightmap(brushPressed: boolean, brushVisible: boolean, simres: number): boolean {
    if (brushPressed) {
        const scale = getResolutionScale(simres);
        return heightMapBufCounter % (ActiveHeightmapReadInterval * scale) === 0;
    }
    if (brushVisible) {
        const scale = getResolutionScale(simres);
        return heightMapBufCounter % (HoverHeightmapReadInterval * scale) === 0;
    }
    return heightMapBufCounter >= maxHeightMapBufCounter;
}
export let simres: number = simresolution;

export function resizeHeightMapCpuBuf(newRes: number): void {
    // Resize CPU buffer to match simulation resolution for accurate raycasting
    // Only reallocate if size changed to avoid unnecessary allocations
    const newSize = newRes * newRes * 4;
    if (!heightMapCpuBuf || heightMapCpuBuf.length !== newSize) {
        heightMapCpuBuf = new Float32Array(newSize);
    }
}

// Global state
export let clientWidth: number;
export let clientHeight: number;
// Last pointer position in client coordinates (pixels)
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

export function setSimFrameCount(value: number): void {
    simFrameCount = value;
}

export function incrementSimFrameCount(): void {
    simFrameCount++;
}

export function setTerrainGeometryDirty(value: boolean): void {
    TerrainGeometryDirty = value;
}

// BVH and terrain geometry state (secondary mesh for raycasting)
export let terrainGeometry: BufferGeometry | null = null;
export let terrainBVH: MeshBVH | null = null;
// Flag to track if BVH build is currently in progress (prevents duplicate builds)
export let terrainBVHBuildInProgress = false;

// BVH update tracking for erosion synchronization
// Counter for simulation steps since last geometry update
export let geometryUpdateCounter = 0;
// Flag to track if geometry needs update (set when erosion occurs)
export let geometryNeedsUpdate = false;
// Configuration for update frequency (update every N simulation steps)
// Higher values = less frequent updates = better performance but less accuracy
// Default: 2000 steps - balances accuracy with performance
// Note: Updates only happen when heightmap is already read (no extra readPixels cost)
export let geometryUpdateInterval = 2000; // Default: update every 2000 simulation steps
// Flag to enable/disable automatic BVH updates (enabled by default)
export let enableBVHUpdates = true; // BVH updates are enabled but only when heightmap is already fresh

export function setTerrainGeometry(geometry: BufferGeometry | null): void {
    terrainGeometry = geometry;
}

export function setTerrainBVH(bvh: MeshBVH | null): void {
    terrainBVH = bvh;
    // Clear in-progress flag when BVH is set (build complete or cancelled)
    terrainBVHBuildInProgress = false;
}

export function setTerrainBVHBuildInProgress(inProgress: boolean): void {
    terrainBVHBuildInProgress = inProgress;
}

// Geometry update tracking functions
export function incrementGeometryUpdateCounter(): void {
    geometryUpdateCounter++;
}

export function resetGeometryUpdateCounter(): void {
    geometryUpdateCounter = 0;
}

export function setGeometryNeedsUpdate(needsUpdate: boolean): void {
    geometryNeedsUpdate = needsUpdate;
}

export function setGeometryUpdateInterval(interval: number): void {
    geometryUpdateInterval = Math.max(1, interval);
}

export function setEnableBVHUpdates(enabled: boolean): void {
    enableBVHUpdates = enabled;
}

export function shouldUpdateGeometry(): boolean {
    return enableBVHUpdates && (geometryNeedsUpdate || geometryUpdateCounter >= geometryUpdateInterval);
}

// Deprecated aliases for backward compatibility (will be removed in future)
// These maintain compatibility with legacy code while new code uses corrected names
/** @deprecated Use heightMapCpuBuf instead */
export { heightMapCpuBuf as HightMapCpuBuf };
/** @deprecated Use heightMapBufCounter instead */
export { heightMapBufCounter as HightMapBufCounter };
/** @deprecated Use heightMapBufIsFresh instead */
export { heightMapBufIsFresh as HightMapBufIsFresh };
/** @deprecated Use maxHeightMapBufCounter instead */
export { maxHeightMapBufCounter as MaxHightMapBufCounter };
/** @deprecated Use simFrameCount instead */
export { simFrameCount as SimFramecnt };
/** @deprecated Use setHeightMapBufIsFresh instead */
export { setHeightMapBufIsFresh as setHightMapBufIsFresh };
/** @deprecated Use incrementHeightMapBufCounter instead */
export { incrementHeightMapBufCounter as incrementHightMapBufCounter };
/** @deprecated Use resetHeightMapBufCounter instead */
export { resetHeightMapBufCounter as resetHightMapBufCounter };
/** @deprecated Use resizeHeightMapCpuBuf instead */
export { resizeHeightMapCpuBuf as resizeHightMapCpuBuf };
/** @deprecated Use setSimFrameCount instead */
export { setSimFrameCount as setSimFramecnt };
/** @deprecated Use incrementSimFrameCount instead */
export { incrementSimFrameCount as incrementSimFramecnt };
