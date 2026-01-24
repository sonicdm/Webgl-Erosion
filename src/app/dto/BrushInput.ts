import { vec2, vec3, vec4 } from 'gl-matrix';

/**
 * Typed brush input DTO
 * Replaces and extends the BrushControls interface from brush-handler.ts
 */
export interface BrushInput {
  brushType: number; // 0: no brush, 1: terrain, 2: water, 3: rock, 4: smooth, 5: flatten, 6: slope
  brushSize: number;
  brushStrength: number; // Note: original was "brushStrenth" (typo)
  brushOperation: number; // 0: add, 1: subtract
  brushPressed: number; // 0: not pressed, 1: pressed
  flattenTargetHeight: number;
  slopeStartPos: vec2;
  slopeEndPos: vec2;
  slopeActive: number;
  posTemp: vec2;
  
  // Mouse world position and direction (for brush painting)
  mouseWorldPos?: vec4; // [x, y, z, w]
  mouseWorldDir?: vec3; // [x, y, z]
  brushPos?: vec2; // [x, y] in UV coordinates
}

/**
 * Creates a BrushInput from a controls-like object
 */
export function createBrushInput(controls: any): BrushInput {
  return {
    brushType: controls.brushType ?? 2,
    brushSize: controls.brushSize ?? 4,
    brushStrength: controls.brushStrenth ?? controls.brushStrength ?? 0.25, // Handle typo
    brushOperation: controls.brushOperation ?? 0,
    brushPressed: controls.brushPressed ?? 0,
    flattenTargetHeight: controls.flattenTargetHeight ?? 0.0,
    slopeStartPos: controls.slopeStartPos ? vec2.clone(controls.slopeStartPos) : vec2.fromValues(0.0, 0.0),
    slopeEndPos: controls.slopeEndPos ? vec2.clone(controls.slopeEndPos) : vec2.fromValues(0.0, 0.0),
    slopeActive: controls.slopeActive ?? 0,
    posTemp: controls.posTemp ? vec2.clone(controls.posTemp) : vec2.fromValues(0.0, 0.0),
  };
}
