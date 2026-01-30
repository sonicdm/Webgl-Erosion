import { MeshBVH, SAH } from 'three-mesh-bvh';
import { createTerrainGeometry } from '../../utils/terrain-geometry-builder';
import type { SimulationStateHolder } from '../state/SimulationStateHolder';
import type { TerrainStateHolder } from '../state/TerrainStateHolder';

/**
 * The only component that writes to TerrainStateHolder.setTerrainGeometry and setTerrainBVH.
 * Invoked when terrain is dirty (after load, reset, or readback).
 * Render loop only reads from holder and triggers this updater.
 */
export class TerrainGeometryUpdater {
    constructor(
        private terrainState: TerrainStateHolder,
        private simulationState: SimulationStateHolder
    ) {}

    /**
     * Build terrain geometry and BVH from heightmap buffer and write to terrain state.
     * Call only when heightMapBufIsFresh and buffer length matches simres²×4.
     */
    update(heightmapBuffer: Float32Array, simres: number, scale: number = 1.0): void {
        const requiredLength = simres * simres * 4;
        if (heightmapBuffer.length < requiredLength) {
            console.warn('[TerrainGeometryUpdater] Buffer length insufficient', {
                length: heightmapBuffer.length,
                required: requiredLength,
            });
            return;
        }

        // Dispose old geometry and clear old BVH
        if (this.terrainState.terrainGeometry) {
            this.terrainState.terrainGeometry.dispose();
            this.terrainState.setTerrainGeometry(null);
        }
        if (this.terrainState.terrainBVH) {
            this.terrainState.setTerrainBVH(null);
        }

        this.terrainState.setTerrainBVHBuildInProgress(true);

        const geometry = createTerrainGeometry(simres, heightmapBuffer, scale);
        this.terrainState.setTerrainGeometry(geometry);

        const bvh = new MeshBVH(geometry, {
            strategy: SAH,
            maxDepth: 30,
            indirect: false,
        });
        this.terrainState.setTerrainBVH(bvh);

        this.simulationState.setHeightMapBufIsFresh(false);
        this.terrainState.setTerrainBVHBuildInProgress(false);
    }
}
