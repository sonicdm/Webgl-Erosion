/**
 * HeightmapFreshness unit tests (Workstream H).
 */

import { HeightmapFreshness } from '../HeightmapFreshness';

describe('HeightmapFreshness', () => {
  it('shouldUpload returns true when frameCount % cadenceFrames === 0', () => {
    const f = new HeightmapFreshness({ cadenceFrames: 1 });
    expect(f.shouldUpload(0)).toBe(true);
    expect(f.shouldUpload(1)).toBe(true);
  });

  it('shouldUpload returns true only at cadence when cadenceFrames is 2', () => {
    const f = new HeightmapFreshness({ cadenceFrames: 2 });
    expect(f.shouldUpload(0)).toBe(true);
    expect(f.shouldUpload(1)).toBe(false);
    expect(f.shouldUpload(2)).toBe(true);
    expect(f.shouldUpload(3)).toBe(false);
  });

  it('recordUpload and recordReadback update internal state', () => {
    let now = 1000;
    const f = new HeightmapFreshness({ getNow: () => now });
    f.recordUpload();
    f.recordReadback();
    now = 2000;
    f.recordUpload();
    // No getters; we verify via logIfStale / logIfTooFrequent
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    f.logIfStale(2000, 500);
    expect(warn).not.toHaveBeenCalled();
    f.logIfStale(3000, 500);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stale'));
    warn.mockRestore();
  });

  it('logIfStale warns when lastUpload never set', () => {
    const f = new HeightmapFreshness();
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    f.logIfStale(Date.now(), 1000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('never set'));
    warn.mockRestore();
  });

  it('logIfStale does not warn when within threshold', () => {
    let now = 1000;
    const f = new HeightmapFreshness({ getNow: () => now });
    f.recordUpload();
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    f.logIfStale(1100, 500);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logIfTooFrequent warns when elapsed < minIntervalMs', () => {
    let now = 1000;
    const f = new HeightmapFreshness({ getNow: () => now });
    f.recordUpload();
    now = 1050;
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    f.logIfTooFrequent(1050, 200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('too frequent'));
    warn.mockRestore();
  });

  it('logIfTooFrequent does not warn when elapsed >= minIntervalMs', () => {
    let now = 1000;
    const f = new HeightmapFreshness({ getNow: () => now });
    f.recordUpload();
    now = 1500;
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    f.logIfTooFrequent(1500, 200);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
