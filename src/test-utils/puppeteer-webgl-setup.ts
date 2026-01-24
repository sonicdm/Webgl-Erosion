/**
 * Puppeteer-based WebGL2 testing setup
 * 
 * Provides real WebGL2 context in headless Chrome for full shader compilation
 * and rendering tests. Use this for integration tests that need actual GPU execution.
 * 
 * Alternative: Consider using glcheck (https://github.com/tsherif/glcheck)
 * which is a WebGL-focused testing framework built on Puppeteer.
 * 
 * Usage:
 *   import { createWebGL2Context } from './test-utils/puppeteer-webgl-setup';
 *   const { gl, page, browser } = await createWebGL2Context(512, 512);
 *   // ... run tests ...
 *   await browser.close();
 */

import puppeteer, { Browser, Page } from 'puppeteer';

export interface WebGL2TestContext {
  gl: WebGL2RenderingContext;
  page: Page;
  browser: Browser;
  canvas: HTMLCanvasElement;
}

/**
 * Creates a real WebGL2 context in headless Chrome via Puppeteer
 * 
 * @param width - Canvas width (default: 512)
 * @param height - Canvas height (default: 512)
 * @returns WebGL2 context, page, and browser instances
 */
export async function createWebGL2Context(
  width: number = 512,
  height: number = 512
): Promise<WebGL2TestContext> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for CI
  });

  const page = await browser.newPage();

  // Inject WebGL2 context creation code
  const gl = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported in test environment');
    }

    // Store canvas and context in window for access
    (window as any).__testCanvas = canvas;
    (window as any).__testGL = gl;

    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      webgl2Supported: !!gl,
    };
  }, { width, height });

  if (!gl.webgl2Supported) {
    await browser.close();
    throw new Error('WebGL2 not supported in Puppeteer environment');
  }

  // Get the actual GL context (we need to use evaluateHandle for objects)
  const canvasHandle = await page.evaluateHandle(() => (window as any).__testCanvas);
  const glHandle = await page.evaluateHandle(() => (window as any).__testGL);

  return {
    gl: glHandle as any, // Type assertion - actual context is in browser
    page,
    browser,
    canvas: canvasHandle as any,
  };
}

/**
 * Reads pixels from WebGL framebuffer in Puppeteer context
 * 
 * @param page - Puppeteer page
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param width - Width of region to read
 * @param height - Height of region to read
 * @returns Pixel data as Uint8Array
 */
export async function readPixels(
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Uint8Array> {
  return await page.evaluate(({ x, y, width, height }) => {
    const gl = (window as any).__testGL as WebGL2RenderingContext;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels); // Convert to plain array for serialization
  }, { x, y, width, height }).then(arr => new Uint8Array(arr));
}
