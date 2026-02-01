/**
 * Rate-limited logger with categories for the lava simulation subsystem.
 * Prevents console flooding by throttling repeated messages.
 */

export enum LogCategory {
    LAVA_SIM = 'LAVA_SIM',
    LAVA_RENDER = 'LAVA_RENDER',
    LAVA_WATER = 'LAVA_WATER',
    LAVA_TERRAIN = 'LAVA_TERRAIN',
    WEBGPU = 'WEBGPU',
}

export type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
    lastTime: number;
    skippedCount: number;
}

class RateLimitedLogger {
    private intervalMs: number;
    private entries = new Map<string, LogEntry>();
    private enabledCategories = new Set<LogCategory>(Object.values(LogCategory));
    private _verbose = false;

    constructor(intervalMs: number = 2000) {
        this.intervalMs = intervalMs;
    }

    get verbose(): boolean { return this._verbose; }
    set verbose(v: boolean) { this._verbose = v; }

    private shouldLog(fullKey: string): { allowed: boolean; skipped: number } {
        const now = performance.now();
        const entry = this.entries.get(fullKey);

        if (entry && (now - entry.lastTime) < this.intervalMs) {
            entry.skippedCount++;
            return { allowed: false, skipped: 0 };
        }

        const skipped = entry ? entry.skippedCount : 0;
        this.entries.set(fullKey, { lastTime: now, skippedCount: 0 });
        return { allowed: true, skipped };
    }

    private format(category: LogCategory, skipped: number, args: any[]): any[] {
        const prefix = `[${category}]`;
        const skipMsg = skipped > 0 ? ` (+${skipped} skipped)` : '';
        return [`${prefix}${skipMsg}`, ...args];
    }

    log(category: LogCategory, key: string, ...args: any[]): void {
        if (!this.enabledCategories.has(category)) return;
        const { allowed, skipped } = this.shouldLog(`${category}:${key}`);
        if (!allowed) return;
        console.log(...this.format(category, skipped, args));
    }

    warn(category: LogCategory, key: string, ...args: any[]): void {
        if (!this.enabledCategories.has(category)) return;
        const { allowed, skipped } = this.shouldLog(`${category}:warn:${key}`);
        if (!allowed) return;
        console.warn(...this.format(category, skipped, args));
    }

    error(category: LogCategory, key: string, ...args: any[]): void {
        // Errors always log (no category filter), but still rate-limited
        const { allowed, skipped } = this.shouldLog(`${category}:error:${key}`);
        if (!allowed) return;
        console.error(...this.format(category, skipped, args));
    }

    /** Log a named numeric probe value (rate-limited). */
    probe(category: LogCategory, name: string, value: number): void {
        if (!this._verbose) return;
        this.log(category, `probe:${name}`, `${name}=${value.toFixed(6)}`);
    }

    /** Log min/max pair for a named value. */
    probeRange(category: LogCategory, name: string, min: number, max: number): void {
        if (!this._verbose) return;
        this.log(category, `range:${name}`, `${name} min=${min.toFixed(6)} max=${max.toFixed(6)}`);
    }

    enable(category: LogCategory): void {
        this.enabledCategories.add(category);
    }

    disable(category: LogCategory): void {
        this.enabledCategories.delete(category);
    }

    enableAll(): void {
        for (const cat of Object.values(LogCategory)) {
            this.enabledCategories.add(cat);
        }
    }

    disableAll(): void {
        this.enabledCategories.clear();
    }
}

/** Singleton logger instance for the lava subsystem. */
export const lavaLogger = new RateLimitedLogger(2000);
