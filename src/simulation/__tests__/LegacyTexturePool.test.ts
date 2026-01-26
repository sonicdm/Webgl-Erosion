import { LegacyTexturePool } from '../LegacyTexturePool';

/**
 * Minimal WebGL2 mock for LegacyTexturePool.setup and resizeTextures4Simulation.
 * Implements only the GL calls used by the pool; all create* return dummy objects.
 */
function createPoolGlMock(): WebGL2RenderingContext {
  const noop = () => {};
  const create = () => ({} as any);
  return {
    createTexture: () => create(),
    createFramebuffer: () => create(),
    createRenderbuffer: () => create(),
    bindTexture: noop,
    texImage2D: noop,
    texParameteri: noop,
    bindRenderbuffer: noop,
    renderbufferStorage: noop,
    bindFramebuffer: noop,
    TEXTURE_2D: 0x0de1,
    RGBA32F: 0x8814,
    RGBA: 0x1908,
    FLOAT: 0x1406,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RENDERBUFFER: 0x8d41,
    DEPTH_COMPONENT16: 0x81a5,
    FRAMEBUFFER: 0x8d40,
  } as unknown as WebGL2RenderingContext;
}

describe('LegacyTexturePool', () => {
  const simres = 64;
  const shadowMapRes = 256;

  it('instantiates with WebGL2 mock, setup creates non-null handles', () => {
    const gl = createPoolGlMock();
    const pool = new LegacyTexturePool(gl, simres, shadowMapRes);

    expect(pool.getReadTerrainTex()).toBeTruthy();
    expect(pool.getWriteTerrainTex()).toBeTruthy();
    expect(pool.getFrameBuffer()).toBeTruthy();
    expect(pool.getRenderBuffer()).toBeTruthy();
    expect(pool.getShadowMapResolution()).toBe(shadowMapRes);
    expect(pool.simres).toBe(simres);
  });

  it('resizeTextures4Simulation does not throw', () => {
    const gl = createPoolGlMock();
    const pool = new LegacyTexturePool(gl, simres, shadowMapRes);

    expect(() => pool.resizeTextures4Simulation(128)).not.toThrow();
    expect(pool.simres).toBe(128);
  });

  it('resizeTextures4Simulation with no arg keeps simres', () => {
    const gl = createPoolGlMock();
    const pool = new LegacyTexturePool(gl, simres, shadowMapRes);

    pool.resizeTextures4Simulation();
    expect(pool.simres).toBe(simres);
  });
});
