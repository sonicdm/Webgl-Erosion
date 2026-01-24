import { vec2 } from 'gl-matrix';
import { SourceArrays } from '../SourceArrays';
import { MAX_WATER_SOURCES, WaterSource } from '../../../utils/water-sources';
import { MAX_LAVA_SOURCES, LavaSource } from '../../../utils/lava-sources';

const makeWater = (count: number): WaterSource[] =>
  Array.from({ length: count }, (_, i) => ({
    position: vec2.fromValues(i * 1.0, i * 2.0),
    size: i + 0.5,
    strength: i + 1,
  }));

const makeLava = (count: number): LavaSource[] =>
  Array.from({ length: count }, (_, i) => ({
    position: vec2.fromValues(i * 1.5, i * 0.5),
    size: i + 2,
    strength: i + 3,
  }));

describe('SourceArrays packing (Workstream A)', () => {
  it('packs water sources and zero-fills unused slots', () => {
    const sources = makeWater(3);
    const sa = new SourceArrays(sources, []);
    const { positions, sizes, strengths, count } = sa.packWaterSourcesForShader();

    expect(count).toBe(3);
    expect(positions.slice(0, 6)).toEqual(new Float32Array([0, 0, 1, 2, 2, 4]));
    expect(sizes.slice(0, 3)).toEqual(new Float32Array([0.5, 1.5, 2.5]));
    expect(strengths.slice(0, 3)).toEqual(new Float32Array([1, 2, 3]));

    // Tail should be zeroed
    expect(positions[positions.length - 1]).toBe(0);
    expect(positions.length).toBe(MAX_WATER_SOURCES * 2);
  });

  it('packs lava sources and zero-fills unused slots', () => {
    const sources = makeLava(2);
    const sa = new SourceArrays([], sources);
    const { positions, sizes, strengths, count } = sa.packLavaSourcesForShader();

    expect(count).toBe(2);
    expect(positions.slice(0, 4)).toEqual(new Float32Array([0, 0, 1.5, 0.5]));
    expect(sizes.slice(0, 2)).toEqual(new Float32Array([2, 3]));
    expect(strengths.slice(0, 2)).toEqual(new Float32Array([3, 4]));

    // Tail should be zeroed
    expect(positions[positions.length - 1]).toBe(0);
    expect(positions.length).toBe(MAX_LAVA_SOURCES * 2);
  });
});
