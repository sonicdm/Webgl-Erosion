# WebGL and Shader Testing Guide

## Overview

This guide covers strategies for automated testing of WebGL2 shaders and rendering code in a Jest environment.

## Challenges

1. **WebGL2 Support**: `headless-gl` only supports WebGL1, but our codebase requires WebGL2
2. **GPU Context**: Jest runs in Node.js, which doesn't have native GPU support
3. **Shader Compilation**: Shaders need a WebGL context to compile, but we can test compilation separately
4. **Rendering Output**: Testing actual rendering requires reading back from GPU buffers

## Testing Strategies

### 1. Shader Compilation Testing (Unit Tests)

Test that shaders compile without errors. This can be done with a mock WebGL2 context.

**Approach**: Create a minimal WebGL2 mock that implements only the methods needed for shader compilation.

### 2. Shader Syntax Validation (Static Analysis)

Test shader source code for common errors before runtime.

**Approach**: Parse shader source and validate:
- Uniform/attribute declarations
- Variable usage
- Syntax errors

### 3. Browser-Based Testing (Integration Tests)

Use Puppeteer to run tests in a real browser with WebGL2 support.

**Approach**: 
- Launch headless Chrome via Puppeteer
- Load test page with WebGL2 context
- Execute shaders and read back results
- Compare against expected outputs

### 4. Mock-Based Testing (Fast Unit Tests)

Mock WebGL calls to test shader program logic without actual GPU execution.

**Approach**: Mock `gl.createShader`, `gl.compileShader`, etc. to test:
- Shader program creation
- Uniform/attribute location retrieval
- State management

## Implementation

### Option A: WebGL2 Mock for Compilation Tests

Create a minimal WebGL2 mock that supports shader compilation:

```typescript
// src/test-utils/webgl2-mock.ts
export function createWebGL2Mock(): WebGL2RenderingContext {
  // Minimal mock that supports shader compilation
  // Returns mock context with compileShader, createShader, etc.
}
```

### Option B: Puppeteer for Browser Testing

Set up Puppeteer for real WebGL2 testing:

```typescript
// src/test-utils/browser-test-setup.ts
import puppeteer from 'puppeteer';

export async function createWebGL2Context(): Promise<WebGL2RenderingContext> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // Inject WebGL2 context creation code
  // Return context handle
}
```

### Option C: Shader Source Validation

Test shader source code statically:

```typescript
// src/rendering/__tests__/shader-validation.test.ts
describe('Shader Validation', () => {
  test('shader source has required uniforms', () => {
    // Parse shader source, check for uniform declarations
  });
});
```

## Recommended Approach for This Codebase

Given the complexity and WebGL2 requirement, we recommend a **hybrid approach**:

### 1. Shader Source Validation (Fast, Static) ✅ **IMPLEMENTED**
   - Validate shader syntax without WebGL
   - Check for required uniforms/attributes
   - Ensure consistency between shader pairs
   - **Status**: `shader-validation.test.ts` is ready (needs GLSL import fix)

### 2. headless-gl with WebGL2 Mocking (Fast, Unit Tests)
   - Use `headless-gl` (WebGL1) with WebGL2 method stubs
   - Works for ~99% of tests (logic, matrices, object positions)
   - **Limitation**: Shaders won't compile (headless-gl is WebGL1 only)
   - **Best for**: Testing ShaderProgram logic, uniform management, state
   - **Reference**: [three.js forum discussion](https://discourse.threejs.org/t/suggestions-for-unit-testing-with-headless-gl-and-webgl-2/66891)

### 3. Puppeteer for Full WebGL2 Testing (Slower, CI Only)
   - Use Puppeteer to run tests in real Chrome with WebGL2
   - Test actual shader compilation and rendering
   - Compare pixel outputs (golden images)
   - **Best for**: Integration tests, visual regression tests
   - **Alternative**: Use `glcheck` framework (Puppeteer-based, WebGL-focused)

### 4. Mock-Based Logic Tests (Fast, Unit Tests)
   - Test ShaderProgram class logic without GPU
   - Test uniform setting/getting
   - Test state management

## Example Test Structure

```
src/rendering/
  __tests__/
    shader-compilation.test.ts    # Compilation tests with mock
    shader-validation.test.ts      # Source code validation
    shader-program.test.ts         # ShaderProgram class tests
    browser/
      rendering.test.ts            # Puppeteer-based rendering tests
```

## Implementation Examples

### Option 1: headless-gl with WebGL2 Stubs (Recommended for Unit Tests)

Install headless-gl:
```bash
npm install --save-dev gl
```

Use in tests:
```typescript
import { setupHeadlessGL } from '../test-utils/headless-gl-setup';

describe('ShaderProgram Logic', () => {
  let gl: WebGLRenderingContext;

  beforeEach(() => {
    gl = setupHeadlessGL(512, 512)!;
    setGL(gl as any);
  });

  test('should create shader program', () => {
    // Test ShaderProgram creation logic
    // Note: Shaders won't actually compile, but program structure can be tested
  });
});
```

**Pros:**
- Fast (runs in Node.js)
- Works for ~99% of logic tests
- No browser overhead

**Cons:**
- Shaders won't compile (headless-gl is WebGL1)
- Can't test actual rendering output
- Requires stubbing WebGL2 methods

### Option 2: Puppeteer for Full WebGL2 Testing (Integration Tests)

Install Puppeteer:
```bash
npm install --save-dev puppeteer @types/puppeteer
```

Use in tests:
```typescript
import { createWebGL2Context, readPixels } from '../test-utils/puppeteer-webgl-setup';

describe('Shader Compilation (Puppeteer)', () => {
  let context: WebGL2TestContext;

  beforeAll(async () => {
    context = await createWebGL2Context(512, 512);
  });

  afterAll(async () => {
    await context.browser.close();
  });

  test('should compile shader', async () => {
    const compiled = await context.page.evaluate(() => {
      const gl = (window as any).__testGL as WebGL2RenderingContext;
      const shader = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(shader, '#version 300 es\nvoid main() {}');
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    });
    expect(compiled).toBe(true);
  });
});
```

**Pros:**
- Real WebGL2 support
- Shaders actually compile
- Can test rendering output
- Can read pixels and compare

**Cons:**
- Slower (requires browser launch)
- More complex setup
- Best for CI/integration tests

### Option 3: glcheck Framework (Alternative)

Install glcheck:
```bash
npm install --save-dev glcheck
```

Create `glcheck.config.json`:
```json
{
  "unitTests": ["src/**/*.test.js"],
  "renderTests": ["test/render/*.html"],
  "coverage": true
}
```

**Pros:**
- Purpose-built for WebGL testing
- Supports both WebGL1 and WebGL2
- Built-in pixel comparison
- Buffer testing utilities

**Cons:**
- Additional dependency
- Requires separate test structure
- Less flexible than direct Puppeteer

## Next Steps

1. ✅ Create WebGL2 mock utility (`webgl2-mock.ts`)
2. ✅ Add shader source validation (`shader-validation.test.ts`)
3. ⏳ Fix GLSL import transformer for Jest
4. ⏳ Add headless-gl setup utility (optional, for logic tests)
5. ⏳ Add Puppeteer setup utility (optional, for integration tests)
6. ⏳ Set up glcheck or direct Puppeteer tests (optional, CI only)
