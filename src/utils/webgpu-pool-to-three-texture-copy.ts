/**
 * Copy WebGPUTexturePool GPUTextures into Three.js Texture objects used by the WebGPU backend.
 * Each frame, after simulation, copy pool textures to the backend GPUTexture of each Three.js texture
 * so NodeMaterials sample up-to-date simulation data.
 */

import { DataTexture, RGBAFormat, FloatType, LinearFilter, ClampToEdgeWrapping } from 'three';
import type { WebGPUTexturePool } from '../simulation/WebGPUTexturePool';

/** Three.js textures that receive pool data (format/size must match pool: rgba32float, simres x simres). */
export interface PoolSyncTextures {
  heightmap: DataTexture;
  normalMap: DataTexture;
  sedimentMap: DataTexture;
  velocityMap: DataTexture;
  fluxMap: DataTexture;
  terrainFluxMap: DataTexture;
  maxSlippageMap: DataTexture;
  sedimentBlendMap: DataTexture;
  lavaMap: DataTexture;
  lavaVelocityMap: DataTexture;
  coolLavaMap: DataTexture;
  basaltMap: DataTexture;
}

export type PoolSyncTextureName = keyof PoolSyncTextures;

export interface PoolCopyViewOptions {
  debugMode: number;
  showFlowTrace: boolean;
}

/**
 * Build the minimal texture sync set for the current view state.
 * Normal rendering does not need every debug texture each frame.
 */
export function getPoolCopyTextureNamesForView(options: PoolCopyViewOptions): PoolSyncTextureName[] {
  const { debugMode, showFlowTrace } = options;
  const names: PoolSyncTextureName[] = [
    'heightmap',
    'sedimentMap',
    'lavaMap',
    'lavaVelocityMap',
    'coolLavaMap',
    'basaltMap',
  ];

  // Flow trace overlay samples sediment blend.
  if (showFlowTrace || debugMode === 7) {
    names.push('sedimentBlendMap');
  }

  // Debug-only maps.
  if (debugMode === 2 || debugMode === 9) names.push('velocityMap');
  if (debugMode === 4) names.push('fluxMap');
  if (debugMode === 5) names.push('terrainFluxMap');
  if (debugMode === 6) names.push('maxSlippageMap');

  return names;
}

/**
 * Resize existing pool sync DataTextures in place (new zero buffer + dimensions).
 * Avoids recreating material graph references, so shaders do NOT recompile.
 * The WebGPU backend will recreate its internal GPUTextures on next render
 * when it sees the bumped version (needsUpdate = true).
 */
export function resizePoolSyncTextures(sync: PoolSyncTextures, newRes: number): void {
  const sharedZeroData = new Float32Array(newRes * newRes * 4);
  for (const tex of Object.values(sync) as DataTexture[]) {
    // Dispose forces the WebGPU backend to drop its cached GPUTexture (still at old size).
    // Without this, the backend tries to upload newRes data into the old-size GPUTexture → validation error.
    tex.dispose();
    tex.image = { data: sharedZeroData, width: newRes, height: newRes };
    tex.needsUpdate = true;
  }
  // Reset copy log flags so we see confirmation when copies resume at new size.
  _copyLogged = false;
  _skipLogged = false;
}

/**
 * Create DataTextures with rgba32float-compatible format (RGBAFormat + FloatType)
 * so the WebGPU backend creates GPUTextures we can copy into from the pool.
 * Uses a shared zero buffer to avoid per-texture CPU allocations at high simres.
 */
export function createPoolSyncTextures(simres: number): PoolSyncTextures {
  const sharedZeroData = new Float32Array(simres * simres * 4);
  const createFloatTexture = (): DataTexture => {
    // Reuse a single zero buffer across textures to avoid huge per-texture allocations.
    const tex = new DataTexture(sharedZeroData, simres, simres);
    tex.format = RGBAFormat;
    tex.type = FloatType;
    tex.minFilter = tex.magFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    heightmap: createFloatTexture(),
    normalMap: createFloatTexture(),
    sedimentMap: createFloatTexture(),
    velocityMap: createFloatTexture(),
    fluxMap: createFloatTexture(),
    terrainFluxMap: createFloatTexture(),
    maxSlippageMap: createFloatTexture(),
    sedimentBlendMap: createFloatTexture(),
    lavaMap: createFloatTexture(),
    lavaVelocityMap: createFloatTexture(),
    coolLavaMap: createFloatTexture(),
    basaltMap: createFloatTexture(),
  };
}

/** Backend-like interface: has device and get(texture).texture. */
export interface WebGPUBackendLike {
  device: GPUDevice;
  get(texture: unknown): { texture?: GPUTexture; initialized?: boolean };
}

/**
 * Copy pool GPUTextures into the backend GPUTextures of the given Three.js textures.
 * Call each frame before rendering. Backend may not have created textures until after first render;
 * we skip copy when backend texture is not yet initialized.
 * After first successful copy we set needsUpdate = false so the backend does not re-upload CPU
 * data and overwrite our GPU copy.
 *
 * If existingEncoder is provided, copy commands are added to it and no submit is performed
 * (caller must submit the encoder). Use this to merge the copy into another pass (e.g. last sim step).
 */
let _copyLogged = false;
let _skipLogged = false;

export function copyPoolToThreeTextures(
  backend: WebGPUBackendLike,
  pool: WebGPUTexturePool,
  sync: PoolSyncTextures,
  simres: number,
  existingEncoder?: GPUCommandEncoder,
  textureNames?: readonly PoolSyncTextureName[]
): void {
  const device = backend.device;
  const textures: Array<{ name: PoolSyncTextureName; source: GPUTexture; target: DataTexture }> = [
    { name: 'heightmap', source: pool.readTerrainTexture, target: sync.heightmap },
    { name: 'normalMap', source: pool.terrainNorTexture, target: sync.normalMap },
    { name: 'sedimentMap', source: pool.readSedimentTexture, target: sync.sedimentMap },
    { name: 'velocityMap', source: pool.readVelTexture, target: sync.velocityMap },
    { name: 'fluxMap', source: pool.readFluxTexture, target: sync.fluxMap },
    { name: 'terrainFluxMap', source: pool.readTerrainFluxTexture, target: sync.terrainFluxMap },
    { name: 'maxSlippageMap', source: pool.readMaxSlippageTexture, target: sync.maxSlippageMap },
    { name: 'sedimentBlendMap', source: pool.readSedimentBlendTexture, target: sync.sedimentBlendMap },
    { name: 'lavaMap', source: pool.readLavaTexture, target: sync.lavaMap },
    { name: 'lavaVelocityMap', source: pool.readLavaVelTexture, target: sync.lavaVelocityMap },
    { name: 'coolLavaMap', source: pool.readCoolLavaTexture, target: sync.coolLavaMap },
    { name: 'basaltMap', source: pool.readBasaltTexture, target: sync.basaltMap },
  ];
  const enabledNames = textureNames ? new Set(textureNames) : null;

  const copySize: GPUExtent3D = [simres, simres, 1];
  let copied = 0;
  let skipped = 0;
  const copies: Array<{ source: GPUTexture; dest: GPUTexture; threeTex: DataTexture }> = [];
  for (const texture of textures) {
    if (enabledNames && !enabledNames.has(texture.name)) {
      continue;
    }

    const poolTex = texture.source;
    const threeTex = texture.target;
    const data = backend.get(threeTex);
    if (!data?.texture) {
      skipped++;
      continue;
    }
    // Skip if the backend GPUTexture hasn't been resized yet (avoids size-mismatch validation error)
    if (data.texture.width !== simres || data.texture.height !== simres) {
      skipped++;
      continue;
    }
    copies.push({ source: poolTex, dest: data.texture, threeTex });
  }
  if (copies.length > 0) {
    try {
      const encoder = existingEncoder ?? device.createCommandEncoder();
      for (const { source, dest, threeTex } of copies) {
        encoder.copyTextureToTexture(
          { texture: source },
          { texture: dest },
          copySize
        );
        threeTex.needsUpdate = false;
        copied++;
      }
      if (!existingEncoder) {
        device.queue.submit([encoder.finish()]);
      }
    } catch (e) {
      if (!_copyLogged) {
        console.warn('[WebGPU] copyTextureToTexture failed:', e);
        _copyLogged = true;
      }
    }
  }
  if (copied > 0 && !_copyLogged) {
    console.log('[WebGPU] Pool → Three.js texture copy active,', copied, 'textures');
    _copyLogged = true;
  }
  if (skipped > 0 && !_skipLogged) {
    console.log('[WebGPU] Pool copy: backend texture not ready for', skipped, 'textures (normal on first frames until compile)');
    _skipLogged = true;
  }
}
