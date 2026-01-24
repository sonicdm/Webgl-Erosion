import { TerrainStateHolder } from '../TerrainStateHolder';
import { BufferGeometry } from 'three';

describe('TerrainStateHolder', () => {
  let stateHolder: TerrainStateHolder;

  beforeEach(() => {
    stateHolder = new TerrainStateHolder(1024);
  });

  test('should initialize with null terrain geometry', () => {
    expect(stateHolder.terrainGeometry).toBeNull();
  });

  test('should allow setting terrain geometry', () => {
    const geometry = new BufferGeometry();
    stateHolder.terrainGeometry = geometry;
    expect(stateHolder.terrainGeometry).toBe(geometry);
  });

  test('should initialize with null terrain BVH', () => {
    expect(stateHolder.terrainBVH).toBeNull();
  });

  test('should initialize terrainBVHBuildInProgress to false', () => {
    expect(stateHolder.terrainBVHBuildInProgress).toBe(false);
  });

  test('should allow setting terrainBVHBuildInProgress', () => {
    stateHolder.terrainBVHBuildInProgress = true;
    expect(stateHolder.terrainBVHBuildInProgress).toBe(true);
  });

  test('should initialize heightMapCpuBuf with correct size', () => {
    const expectedSize = 1024 * 1024 * 4;
    expect(stateHolder.heightMapCpuBuf.length).toBe(expectedSize);
  });

  test('should resize heightMapCpuBuf when resolution changes', () => {
    stateHolder.resizeHeightMapCpuBuf(512);
    const expectedSize = 512 * 512 * 4;
    expect(stateHolder.heightMapCpuBuf.length).toBe(expectedSize);
  });

  test('should not resize heightMapCpuBuf if size is already correct', () => {
    const originalBuf = stateHolder.heightMapCpuBuf;
    stateHolder.resizeHeightMapCpuBuf(1024);
    expect(stateHolder.heightMapCpuBuf).toBe(originalBuf);
  });

  test('should initialize heightMapBufCounter to 0', () => {
    expect(stateHolder.heightMapBufCounter).toBe(0);
  });

  test('should increment heightMapBufCounter', () => {
    stateHolder.incrementHeightMapBufCounter();
    expect(stateHolder.heightMapBufCounter).toBe(1);
    stateHolder.incrementHeightMapBufCounter();
    expect(stateHolder.heightMapBufCounter).toBe(2);
  });

  test('should reset heightMapBufCounter', () => {
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.resetHeightMapBufCounter();
    expect(stateHolder.heightMapBufCounter).toBe(0);
  });

  test('should initialize heightMapBufIsFresh to false', () => {
    expect(stateHolder.heightMapBufIsFresh).toBe(false);
  });

  test('should allow setting heightMapBufIsFresh', () => {
    stateHolder.heightMapBufIsFresh = true;
    expect(stateHolder.heightMapBufIsFresh).toBe(true);
  });

  test('should initialize geometryUpdateCounter to 0', () => {
    expect(stateHolder.geometryUpdateCounter).toBe(0);
  });

  test('should increment geometryUpdateCounter', () => {
    stateHolder.incrementGeometryUpdateCounter();
    expect(stateHolder.geometryUpdateCounter).toBe(1);
  });

  test('should reset geometryUpdateCounter', () => {
    stateHolder.incrementGeometryUpdateCounter();
    stateHolder.incrementGeometryUpdateCounter();
    stateHolder.resetGeometryUpdateCounter();
    expect(stateHolder.geometryUpdateCounter).toBe(0);
  });

  test('should initialize geometryNeedsUpdate to false', () => {
    expect(stateHolder.geometryNeedsUpdate).toBe(false);
  });

  test('should allow setting geometryNeedsUpdate', () => {
    stateHolder.geometryNeedsUpdate = true;
    expect(stateHolder.geometryNeedsUpdate).toBe(true);
  });

  test('should initialize geometryUpdateInterval to 2000', () => {
    expect(stateHolder.geometryUpdateInterval).toBe(2000);
  });

  test('should allow setting geometryUpdateInterval', () => {
    stateHolder.geometryUpdateInterval = 1000;
    expect(stateHolder.geometryUpdateInterval).toBe(1000);
  });

  test('should enforce minimum geometryUpdateInterval of 1', () => {
    stateHolder.geometryUpdateInterval = 0;
    expect(stateHolder.geometryUpdateInterval).toBe(1);
    stateHolder.geometryUpdateInterval = -5;
    expect(stateHolder.geometryUpdateInterval).toBe(1);
  });

  test('should initialize enableBVHUpdates to true', () => {
    expect(stateHolder.enableBVHUpdates).toBe(true);
  });

  test('should allow setting enableBVHUpdates', () => {
    stateHolder.enableBVHUpdates = false;
    expect(stateHolder.enableBVHUpdates).toBe(false);
  });

  test('should return false for shouldUpdateGeometry when BVH updates disabled', () => {
    stateHolder.enableBVHUpdates = false;
    stateHolder.geometryNeedsUpdate = true;
    expect(stateHolder.shouldUpdateGeometry()).toBe(false);
  });

  test('should return true for shouldUpdateGeometry when geometryNeedsUpdate is true', () => {
    stateHolder.enableBVHUpdates = true;
    stateHolder.geometryNeedsUpdate = true;
    expect(stateHolder.shouldUpdateGeometry()).toBe(true);
  });

  test('should return true for shouldUpdateGeometry when counter exceeds interval', () => {
    stateHolder.enableBVHUpdates = true;
    stateHolder.geometryUpdateInterval = 2;
    stateHolder.incrementGeometryUpdateCounter();
    stateHolder.incrementGeometryUpdateCounter();
    expect(stateHolder.shouldUpdateGeometry()).toBe(true);
  });

  test('should return false for shouldUpdateGeometry when conditions not met', () => {
    stateHolder.enableBVHUpdates = true;
    stateHolder.geometryNeedsUpdate = false;
    // Use increment method instead of direct assignment
    stateHolder.incrementGeometryUpdateCounter();
    stateHolder.geometryUpdateInterval = 10;
    expect(stateHolder.shouldUpdateGeometry()).toBe(false);
  });

  test('should return true for shouldReadHeightmap when counter exceeds max', () => {
    for (let i = 0; i < stateHolder.MaxHeightMapBufCounter; i++) {
      stateHolder.incrementHeightMapBufCounter();
    }
    expect(stateHolder.shouldReadHeightmap(false, false, 1024)).toBe(true);
  });

  test('should return true for shouldReadHeightmap when brush pressed and counter matches interval', () => {
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.incrementHeightMapBufCounter();
    expect(stateHolder.shouldReadHeightmap(true, false, 1024)).toBe(true);
  });

  test('should return true for shouldReadHeightmap when brush visible and counter matches interval', () => {
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.incrementHeightMapBufCounter();
    stateHolder.incrementHeightMapBufCounter();
    expect(stateHolder.shouldReadHeightmap(false, true, 1024)).toBe(true);
  });
});
