import { ClientStateHolder } from '../ClientStateHolder';

describe('ClientStateHolder', () => {
  let stateHolder: ClientStateHolder;

  beforeEach(() => {
    stateHolder = new ClientStateHolder();
  });

  test('should initialize with zero dimensions', () => {
    expect(stateHolder.clientWidth).toBe(0);
    expect(stateHolder.clientHeight).toBe(0);
  });

  test('should allow setting clientWidth', () => {
    stateHolder.clientWidth = 1920;
    expect(stateHolder.clientWidth).toBe(1920);
  });

  test('should allow setting clientHeight', () => {
    stateHolder.clientHeight = 1080;
    expect(stateHolder.clientHeight).toBe(1080);
  });

  test('should set both dimensions with setClientDimensions', () => {
    stateHolder.setClientDimensions(1920, 1080);
    expect(stateHolder.clientWidth).toBe(1920);
    expect(stateHolder.clientHeight).toBe(1080);
  });

  test('should initialize lastX and lastY to 0', () => {
    expect(stateHolder.lastX).toBe(0);
    expect(stateHolder.lastY).toBe(0);
  });

  test('should update lastX and lastY with setLastMousePosition', () => {
    stateHolder.setLastMousePosition(100, 200);
    expect(stateHolder.lastX).toBe(100);
    expect(stateHolder.lastY).toBe(200);
  });

  test('should handle negative mouse positions', () => {
    stateHolder.setLastMousePosition(-10, -20);
    expect(stateHolder.lastX).toBe(-10);
    expect(stateHolder.lastY).toBe(-20);
  });

  test('should handle fractional mouse positions', () => {
    stateHolder.setLastMousePosition(123.45, 678.90);
    expect(stateHolder.lastX).toBe(123.45);
    expect(stateHolder.lastY).toBe(678.90);
  });
});
