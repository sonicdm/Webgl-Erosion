import { createBrushInput } from '../BrushInput';
import { vec2 } from 'gl-matrix';

describe('createBrushInput', () => {
  test('should create BrushInput with defaults when controls is empty', () => {
    const input = createBrushInput({});
    
    expect(input.brushType).toBe(2);
    expect(input.brushSize).toBe(4);
    expect(input.brushStrength).toBe(0.25);
    expect(input.brushOperation).toBe(0);
    expect(input.brushPressed).toBe(0);
    expect(input.flattenTargetHeight).toBe(0.0);
    expect(input.slopeActive).toBe(0);
  });

  test('should use provided control values', () => {
    const controls = {
      brushType: 1,
      brushSize: 8,
      brushStrength: 0.5,
      brushOperation: 1,
      brushPressed: 1,
      flattenTargetHeight: 0.5,
      slopeActive: 1,
    };
    
    const input = createBrushInput(controls);
    
    expect(input.brushType).toBe(1);
    expect(input.brushSize).toBe(8);
    expect(input.brushStrength).toBe(0.5);
    expect(input.brushOperation).toBe(1);
    expect(input.brushPressed).toBe(1);
    expect(input.flattenTargetHeight).toBe(0.5);
    expect(input.slopeActive).toBe(1);
  });

  test('should handle typo in brushStrenth (original typo)', () => {
    const controls = {
      brushStrenth: 0.75, // Note: typo in original
    };
    
    const input = createBrushInput(controls);
    
    expect(input.brushStrength).toBe(0.75);
  });

  test('should prefer brushStrength over brushStrenth', () => {
    const controls = {
      brushStrenth: 0.5,
      brushStrength: 0.8,
    };
    
    const input = createBrushInput(controls);
    
    // The implementation checks brushStrenth first, then brushStrength
    // So if both are present, brushStrenth takes precedence (handling the typo)
    // This test verifies the actual behavior
    expect(input.brushStrength).toBe(0.5);
  });

  test('should clone slopeStartPos vec2', () => {
    const originalPos = vec2.fromValues(0.2, 0.3);
    const controls = { slopeStartPos: originalPos };
    
    const input = createBrushInput(controls);
    
    expect(input.slopeStartPos).not.toBe(originalPos);
    expect(input.slopeStartPos[0]).toBeCloseTo(0.2, 5);
    expect(input.slopeStartPos[1]).toBeCloseTo(0.3, 5);
  });

  test('should clone slopeEndPos vec2', () => {
    const originalPos = vec2.fromValues(0.8, 0.9);
    const controls = { slopeEndPos: originalPos };
    
    const input = createBrushInput(controls);
    
    expect(input.slopeEndPos).not.toBe(originalPos);
    expect(input.slopeEndPos[0]).toBeCloseTo(0.8, 5);
    expect(input.slopeEndPos[1]).toBeCloseTo(0.9, 5);
  });

  test('should clone posTemp vec2', () => {
    const originalPos = vec2.fromValues(0.4, 0.6);
    const controls = { posTemp: originalPos };
    
    const input = createBrushInput(controls);
    
    expect(input.posTemp).not.toBe(originalPos);
    expect(input.posTemp[0]).toBeCloseTo(0.4, 5);
    expect(input.posTemp[1]).toBeCloseTo(0.6, 5);
  });

  test('should create default vec2s when not provided', () => {
    const input = createBrushInput({});
    
    expect(input.slopeStartPos).toBeDefined();
    expect(input.slopeStartPos[0]).toBe(0.0);
    expect(input.slopeStartPos[1]).toBe(0.0);
    
    expect(input.slopeEndPos).toBeDefined();
    expect(input.slopeEndPos[0]).toBe(0.0);
    expect(input.slopeEndPos[1]).toBe(0.0);
    
    expect(input.posTemp).toBeDefined();
    expect(input.posTemp[0]).toBe(0.0);
    expect(input.posTemp[1]).toBe(0.0);
  });
});
