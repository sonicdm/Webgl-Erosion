/**
 * Generates a multi-octave value noise texture for lava channeling.
 * Output: R32Float texture with values in [0.2, 2.3] range.
 * Scales: 12, 6, 3 cells — large corridors, medium features, fine detail.
 * Cubed by the shader to create extreme selectivity (0.008 to 12.2).
 */
export function generateNoiseTexture(device: GPUDevice, simres: number): GPUTexture {
    const data = new Float32Array(simres * simres * 4); // rgba32float

    // Seed a simple hash-based noise
    const seed1 = 12345.6789;
    const seed2 = 67890.1234;

    function hash(x: number, y: number, seed: number): number {
        const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
        return n - Math.floor(n);
    }

    function smoothNoise(x: number, y: number, seed: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        // Smoothstep
        const sx = fx * fx * (3.0 - 2.0 * fx);
        const sy = fy * fy * (3.0 - 2.0 * fy);

        const a = hash(ix, iy, seed);
        const b = hash(ix + 1, iy, seed);
        const c = hash(ix, iy + 1, seed);
        const d = hash(ix + 1, iy + 1, seed);

        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }

    // Multi-octave noise at scales 12, 6, 3 cells
    for (let y = 0; y < simres; y++) {
        for (let x = 0; x < simres; x++) {
            const u = x / simres;
            const v = y / simres;

            // Scale 12: large corridors
            const n1 = smoothNoise(u * simres / 12, v * simres / 12, seed1);
            // Scale 6: medium features
            const n2 = smoothNoise(u * simres / 6, v * simres / 6, seed1 + 100);
            // Scale 3: fine detail
            const n3 = smoothNoise(u * simres / 3, v * simres / 3, seed2);

            // Weighted combination: large features dominate
            const raw = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

            // Map [0, 1] → [0.2, 2.3]  (10x variation when cubed)
            const mapped = 0.2 + raw * 2.1;

            const idx = (y * simres + x) * 4;
            data[idx + 0] = mapped; // R
            data[idx + 1] = 0.0;    // G
            data[idx + 2] = 0.0;    // B
            data[idx + 3] = 0.0;    // A
        }
    }

    const texture = device.createTexture({
        size: [simres, simres, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING |
               GPUTextureUsage.STORAGE_BINDING |
               GPUTextureUsage.COPY_SRC |
               GPUTextureUsage.COPY_DST,
    });

    const bytesPerPixel = 16; // rgba32float = 4 * 4 bytes
    device.queue.writeTexture(
        { texture },
        data,
        { bytesPerRow: simres * bytesPerPixel, rowsPerImage: simres },
        { width: simres, height: simres, depthOrArrayLayers: 1 }
    );

    return texture;
}
