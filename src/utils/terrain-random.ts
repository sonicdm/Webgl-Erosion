import { vec2 } from 'gl-matrix';
import { setTerrainGeometryDirty } from '../simulation/simulation-state';

/**
 * Terrain random parameters
 */
export interface TerrainRandomParams {
  seedOffset: vec2;
  duneDir: vec2;
  craterDensity: number;
  canyonDepth: number;
}

/**
 * Set random terrain parameters
 * Generates random values for terrain generation
 * 
 * @param terrainRandom - Terrain random parameters object to update
 */
export function setTerrainRandom(terrainRandom: TerrainRandomParams): void {
  const angle = Math.random() * Math.PI * 2.0;
  terrainRandom.duneDir[0] = Math.cos(angle);
  terrainRandom.duneDir[1] = Math.sin(angle);

  terrainRandom.craterDensity = 0.8 + Math.random() * 0.7;
  terrainRandom.canyonDepth = 0.45 + Math.random() * 0.5;
  terrainRandom.seedOffset[0] = Math.random() * 256.0;
  terrainRandom.seedOffset[1] = Math.random() * 256.0;

  setTerrainGeometryDirty(true);
}
