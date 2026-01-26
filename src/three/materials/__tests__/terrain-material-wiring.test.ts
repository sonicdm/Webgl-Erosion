/**
 * Material wiring sanity test (Workstream H).
 * Builds procedural material and applies HeightmapUniforms from a dummy HeightmapSource.
 * Asserts u_Heightmap, u_Sediment, u_SimRes, u_HeightDecodeScale, u_TerrainSize (and
 * that buildHeightmapUniforms provides u_StoredHeightMin/Max) so refactors that drop
 * assignments are caught.
 */

import * as THREE from 'three';
import { createTerrainProceduralMaterial } from '../terrain-procedural-material';
import { buildHeightmapUniforms } from '../../utils/HeightmapUniforms';
import { createHeightmapSource4x4, HEIGHTMAP_4X4_SIMRES, HEIGHTMAP_4X4_EXPECTED_MIN, HEIGHTMAP_4X4_EXPECTED_MAX } from '../../utils/__fixtures__/heightmap-4x4';

describe('terrain material wiring', () => {
  it('creates material with required VTF uniforms', () => {
    const material = createTerrainProceduralMaterial({ minHeight: 0, maxHeight: 6 });
    expect(material.uniforms).toBeDefined();
    expect(material.uniforms.u_Heightmap).toBeDefined();
    expect(material.uniforms.u_Heightmap.value).toBeInstanceOf(THREE.Texture);
    expect(material.uniforms.u_Sediment).toBeDefined();
    expect(material.uniforms.u_Sediment.value).toBeInstanceOf(THREE.Texture);
    expect(material.uniforms.u_SimRes).toBeDefined();
    expect(typeof material.uniforms.u_SimRes.value).toBe('number');
    expect(material.uniforms.u_HeightDecodeScale).toBeDefined();
    expect(typeof material.uniforms.u_HeightDecodeScale.value).toBe('number');
    expect(material.uniforms.u_TerrainSize).toBeDefined();
    expect(typeof material.uniforms.u_TerrainSize.value).toBe('number');
  });

  it('applies HeightmapUniforms from 4x4 fixture and values match', () => {
    const src = createHeightmapSource4x4();
    const block = buildHeightmapUniforms(src, { terrainSize: 1024 });
    const material = createTerrainProceduralMaterial({
      minHeight: HEIGHTMAP_4X4_EXPECTED_MIN,
      maxHeight: HEIGHTMAP_4X4_EXPECTED_MAX
    });

    material.uniforms.u_SimRes.value = block.u_SimRes.value;
    material.uniforms.u_HeightDecodeScale.value = block.u_HeightDecodeScale.value;
    if (block.u_TerrainSize) material.uniforms.u_TerrainSize.value = block.u_TerrainSize.value;

    expect(material.uniforms.u_SimRes.value).toBe(HEIGHTMAP_4X4_SIMRES);
    expect(material.uniforms.u_HeightDecodeScale.value).toBeCloseTo(1 / HEIGHTMAP_4X4_SIMRES, 10);
    expect(material.uniforms.u_TerrainSize.value).toBe(1024);
  });

  it('buildHeightmapUniforms provides u_StoredHeightMin and u_StoredHeightMax', () => {
    const src = createHeightmapSource4x4();
    const block = buildHeightmapUniforms(src, { terrainSize: 1024 });
    expect(block.u_StoredHeightMin).toBeDefined();
    expect(block.u_StoredHeightMax).toBeDefined();
    expect(block.u_StoredHeightMin.value).toBeCloseTo(HEIGHTMAP_4X4_EXPECTED_MIN * HEIGHTMAP_4X4_SIMRES, 5);
    expect(block.u_StoredHeightMax.value).toBeCloseTo(HEIGHTMAP_4X4_EXPECTED_MAX * HEIGHTMAP_4X4_SIMRES, 5);
  });
});
