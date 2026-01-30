/**
 * Single source of truth for heightmap encode/decode.
 * All heightmap IO (loader, import/export, readback) must use this contract.
 * No duplicate logic elsewhere.
 */

/** RGBA32F: 4 floats × 4 bytes per pixel */
export const BYTES_PER_PIXEL = 16;

/** Number of float components per pixel (R, G, B, A) */
export const CHANNELS_PER_PIXEL = 4;

/** Channel index for terrain height in RGBA buffer */
export const HEIGHT_CHANNEL = 0;

/** Channel index for water in RGBA buffer */
export const WATER_CHANNEL = 1;

/** Channel index for rock/sediment in RGBA buffer */
export const ROCK_CHANNEL = 2;

/** Channel index for alpha in RGBA buffer */
export const ALPHA_CHANNEL = 3;

/**
 * Default height scale used for import/export when matching legacy behavior.
 * Import: gray (0-1) * maxHeight -> height. Export: height / maxHeight * 255.
 */
export const DEFAULT_HEIGHT_SCALE_FACTOR = 120.0;

/**
 * Compute required Float32Array length for a given resolution.
 */
export function getBufferSize(simres: number): number {
    return simres * simres * CHANNELS_PER_PIXEL;
}

/**
 * Compute max height value used for grayscale<->height conversion (legacy convention).
 */
export function getMaxHeightForScale(terrainHeight: number, scaleFactor: number = DEFAULT_HEIGHT_SCALE_FACTOR): number {
    return terrainHeight * scaleFactor;
}

/**
 * Decode image data (RGBA 0-255) into heightmap Float32 buffer.
 * Uses grayscale (R*0.299 + G*0.587 + B*0.114) normalized to 0-1, then height = gray * maxHeight.
 * Writes into buffer starting at index 0; buffer must have length >= width * height * 4.
 */
export function decodeFromImageData(
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    maxHeight: number,
    buffer: Float32Array
): void {
    const n = width * height;
    if (buffer.length < n * CHANNELS_PER_PIXEL) {
        throw new Error(`HeightmapContract.decodeFromImageData: buffer length ${buffer.length} < ${n * CHANNELS_PER_PIXEL}`);
    }
    for (let i = 0; i < n; i++) {
        const r = imageData[i * 4];
        const g = imageData[i * 4 + 1];
        const b = imageData[i * 4 + 2];
        const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
        const height = gray * maxHeight;
        buffer[i * 4 + HEIGHT_CHANNEL] = height;
        buffer[i * 4 + WATER_CHANNEL] = 0.0;
        buffer[i * 4 + ROCK_CHANNEL] = 0.0;
        buffer[i * 4 + ALPHA_CHANNEL] = 1.0;
    }
}

/**
 * Encode heightmap Float32 buffer (R channel = height) to grayscale ImageData (0-255).
 * height -> gray = height / maxHeight, pixel = gray * 255.
 * imageData.data must have length >= width * height * 4.
 */
export function encodeToGrayscaleImageData(
    heightData: Float32Array,
    width: number,
    height: number,
    maxHeight: number,
    imageData: ImageData
): void {
    const n = width * height;
    if (heightData.length < n * CHANNELS_PER_PIXEL || imageData.data.length < n * 4) {
        throw new Error('HeightmapContract.encodeToGrayscaleImageData: buffer/imageData length mismatch');
    }
    for (let i = 0; i < n; i++) {
        const height = heightData[i * 4 + HEIGHT_CHANNEL];
        const gray = Math.max(0, Math.min(255, Math.round((height / maxHeight) * 255)));
        imageData.data[i * 4] = gray;
        imageData.data[i * 4 + 1] = gray;
        imageData.data[i * 4 + 2] = gray;
        imageData.data[i * 4 + 3] = 255;
    }
}

/**
 * Read height at pixel (i, j) from buffer. i, j in [0, simres).
 */
export function getHeightAt(buffer: Float32Array, simres: number, i: number, j: number): number {
    const idx = (j * simres + i) * CHANNELS_PER_PIXEL + HEIGHT_CHANNEL;
    return buffer[idx];
}
