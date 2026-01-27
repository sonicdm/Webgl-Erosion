import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * Holds terrain geometry and BVH state.
 * This is the single source of truth for terrain-related state.
 */
export class TerrainStateHolder {
    // Terrain geometry (secondary mesh for raycasting)
    public terrainGeometry: BufferGeometry | null = null;
    
    // Terrain BVH for efficient raycasting
    public terrainBVH: MeshBVH | null = null;
    
    // Flag to track if BVH build is currently in progress (prevents duplicate builds)
    public terrainBVHBuildInProgress: boolean = false;
    
    setTerrainGeometry(geometry: BufferGeometry | null): void {
        this.terrainGeometry = geometry;
    }
    
    setTerrainBVH(bvh: MeshBVH | null): void {
        this.terrainBVH = bvh;
        // Clear in-progress flag when BVH is set (build complete or cancelled)
        this.terrainBVHBuildInProgress = false;
    }
    
    setTerrainBVHBuildInProgress(inProgress: boolean): void {
        this.terrainBVHBuildInProgress = inProgress;
    }
}
