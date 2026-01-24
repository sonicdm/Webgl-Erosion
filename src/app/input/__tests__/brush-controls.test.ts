import { normalizeMousePosition } from '../brush-controls';

describe('normalizeMousePosition', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    // Create a mock canvas element
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    
    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
      right: 900,
      bottom: 650,
      x: 100,
      y: 50,
      toJSON: () => {},
    }));
  });

  test('should normalize mouse position correctly', () => {
    const result = normalizeMousePosition(canvas, 200, 150);
    
    // Mouse at (200, 150), canvas at (100, 50) with size (800, 600)
    // Normalized: ((200 - 100) / 800, (150 - 50) / 600) = (0.125, 0.167)
    expect(result.x).toBeCloseTo(0.125, 5);
    expect(result.y).toBeCloseTo(0.166666, 5);
  });

  test('should return (0, 0) for null canvas', () => {
    const result = normalizeMousePosition(null as any, 200, 150);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  test('should return (0, 0) for zero-width canvas', () => {
    canvas.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 50,
      width: 0,
      height: 600,
      right: 100,
      bottom: 650,
      x: 100,
      y: 50,
      toJSON: () => {},
    }));
    
    const result = normalizeMousePosition(canvas, 200, 150);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  test('should return (0, 0) for zero-height canvas', () => {
    canvas.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 50,
      width: 800,
      height: 0,
      right: 900,
      bottom: 50,
      x: 100,
      y: 50,
      toJSON: () => {},
    }));
    
    const result = normalizeMousePosition(canvas, 200, 150);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  test('should handle mouse at top-left corner', () => {
    const result = normalizeMousePosition(canvas, 100, 50);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  test('should handle mouse at bottom-right corner', () => {
    const result = normalizeMousePosition(canvas, 900, 650);
    expect(result.x).toBe(1);
    expect(result.y).toBe(1);
  });

  test('should handle mouse outside canvas bounds', () => {
    // Mouse to the left of canvas
    const resultLeft = normalizeMousePosition(canvas, 50, 200);
    expect(resultLeft.x).toBeLessThan(0);
    
    // Mouse above canvas
    const resultTop = normalizeMousePosition(canvas, 200, 30);
    expect(resultTop.y).toBeLessThan(0);
    
    // Mouse to the right of canvas
    const resultRight = normalizeMousePosition(canvas, 1000, 200);
    expect(resultRight.x).toBeGreaterThan(1);
    
    // Mouse below canvas
    const resultBottom = normalizeMousePosition(canvas, 200, 700);
    expect(resultBottom.y).toBeGreaterThan(1);
  });

  test('should handle fractional pixel positions', () => {
    const result = normalizeMousePosition(canvas, 150.5, 125.25);
    // Mouse at (150.5, 125.25), canvas at (100, 50) with size (800, 600)
    // Normalized: ((150.5 - 100) / 800, (125.25 - 50) / 600) = (0.063125, 0.125416)
    expect(result.x).toBeCloseTo(0.063125, 5);
    expect(result.y).toBeCloseTo(0.125416, 5);
  });
});
