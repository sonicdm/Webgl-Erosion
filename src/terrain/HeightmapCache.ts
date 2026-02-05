/**
 * Heightmap caching system for imported heightmaps.
 * Allows regenerating terrain from cached heightmap data without re-importing.
 */

import { TerrainOptions, Heightmap } from './types';

export interface CachedHeightmap {
    /** Original image data before any processing */
    originalData: Float32Array;
    /** Original width */
    originalWidth: number;
    /** Original height */
    originalHeight: number;
    /** Min height in original data */
    minHeight: number;
    /** Max height in original data */
    maxHeight: number;
    /** Source filename (for display) */
    filename?: string;
    /** Timestamp when loaded */
    loadedAt: number;
}

/**
 * Global heightmap cache for storing imported heightmaps.
 */
class HeightmapCacheManager {
    private cache: CachedHeightmap | null = null;

    /**
     * Store heightmap data from an image import.
     * @param imageData Raw image data (grayscale normalized 0-1)
     * @param width Image width
     * @param height Image height
     * @param filename Optional source filename
     */
    storeFromImage(
        imageData: Uint8ClampedArray,
        width: number,
        height: number,
        filename?: string
    ): void {
        const size = width * height;
        const data = new Float32Array(size);

        let min = Infinity;
        let max = -Infinity;

        // Convert RGBA image data to grayscale heights (0-1 range).
        // Flip X to match terrain UV orientation (imported heightmaps were mirrored).
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIndex = (y * width + x) * 4;
                const r = imageData[srcIndex];
                const g = imageData[srcIndex + 1];
                const b = imageData[srcIndex + 2];
                // Standard grayscale conversion
                const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
                const dstX = width - 1 - x;
                const dstIndex = y * width + dstX;
                data[dstIndex] = gray;

                if (gray < min) min = gray;
                if (gray > max) max = gray;
            }
        }

        this.cache = {
            originalData: data,
            originalWidth: width,
            originalHeight: height,
            minHeight: min,
            maxHeight: max,
            filename,
            loadedAt: Date.now()
        };

        console.log(`[HeightmapCache] Stored heightmap: ${width}x${height}, range: ${min.toFixed(3)}-${max.toFixed(3)}`);
    }

    /**
     * Store raw heightmap data directly.
     * @param data Normalized height data (0-1 range)
     * @param width Data width
     * @param height Data height
     */
    storeRaw(data: Float32Array, width: number, height: number, filename?: string): void {
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < data.length; i++) {
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }

        this.cache = {
            originalData: new Float32Array(data),
            originalWidth: width,
            originalHeight: height,
            minHeight: min,
            maxHeight: max,
            filename,
            loadedAt: Date.now()
        };
    }

    /**
     * Get cached heightmap scaled to target resolution.
     * Uses bilinear interpolation for scaling.
     * @param targetWidth Target width
     * @param targetHeight Target height
     * @param heightScale Height multiplier
     * @returns Scaled heightmap or null if no cache
     */
    getScaled(targetWidth: number, targetHeight: number, heightScale: number = 1.0): Float32Array | null {
        if (!this.cache) return null;

        const { originalData, originalWidth, originalHeight } = this.cache;
        const result = new Float32Array(targetWidth * targetHeight);

        // Bilinear interpolation scaling
        for (let ty = 0; ty < targetHeight; ty++) {
            for (let tx = 0; tx < targetWidth; tx++) {
                // Map target coordinates to source coordinates
                const sx = (tx / (targetWidth - 1)) * (originalWidth - 1);
                const sy = (ty / (targetHeight - 1)) * (originalHeight - 1);

                // Get integer and fractional parts
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(x0 + 1, originalWidth - 1);
                const y1 = Math.min(y0 + 1, originalHeight - 1);
                const fx = sx - x0;
                const fy = sy - y0;

                // Bilinear interpolation
                const v00 = originalData[y0 * originalWidth + x0];
                const v10 = originalData[y0 * originalWidth + x1];
                const v01 = originalData[y1 * originalWidth + x0];
                const v11 = originalData[y1 * originalWidth + x1];

                const v0 = v00 * (1 - fx) + v10 * fx;
                const v1 = v01 * (1 - fx) + v11 * fx;
                const value = v0 * (1 - fy) + v1 * fy;

                result[ty * targetWidth + tx] = value * heightScale;
            }
        }

        return result;
    }

    /**
     * Apply cached heightmap to a terrain heightmap array.
     * @param heightmap Target heightmap to modify
     * @param options Terrain options
     * @param heightScale Height multiplier
     */
    applyToHeightmap(heightmap: Heightmap, options: TerrainOptions, heightScale: number = 1.0): boolean {
        if (!this.cache) return false;

        const targetWidth = options.xSegments + 1;
        const targetHeight = options.ySegments + 1;
        const range = options.maxHeight - options.minHeight;

        const scaled = this.getScaled(targetWidth, targetHeight, 1.0);
        if (!scaled) return false;

        // Apply scaled data to heightmap
        for (let i = 0; i < scaled.length; i++) {
            // Map 0-1 to height range
            heightmap[i] = options.minHeight + scaled[i] * range * heightScale;
        }

        return true;
    }

    /**
     * Check if there's a cached heightmap.
     */
    hasCache(): boolean {
        return this.cache !== null;
    }

    /**
     * Get cache info for display.
     */
    getCacheInfo(): { filename?: string; width: number; height: number; loadedAt: number } | null {
        if (!this.cache) return null;
        return {
            filename: this.cache.filename,
            width: this.cache.originalWidth,
            height: this.cache.originalHeight,
            loadedAt: this.cache.loadedAt
        };
    }

    /**
     * Clear the cache.
     */
    clear(): void {
        this.cache = null;
        console.log('[HeightmapCache] Cache cleared');
    }
}

/**
 * Global heightmap cache instance.
 */
export const heightmapCache = new HeightmapCacheManager();
