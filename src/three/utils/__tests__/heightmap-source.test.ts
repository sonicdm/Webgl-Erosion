import { BufferAttribute, BufferGeometry } from 'three';
import { createHeightmapSourceFromHeights, extractHeightmapFromGeometry, uploadHeightmap } from '../terrain-heightmap-converter';
import { encodeRaw, decodeRaw } from '../heightEncoding';
import { HeightmapSource } from '../HeightmapSource';
import * as THREE from 'three';

function makeGridGeometry(heights: number[][]): { geometry: BufferGeometry; simres: number } {
  const simres = heights.length;
  const positions = new Float32Array(simres * simres * 3);
  let idx = 0;
  for (let row = 0; row < simres; row++) {
    for (let col = 0; col < simres; col++) {
      positions[idx++] = col;                 // x (unused for height extraction)
      positions[idx++] = 0;                   // y (unused)
      positions[idx++] = heights[row][col];   // z carries height in this geometry
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return { geometry, simres };
}

describe('heightEncoding helpers', () => {
  it('encodes and decodes raw heights symmetrically', () => {
    const simres = 1024;
    const worldHeight = 2.5;
    const stored = encodeRaw(worldHeight, simres);
    const decoded = decodeRaw(stored, simres);
    expect(stored).toBeCloseTo(worldHeight * simres);
    expect(decoded).toBeCloseTo(worldHeight);
  });
});

describe('HeightmapSource', () => {
  it('builds uniform block with stored min/max scaled by simres', () => {
    const simres = 4;
    const src = new HeightmapSource(-2, 3, simres, new Float32Array(simres * simres * 4), simres, simres);
    const block = src.getUniformBlock();
    expect(block.u_SimRes.value).toBe(simres);
    expect(block.u_StoredHeightMin.value).toBeCloseTo(-2 * simres);
    expect(block.u_StoredHeightMax.value).toBeCloseTo(3 * simres);
  });
});

describe('heightmap extraction', () => {
  it('creates HeightmapSource from stored heights array', () => {
    const simres = 2;
    const worldHeights = [0, 1, -1, 2]; // row-major
    const stored = new Float32Array(worldHeights.map((h) => encodeRaw(h, simres)));
    const src = createHeightmapSourceFromHeights(stored, simres);
    expect(src.minHeight).toBeCloseTo(-1);
    expect(src.maxHeight).toBeCloseTo(2);
    expect(src.textureData.length).toBe(simres * simres * 4);
    expect(src.textureData[0]).toBeCloseTo(encodeRaw(0, simres));
    expect(src.textureData[4]).toBeCloseTo(encodeRaw(1, simres)); // next pixel R
  });

  it('extracts heights from geometry and keeps stored heights in world units', () => {
    const heights = [
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
    ];
    const { geometry, simres } = makeGridGeometry(heights);
    const src = extractHeightmapFromGeometry(geometry, simres);

    expect(src.minHeight).toBeCloseTo(0);
    expect(src.maxHeight).toBeCloseTo(4);
    expect(src.textureData.length).toBe(simres * simres * 4);

    // First texel R should be storedHeight = worldHeight * simres (RAW encoding)
    expect(src.textureData[0]).toBeCloseTo(encodeRaw(0, simres));
    // Last texel R should match bottom-right height
    const lastIndex = (simres * simres - 1) * 4;
    expect(src.textureData[lastIndex]).toBeCloseTo(encodeRaw(4, simres));
  });

  it('uploads heightmap data with RGBA32F and marks texture correctly', () => {
    const simres = 2;
    const stored = new Float32Array([
      encodeRaw(0, simres), encodeRaw(1, simres),
      encodeRaw(2, simres), encodeRaw(3, simres),
    ]);
    const src = createHeightmapSourceFromHeights(stored, simres, 0, 3);

    const gl = {
      TEXTURE_2D: 3553,
      RGBA32F: 0x8814,
      RGBA: 6408,
      FLOAT: 5126,
      LINEAR: 9729,
      CLAMP_TO_EDGE: 33071,
      bindTexture: jest.fn(),
      texImage2D: jest.fn(),
      texParameteri: jest.fn(),
    } as unknown as WebGL2RenderingContext;

    const texture = { type: null as any, format: null as any, needsUpdate: true };
    const textureProps: any = { __webglTexture: {} };
    const renderer = {
      getContext: () => gl,
      properties: { get: () => textureProps },
    } as unknown as THREE.WebGLRenderer;

    const target = { width: simres, height: simres, texture } as unknown as THREE.WebGLRenderTarget;

    uploadHeightmap(renderer, src, target);

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, textureProps.__webglTexture);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      target.width,
      target.height,
      0,
      gl.RGBA,
      gl.FLOAT,
      src.textureData
    );
    expect(texture.needsUpdate).toBe(false);
    expect(texture.type).toBe(THREE.FloatType);
    expect(texture.format).toBe(THREE.RGBAFormat);
    expect(textureProps.__webglInit).toBe(true);
    expect(textureProps.__webglTextureType).toBe(gl.FLOAT);
    expect(textureProps.__webglTextureFormat).toBe(gl.RGBA);
    expect(textureProps.__webglTextureInternalFormat).toBe(gl.RGBA32F);
  });
});
