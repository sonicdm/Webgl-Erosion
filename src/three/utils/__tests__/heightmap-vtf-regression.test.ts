/**
 * Headless regression: upload heightmap → GPU → readback → decode → assert min/max.
 * Catches normalization (values clamped to [0,1]) or wrong internal format.
 *
 * Skips when WebGL2 is not available (e.g. Node CI without gl/headless-gl).
 * Run with a real WebGL2 context (browser, or `gl` + proper setup) to execute.
 */

import * as THREE from 'three';
import { uploadHeightmap } from '../terrain-heightmap-converter';
import { decodeRaw } from '../heightEncoding';
import {
  createHeightmapSource4x4,
  HEIGHTMAP_4X4_EXPECTED_MIN,
  HEIGHTMAP_4X4_EXPECTED_MAX,
  HEIGHTMAP_4X4_SIMRES,
} from '../__fixtures__/heightmap-4x4';

function getWebGL2(): { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const gl = canvas.getContext('webgl2');
  return gl ? { canvas, gl } : null;
}

describe('heightmap upload-readback regression', () => {
  const w = getWebGL2();

  (w ? it : it.skip)(
    'upload → readback → decoded min/max matches HeightmapSource (4x4)',
    () => {
      const { canvas } = w!;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      const target = new THREE.WebGLRenderTarget(HEIGHTMAP_4X4_SIMRES, HEIGHTMAP_4X4_SIMRES, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        generateMipmaps: false,
        depthBuffer: false,
      });

      // Force target texture to be created (get __webglTexture in renderer.properties)
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.setRenderTarget(null);

      const src = createHeightmapSource4x4();
      uploadHeightmap(renderer, src, target);

      const buffer = new Float32Array(HEIGHTMAP_4X4_SIMRES * HEIGHTMAP_4X4_SIMRES * 4);
      renderer.readRenderTargetPixels(
        target,
        0,
        0,
        HEIGHTMAP_4X4_SIMRES,
        HEIGHTMAP_4X4_SIMRES,
        buffer
      );

      let decodedMin = Infinity;
      let decodedMax = -Infinity;
      const n = HEIGHTMAP_4X4_SIMRES * HEIGHTMAP_4X4_SIMRES;
      for (let i = 0; i < n; i++) {
        const stored = buffer[i * 4];
        const world = decodeRaw(stored, HEIGHTMAP_4X4_SIMRES);
        if (world < decodedMin) decodedMin = world;
        if (world > decodedMax) decodedMax = world;
      }

      expect(decodedMin).toBeCloseTo(HEIGHTMAP_4X4_EXPECTED_MIN, 5);
      expect(decodedMax).toBeCloseTo(HEIGHTMAP_4X4_EXPECTED_MAX, 5);

      target.dispose();
      renderer.dispose();
    }
  );
});
