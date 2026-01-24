/**
 * Shader compilation tests
 * 
 * Tests that all shaders compile without errors using a WebGL2 mock.
 * This validates shader syntax and basic GLSL correctness.
 * 
 * NOTE: These tests require proper WebGL2 mocking. The current implementation
 * has TypeScript type issues because ShaderProgram expects non-null uniform
 * locations, but WebGL2RenderingContext.getUniformLocation can return null.
 * 
 * For now, use shader-validation.test.ts for static shader source validation.
 * Full compilation tests can be added once the type issues are resolved.
 */

// TODO: Fix WebGL2 mock type compatibility issues
// The mock needs to properly override WebGL2RenderingContext types
// to make getUniformLocation return non-null for testing

import { createWebGL2Mock } from '../../test-utils/webgl2-mock';
import { setGL } from '../../globals';
import ShaderProgram, { Shader } from '../gl/ShaderProgram';

describe('Shader Compilation', () => {
  let mockGL: ReturnType<typeof createWebGL2Mock>;

  beforeEach(() => {
    mockGL = createWebGL2Mock();
    // Set the global gl context for ShaderProgram using setGL
    // Cast to WebGL2RenderingContext to satisfy type system
    // The mock implements the interface but TypeScript needs the cast
    setGL(mockGL as unknown as WebGL2RenderingContext);
  });

  afterEach(() => {
    // Clean up
    setGL(null as any);
  });

  test('should compile a simple vertex shader', () => {
    const vertexSource = `
      #version 300 es
      in vec3 vs_Pos;
      uniform mat4 u_ViewProj;
      void main() {
        gl_Position = u_ViewProj * vec4(vs_Pos, 1.0);
      }
    `;

    const shader = new Shader(mockGL.VERTEX_SHADER, vertexSource);
    expect(shader.shader).toBeDefined();
    expect(mockGL.getShaderParameter(shader.shader, mockGL.COMPILE_STATUS)).toBe(1);
    expect(mockGL.getShaderInfoLog(shader.shader)).toBeNull();
  });

  test('should compile a simple fragment shader', () => {
    const fragmentSource = `
      #version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `;

    const shader = new Shader(mockGL.FRAGMENT_SHADER, fragmentSource);
    expect(shader.shader).toBeDefined();
    expect(mockGL.getShaderParameter(shader.shader, mockGL.COMPILE_STATUS)).toBe(1);
  });

  test('should fail compilation for shader with syntax error', () => {
    const invalidSource = `
      #version 300 es
      void main() {
        gl_Position = vec4(1.0; // Missing closing paren
      }
    `;

    expect(() => {
      new Shader(mockGL.VERTEX_SHADER, invalidSource);
    }).toThrow();
  });

  test('should fail compilation for shader without main function', () => {
    const invalidSource = `
      #version 300 es
      in vec3 vs_Pos;
      // No main() function
    `;

    expect(() => {
      new Shader(mockGL.VERTEX_SHADER, invalidSource);
    }).toThrow('Shader must contain a main() function');
  });

  test('should create and link a shader program', () => {
    const vertexSource = `
      #version 300 es
      in vec3 vs_Pos;
      uniform mat4 u_ViewProj;
      void main() {
        gl_Position = u_ViewProj * vec4(vs_Pos, 1.0);
      }
    `;

    const fragmentSource = `
      #version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(1.0);
      }
    `;

    const program = new ShaderProgram([
      new Shader(mockGL.VERTEX_SHADER, vertexSource),
      new Shader(mockGL.FRAGMENT_SHADER, fragmentSource),
    ]);

    expect(program.prog).toBeDefined();
    expect(mockGL.getProgramParameter(program.prog, mockGL.LINK_STATUS)).toBe(1);
  });

  test('should fail to link program with uncompiled shader', () => {
    const validVertex = `
      #version 300 es
      in vec3 vs_Pos;
      void main() {
        gl_Position = vec4(vs_Pos, 1.0);
      }
    `;

    const invalidFragment = `
      #version 300 es
      // Missing main function
    `;

    const vertexShader = new Shader(mockGL.VERTEX_SHADER, validVertex);
    
    // Fragment shader should fail to compile and throw
    expect(() => {
      new Shader(mockGL.FRAGMENT_SHADER, invalidFragment);
    }).toThrow('Shader must contain a main() function');

    // Since fragment shader creation throws, we can't create a program with it
    // This test verifies that invalid shaders are caught at creation time
  });

  test('should retrieve uniform locations', () => {
    const vertexSource = `
      #version 300 es
      in vec3 vs_Pos;
      uniform mat4 u_ViewProj;
      uniform mat4 u_Model;
      void main() {
        gl_Position = u_ViewProj * u_Model * vec4(vs_Pos, 1.0);
      }
    `;

    const fragmentSource = `
      #version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(1.0);
      }
    `;

    const program = new ShaderProgram([
      new Shader(mockGL.VERTEX_SHADER, vertexSource),
      new Shader(mockGL.FRAGMENT_SHADER, fragmentSource),
    ]);

    // Uniform locations should be retrieved (mock returns non-null)
    expect(program.unifViewProj).toBeDefined();
    expect(program.unifModel).toBeDefined();
    // Mock returns string identifiers, so check they're truthy
    expect(program.unifViewProj).toBeTruthy();
    expect(program.unifModel).toBeTruthy();
  });

  test('should retrieve attribute locations', () => {
    const vertexSource = `
      #version 300 es
      in vec3 vs_Pos;
      in vec3 vs_Nor;
      in vec2 vs_Uv;
      void main() {
        gl_Position = vec4(vs_Pos, 1.0);
      }
    `;

    const fragmentSource = `
      #version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(1.0);
      }
    `;

    const program = new ShaderProgram([
      new Shader(mockGL.VERTEX_SHADER, vertexSource),
      new Shader(mockGL.FRAGMENT_SHADER, fragmentSource),
    ]);

    expect(program.attrPos).toBeGreaterThanOrEqual(0);
    expect(program.attrNor).toBeGreaterThanOrEqual(0);
    expect(program.attrUv).toBeGreaterThanOrEqual(0);
  });
});

// TODO: Add shader factory compilation tests once WebGL2 mock type issues are resolved
// For now, use shader-validation.test.ts for static validation
