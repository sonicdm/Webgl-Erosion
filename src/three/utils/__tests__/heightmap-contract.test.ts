import * as THREE from 'three';
import { ENCODING, assertRawHeightmap } from '../HeightmapContract';
import { createHeightmapSource4x4 } from '../__fixtures__/heightmap-4x4';

describe('HeightmapContract', () => {
  it('exports ENCODING as RAW_SIMRES', () => {
    expect(ENCODING).toBe('RAW_SIMRES');
  });

  it('throws when texture.type is not FloatType', () => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    expect(() => assertRawHeightmap({ texture: tex })).toThrow(/FloatType|normalize/);
  });

  it('does not throw when texture has FloatType', () => {
    const tex = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    expect(() => assertRawHeightmap({ texture: tex })).not.toThrow();
  });

  it('throws when internalFormat is not RGBA32F', () => {
    expect(() => assertRawHeightmap({ internalFormat: 0x1908 })).toThrow(/RGBA32F|normalized/);
    expect(() => assertRawHeightmap({ internalFormat: 0x8058 })).toThrow(/RGBA32F|normalized/); // RGBA8
  });

  it('does not throw when internalFormat is RGBA32F', () => {
    expect(() => assertRawHeightmap({ internalFormat: 0x8814 })).not.toThrow();
  });

  it('throws when textureType is not FLOAT', () => {
    expect(() => assertRawHeightmap({ textureType: 0x1401 })).toThrow(/FLOAT/); // UNSIGNED_BYTE
  });

  it('does not throw when textureType is FLOAT', () => {
    expect(() => assertRawHeightmap({ textureType: 0x1406 })).not.toThrow();
  });

  it('throws when source.simres is invalid', () => {
    const badSource = { simres: 0, minHeight: 0, maxHeight: 1, textureData: new Float32Array(16), width: 4, height: 4 } as any;
    expect(() => assertRawHeightmap({ source: badSource })).toThrow(/simres/);
  });

  it('does not throw when source is valid HeightmapSource', () => {
    const src = createHeightmapSource4x4();
    expect(() => assertRawHeightmap({ source: src })).not.toThrow();
  });

  it('accepts null/undefined options without throwing', () => {
    expect(() => assertRawHeightmap({})).not.toThrow();
    expect(() => assertRawHeightmap({ texture: null, source: null })).not.toThrow();
  });
});
