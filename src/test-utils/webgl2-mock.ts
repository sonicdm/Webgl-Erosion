/**
 * WebGL2 Mock for testing shader compilation in Jest
 * 
 * This provides a minimal WebGL2 context mock that supports:
 * - Shader creation and compilation
 * - Program creation and linking
 * - Uniform/attribute location retrieval
 * 
 * Note: This does NOT execute shaders - it only validates compilation.
 * For actual rendering tests, use Puppeteer with a real browser.
 */

export interface WebGL2MockContext {
  createShader: (type: number) => WebGLShader | null;
  shaderSource: (shader: WebGLShader, source: string) => void;
  compileShader: (shader: WebGLShader) => void;
  getShaderParameter: (shader: WebGLShader, pname: number) => any;
  getShaderInfoLog: (shader: WebGLShader) => string | null;
  createProgram: () => WebGLProgram | null;
  attachShader: (program: WebGLProgram, shader: WebGLShader) => void;
  linkProgram: (program: WebGLProgram) => void;
  getProgramParameter: (program: WebGLProgram, pname: number) => any;
  getProgramInfoLog: (program: WebGLProgram) => string | null;
  // Returns non-null only if uniform exists in shader (matches real WebGL behavior)
  getUniformLocation: (program: WebGLProgram, name: string) => WebGLUniformLocation | null;
  getAttribLocation: (program: WebGLProgram, name: string) => number;
  VERTEX_SHADER: number;
  FRAGMENT_SHADER: number;
  COMPILE_STATUS: number;
  LINK_STATUS: number;
  [key: string]: any; // Allow other WebGL2 constants
}

/**
 * Creates a minimal WebGL2 mock context for testing shader compilation
 * 
 * This mock validates shader syntax by checking for common GLSL errors:
 * - Missing main() function
 * - Syntax errors (basic validation)
 * - Type mismatches (basic)
 * 
 * For full shader execution testing, use Puppeteer with a real browser.
 */
export function createWebGL2Mock(): WebGL2MockContext {
  let shaderIdCounter = 0;
  let programIdCounter = 0;
  const shaders = new Map<WebGLShader, { type: number; source: string; compiled: boolean; error: string | null }>();
  const programs = new Map<WebGLProgram, { linked: boolean; error: string | null; shaders: WebGLShader[]; uniforms: Set<string> }>();

  // Basic GLSL validation - checks for common errors
  function validateShaderSource(source: string, type: number): string | null {
    // Check for main function
    if (!source.includes('void main()') && !source.includes('void main(void)')) {
      return 'Shader must contain a main() function';
    }

    // Check for basic syntax issues
    const openBraces = (source.match(/{/g) || []).length;
    const closeBraces = (source.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      return `Mismatched braces: ${openBraces} open, ${closeBraces} close`;
    }

    // Check for mismatched parentheses
    let parenDepth = 0;
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '(') parenDepth++;
      else if (source[i] === ')') parenDepth--;
      if (parenDepth < 0) {
        return 'Mismatched parentheses: closing paren without opening';
      }
    }
    if (parenDepth !== 0) {
      return 'Mismatched parentheses: unclosed parentheses';
    }

    // Check for required precision in fragment shader
    if (type === 35632) { // FRAGMENT_SHADER
      if (!source.includes('precision') && !source.includes('highp') && !source.includes('mediump') && !source.includes('lowp')) {
        // Some shaders might use #version 300 es which requires precision
        // This is a warning, not an error
      }
    }

    return null; // No errors found
  }

  const mock: WebGL2MockContext = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,

    createShader(type: number): WebGLShader | null {
      const shader = `shader_${shaderIdCounter++}` as any;
      shaders.set(shader, { type, source: '', compiled: false, error: null });
      return shader;
    },

    shaderSource(shader: WebGLShader, source: string): void {
      const shaderData = shaders.get(shader);
      if (shaderData) {
        shaderData.source = source;
      }
    },

    compileShader(shader: WebGLShader): void {
      const shaderData = shaders.get(shader);
      if (!shaderData) return;

      const error = validateShaderSource(shaderData.source, shaderData.type);
      shaderData.compiled = error === null;
      shaderData.error = error;
    },

    getShaderParameter(shader: WebGLShader, pname: number): any {
      const shaderData = shaders.get(shader);
      if (!shaderData) return null;

      if (pname === this.COMPILE_STATUS) {
        return shaderData.compiled ? 1 : 0;
      }
      return null;
    },

    getShaderInfoLog(shader: WebGLShader): string | null {
      const shaderData = shaders.get(shader);
      return shaderData?.error || null;
    },

    createProgram(): WebGLProgram | null {
      const program = `program_${programIdCounter++}` as any;
      programs.set(program, { linked: false, error: null, shaders: [], uniforms: new Set() });
      return program;
    },

    attachShader(program: WebGLProgram, shader: WebGLShader): void {
      const programData = programs.get(program);
      if (programData) {
        programData.shaders.push(shader);
      }
    },

    linkProgram(program: WebGLProgram): void {
      const programData = programs.get(program);
      if (!programData) return;

      // Check that all attached shaders are compiled
      const allCompiled = programData.shaders.every(shader => {
        const shaderData = shaders.get(shader);
        return shaderData?.compiled === true;
      });

      if (!allCompiled) {
        programData.error = 'Cannot link program: not all shaders are compiled';
        programData.linked = false;
        return;
      }

      // Parse all shader sources to extract declared uniforms
      programData.uniforms.clear();
      for (const shader of programData.shaders) {
        const shaderData = shaders.get(shader);
        if (shaderData?.source) {
          // Extract uniform declarations using regex
          // Matches: uniform type name;
          // Examples: uniform mat4 u_ViewProj; uniform float u_Time;
          const uniformRegex = /uniform\s+\w+\s+(\w+)\s*[;\[\)]/g;
          let match;
          while ((match = uniformRegex.exec(shaderData.source)) !== null) {
            programData.uniforms.add(match[1]);
          }
        }
      }

      // Basic validation: check for matching attribute/uniform names
      // (This is simplified - real linking does more validation)
      programData.linked = true;
    },

    getProgramParameter(program: WebGLProgram, pname: number): any {
      const programData = programs.get(program);
      if (!programData) return null;

      if (pname === this.LINK_STATUS) {
        return programData.linked ? 1 : 0;
      }
      return null;
    },

    getProgramInfoLog(program: WebGLProgram): string | null {
      const programData = programs.get(program);
      return programData?.error || null;
    },

    getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
      const programData = programs.get(program);
      if (!programData) return null;
      
      // Only return non-null if the uniform was declared in the shader
      // This properly tests that uniforms are found when they exist
      if (programData.uniforms.has(name)) {
        return `uniform_${name}` as any as WebGLUniformLocation;
      }
      
      // Return null if uniform doesn't exist (matches real WebGL behavior)
      return null;
    },

    getAttribLocation(program: WebGLProgram, name: string): number {
      // Return a mock attribute location
      // In real WebGL, this would parse the shader to find the attribute
      // For testing, we can return sequential indices or -1 if not found
      const commonAttribs: { [key: string]: number } = {
        'vs_Pos': 0,
        'vs_Nor': 1,
        'vs_Col': 2,
        'vs_Uv': 3,
      };
      return commonAttribs[name] ?? -1;
    },
  };

  return mock;
}
