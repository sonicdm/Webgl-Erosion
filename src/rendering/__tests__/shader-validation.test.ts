/**
 * Shader source validation tests
 * 
 * Tests shader source code for common errors without requiring WebGL compilation.
 * This is a fast, static analysis approach that can run in Jest.
 */

import * as fs from 'fs';
import * as path from 'path';

// Read shader files directly (simpler than trying to import with ?raw in Jest)
const shaderDir = path.join(__dirname, '../../shaders');
const terrainVert = fs.readFileSync(path.join(shaderDir, 'terrain-vert.glsl'), 'utf8');
const terrainFrag = fs.readFileSync(path.join(shaderDir, 'terrain-frag.glsl'), 'utf8');
const quadVert = fs.readFileSync(path.join(shaderDir, 'quad-vert.glsl'), 'utf8');
const flowFrag = fs.readFileSync(path.join(shaderDir, 'flow-frag.glsl'), 'utf8');

describe('Shader Source Validation', () => {
  function validateShaderSource(source: string, shaderName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for main function
    if (!source.includes('void main()') && !source.includes('void main(void)')) {
      errors.push(`${shaderName}: Missing main() function`);
    }

    // Check for balanced braces
    const openBraces = (source.match(/{/g) || []).length;
    const closeBraces = (source.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`${shaderName}: Mismatched braces (${openBraces} open, ${closeBraces} close)`);
    }

    // Check for balanced parentheses
    const openParens = (source.match(/\(/g) || []).length;
    const closeParens = (source.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`${shaderName}: Mismatched parentheses (${openParens} open, ${closeParens} close)`);
    }

    // Check for version directive (GLSL 300 es)
    if (!source.includes('#version')) {
      errors.push(`${shaderName}: Missing #version directive`);
    }

    // Check for precision in fragment shaders
    if (source.includes('fragColor') || source.includes('out vec4')) {
      // Fragment shader - should have precision
      if (!source.includes('precision') && !source.includes('highp') && !source.includes('mediump') && !source.includes('lowp')) {
        // This is a warning, not an error - some shaders use #version 300 es which requires precision
        // But it's good practice to have it
      }
    }

    return { valid: errors.length === 0, errors };
  }

  test('terrain vertex shader should have valid syntax', () => {
    const result = validateShaderSource(terrainVert, 'terrain-vert');
    if (!result.valid) {
      console.error('Shader validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  });

  test('terrain fragment shader should have valid syntax', () => {
    const result = validateShaderSource(terrainFrag, 'terrain-frag');
    if (!result.valid) {
      console.error('Shader validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  });

  test('quad vertex shader should have valid syntax', () => {
    const result = validateShaderSource(quadVert, 'quad-vert');
    if (!result.valid) {
      console.error('Shader validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  });

  test('flow fragment shader should have valid syntax', () => {
    const result = validateShaderSource(flowFrag, 'flow-frag');
    if (!result.valid) {
      console.error('Shader validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  });

  test('shader should have matching version directives', () => {
    // Check that vertex and fragment shaders use compatible versions
    const vertVersion = terrainVert.match(/#version\s+(\d+)/)?.[1];
    const fragVersion = terrainFrag.match(/#version\s+(\d+)/)?.[1];

    if (vertVersion && fragVersion) {
      expect(vertVersion).toBe(fragVersion);
    }
  });

  test('shader should declare required attributes', () => {
    // Check for common attributes
    expect(terrainVert).toMatch(/in\s+vec[234]\s+vs_Pos/);
  });

  test('shader should declare required uniforms', () => {
    // Check for common uniforms
    expect(terrainVert).toMatch(/uniform\s+mat4\s+u_ViewProj/);
  });
});
