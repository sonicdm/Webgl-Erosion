/**
 * Headless GL setup for WebGL2 testing in Jest
 * 
 * Based on: https://discourse.threejs.org/t/suggestions-for-unit-testing-with-headless-gl-and-webgl-2/66891
 * 
 * This allows using headless-gl (WebGL1) with Three.js WebGL2 by stubbing
 * a few WebGL2-specific methods. Shaders won't compile, but this works for
 * ~99% of tests that don't require actual shader execution.
 * 
 * Usage:
 *   import { setupHeadlessGL } from './test-utils/headless-gl-setup';
 *   const gl = setupHeadlessGL(512, 512);
 */

// @ts-ignore - headless-gl types may not be available
let createGL: any;

try {
  // Try to import headless-gl (optional dependency)
  createGL = require('gl');
} catch (error) {
  // headless-gl not installed - tests using this will need to install it
  console.warn('headless-gl not installed. Install with: npm install --save-dev gl');
}

/**
 * Sets up a headless WebGL context with WebGL2 method stubs
 * 
 * @param width - Canvas width (default: 512)
 * @param height - Canvas height (default: 512)
 * @returns WebGL context (WebGL1 with WebGL2 stubs) or null if headless-gl not available
 */
export function setupHeadlessGL(width: number = 512, height: number = 512): WebGLRenderingContext | null {
  if (!createGL) {
    console.warn('headless-gl not available. Install with: npm install --save-dev gl');
    return null;
  }

  // Create headless WebGL1 context
  const gl = createGL(width, height);

  // Stub WebGL2 methods that Three.js might call
  // These are no-ops since headless-gl doesn't support WebGL2
  // But they prevent errors when Three.js tries to use them
  (gl as any).texImage3D = () => {};
  (gl as any).createVertexArray = () => {};
  (gl as any).bindVertexArray = () => {};
  (gl as any).deleteVertexArray = () => {};

  // Mock getContext to return our stubbed context
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: any) {
    if (contextId === 'webgl2') {
      // Return stubbed WebGL1 context as WebGL2
      // Note: Shaders won't compile, but this works for logic tests
      return gl as any;
    }
    // Allow other contexts (2d, etc.)
    return originalGetContext.call(this, contextId, options);
  };

  return gl as WebGLRenderingContext;
}

/**
 * Cleans up headless GL setup
 */
export function teardownHeadlessGL(): void {
  // Restore original getContext if needed
  // (In practice, this might not be necessary for Jest)
}
