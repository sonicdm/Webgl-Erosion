import { SimulationStateHolder } from '../SimulationStateHolder';

describe('SimulationStateHolder', () => {
  let stateHolder: SimulationStateHolder;

  beforeEach(() => {
    stateHolder = new SimulationStateHolder(1024);
  });

  test('should initialize with provided simres', () => {
    expect(stateHolder.simres).toBe(1024);
  });

  test('should initialize with default simres when not provided', () => {
    const defaultHolder = new SimulationStateHolder();
    expect(defaultHolder.simres).toBe(1024);
  });

  test('should allow setting simres', () => {
    stateHolder.simres = 512;
    expect(stateHolder.simres).toBe(512);
  });

  test('should initialize simFrameCount to 0', () => {
    expect(stateHolder.simFrameCount).toBe(0);
  });

  test('should allow setting simFrameCount', () => {
    stateHolder.simFrameCount = 100;
    expect(stateHolder.simFrameCount).toBe(100);
  });

  test('should increment simFrameCount', () => {
    stateHolder.simFrameCount = 5;
    stateHolder.incrementSimFrameCount();
    expect(stateHolder.simFrameCount).toBe(6);
  });

  test('should initialize pauseGeneration to false', () => {
    expect(stateHolder.pauseGeneration).toBe(false);
  });

  test('should allow setting pauseGeneration', () => {
    stateHolder.pauseGeneration = true;
    expect(stateHolder.pauseGeneration).toBe(true);
  });

  test('should initialize terrainGeometryDirty to true', () => {
    expect(stateHolder.terrainGeometryDirty).toBe(true);
  });

  test('should allow setting terrainGeometryDirty', () => {
    stateHolder.terrainGeometryDirty = false;
    expect(stateHolder.terrainGeometryDirty).toBe(false);
  });

  test('should initialize speed to 3', () => {
    expect(stateHolder.speed).toBe(3);
  });

  test('should allow setting speed', () => {
    stateHolder.speed = 5;
    expect(stateHolder.speed).toBe(5);
  });
});
