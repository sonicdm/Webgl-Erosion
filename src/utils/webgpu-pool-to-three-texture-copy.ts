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
 */
let _copyLogged = false;
let _skipLogged = false;

export function copyPoolToThreeTextures(
  backend: WebGPUBackendLike,
  pool: WebGPUTexturePool,
  sync: PoolSyncTextures,
  simres: number
): void {
  const device = backend.device;
  const textures: Array<[GPUTexture, DataTexture]> = [
    [pool.readTerrainTexture, sync.heightmap],
    [pool.terrainNorTexture, sync.normalMap],
    [pool.readSedimentTexture, sync.sedimentMap],
    [pool.readVelTexture, sync.velocityMap],
    [pool.readFluxTexture, sync.fluxMap],
    [pool.readTerrainFluxTexture, sync.terrainFluxMap],
    [pool.readMaxSlippageTexture, sync.maxSlippageMap],
    [pool.readSedimentBlendTexture, sync.sedimentBlendMap],
    [pool.readLavaTexture, sync.lavaMap],
    [pool.readLavaVelTexture, sync.lavaVelocityMap],
  ];

  const copySize: GPUExtent3D = [simres, simres, 1];
  let copied = 0;
  let skipped = 0;
  const copies: Array<{ source: GPUTexture; dest: GPUTexture; threeTex: DataTexture }> = [];
  for (const [poolTex, threeTex] of textures) {
    const data = backend.get(threeTex);
    if (!data?.texture) {
      skipped++;
      continue;
    }
    copies.push({ source: poolTex, dest: data.texture, threeTex });
  }
  if (copies.length > 0) {
    try {
      const encoder = device.createCommandEncoder();
      for (const { source, dest, threeTex } of copies) {
        encoder.copyTextureToTexture(
          { texture: source },
          { texture: dest },
          copySize
        );
        threeTex.needsUpdate = false;
        copied++;
      }
      device.queue.submit([encoder.finish()]);
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
