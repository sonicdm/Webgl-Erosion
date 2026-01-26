/**
 * HeightmapFreshness — cadence and timestamps for upload/readback (Workstream H).
 * Avoids races between CPU readback and VTF uploads; surfaces when uploads are
 * too frequent or never happen.
 *
 * - shouldUpload(frameCount): true when frameCount % cadenceFrames === 0
 * - recordUpload() / recordReadback(): update timestamps
 * - logIfStale(now, thresholdMs): warn if lastUpload is too old or never set
 * - logIfTooFrequent(now, minIntervalMs): warn if uploads happen more often than minIntervalMs
 */

export interface HeightmapFreshnessOptions {
  cadenceFrames?: number;
  getNow?: () => number;
}

export class HeightmapFreshness {
  private cadenceFrames: number;
  private lastUploadTimestamp: number = 0;
  private lastReadbackTimestamp: number = 0;
  private lastUploadNow: number = 0;
  private getNow: () => number;

  constructor(options: HeightmapFreshnessOptions = {}) {
    this.cadenceFrames = options.cadenceFrames ?? 1;
    this.getNow = options.getNow ?? (() => Date.now());
  }

  shouldUpload(frameCount: number): boolean {
    return this.cadenceFrames <= 0 || frameCount % this.cadenceFrames === 0;
  }

  recordUpload(): void {
    const now = this.getNow();
    this.lastUploadTimestamp = now;
    this.lastUploadNow = now;
  }

  recordReadback(): void {
    this.lastReadbackTimestamp = this.getNow();
  }

  logIfStale(now: number, thresholdMs: number): void {
    if (this.lastUploadTimestamp === 0) {
      console.warn('[HeightmapFreshness] lastUpload never set; upload may not have run');
      return;
    }
    const age = now - this.lastUploadTimestamp;
    if (age > thresholdMs) {
      console.warn(`[HeightmapFreshness] lastUpload ${age}ms ago (threshold ${thresholdMs}ms); may be stale`);
    }
  }

  logIfTooFrequent(now: number, minIntervalMs: number): void {
    if (this.lastUploadNow === 0) return;
    const elapsed = now - this.lastUploadNow;
    if (elapsed > 0 && elapsed < minIntervalMs) {
      console.warn(`[HeightmapFreshness] uploads too frequent (${elapsed}ms < ${minIntervalMs}ms)`);
    }
  }
}
