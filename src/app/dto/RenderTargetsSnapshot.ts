import * as THREE from 'three';

/**
 * Snapshot of render target state for debugging/inspection
 * Optional DTO - only needed if we want to expose render targets for inspection
 */
export interface RenderTargetsSnapshot {
  readTerrainTex: THREE.Texture | null;
  writeTerrainTex: THREE.Texture | null;
  readFluxTex: THREE.Texture | null;
  writeFluxTex: THREE.Texture | null;
  readTerrainFluxTex: THREE.Texture | null;
  writeTerrainFluxTex: THREE.Texture | null;
  readMaxSlippageTex: THREE.Texture | null;
  writeMaxSlippageTex: THREE.Texture | null;
  readVelTex: THREE.Texture | null;
  writeVelTex: THREE.Texture | null;
  readSedimentTex: THREE.Texture | null;
  writeSedimentTex: THREE.Texture | null;
  sedimentAdvectA: THREE.Texture | null;
  sedimentAdvectB: THREE.Texture | null;
  readSedimentBlend: THREE.Texture | null;
  writeSedimentBlend: THREE.Texture | null;
  terrainNor: THREE.Texture | null;
  sceneDepthTex: THREE.Texture | null;
  bilateralFilterHorizontalTex: THREE.Texture | null;
  bilateralFilterVerticalTex: THREE.Texture | null;
  colorPassTex: THREE.Texture | null;
  colorPassReflectionTex: THREE.Texture | null;
  scatterPassTex: THREE.Texture | null;
  shadowMapTex: THREE.Texture | null;
}
