import { BufferGeometry } from 'three';

/**
 * Holds mutable simulation state.
 * This is the single source of truth for simulation-related state.
 */
export class SimulationStateHolder {
    // Simulation resolution
    public simres: number;
    
    // Simulation frame counter
    public simFrameCount: number = 0;
    
    // Pause generation flag
    public pauseGeneration: boolean = false;
    
    // Terrain geometry dirty flag
    public terrainGeometryDirty: boolean = true;
    
    // CPU buffer for raycasting - dynamically sized to match simulation resolution
    public heightMapCpuBuf: Float32Array;
    
    // Heightmap buffer counter for throttled readback
    public heightMapBufCounter: number = 0;
    
    // Flag to track if heightmap buffer is fresh (just read after terrain generation)
    public heightMapBufIsFresh: boolean = false;
    
    // WebGL context
    public glContext: WebGL2RenderingContext | null = null;
    
    // Client dimensions
    public clientWidth: number = 0;
    public clientHeight: number = 0;
    
    // Last mouse position in client coordinates (pixels)
    public lastX: number = 0;
    public lastY: number = 0;
    
    // BVH update tracking for erosion synchronization
    public geometryUpdateCounter: number = 0;
    public geometryNeedsUpdate: boolean = false;
    public geometryUpdateInterval: number = 2000; // Default: update every 2000 simulation steps
    public enableBVHUpdates: boolean = true;
    
    constructor(initialSimres: number = 1024) {
        this.simres = initialSimres;
        const initialSize = initialSimres * initialSimres * 4;
        this.heightMapCpuBuf = new Float32Array(initialSize);
    }
    
    setSimRes(newRes: number): void {
        this.simres = newRes;
        this.resizeHeightMapCpuBuf(newRes);
    }
    
    setGlContext(context: WebGL2RenderingContext): void {
        this.glContext = context;
    }
    
    setClientDimensions(width: number, height: number): void {
        this.clientWidth = width;
        this.clientHeight = height;
    }
    
    setLastMousePosition(x: number, y: number): void {
        this.lastX = x;
        this.lastY = y;
    }
    
    setPauseGeneration(value: boolean): void {
        this.pauseGeneration = value;
    }
    
    setSimFrameCount(value: number): void {
        this.simFrameCount = value;
    }
    
    incrementSimFrameCount(): void {
        this.simFrameCount++;
    }
    
    setTerrainGeometryDirty(value: boolean): void {
        this.terrainGeometryDirty = value;
    }
    
    resizeHeightMapCpuBuf(newRes: number): void {
        // Resize CPU buffer to match simulation resolution for accurate raycasting
        // Only reallocate if size changed to avoid unnecessary allocations
        const newSize = newRes * newRes * 4;
        if (!this.heightMapCpuBuf || this.heightMapCpuBuf.length !== newSize) {
            this.heightMapCpuBuf = new Float32Array(newSize);
        }
    }
    
    setHeightMapBufIsFresh(isFresh: boolean): void {
        this.heightMapBufIsFresh = isFresh;
    }
    
    incrementHeightMapBufCounter(): void {
        this.heightMapBufCounter++;
    }
    
    resetHeightMapBufCounter(): void {
        this.heightMapBufCounter = 0;
    }
    
    incrementGeometryUpdateCounter(): void {
        this.geometryUpdateCounter++;
    }
    
    resetGeometryUpdateCounter(): void {
        this.geometryUpdateCounter = 0;
    }
    
    setGeometryNeedsUpdate(needsUpdate: boolean): void {
        this.geometryNeedsUpdate = needsUpdate;
    }
    
    setGeometryUpdateInterval(interval: number): void {
        this.geometryUpdateInterval = Math.max(1, interval);
    }
    
    setEnableBVHUpdates(enabled: boolean): void {
        this.enableBVHUpdates = enabled;
    }
    
    shouldUpdateGeometry(): boolean {
        return this.enableBVHUpdates && (this.geometryNeedsUpdate || this.geometryUpdateCounter >= this.geometryUpdateInterval);
    }
}
