/**
 * Noise generation utilities for terrain generation.
 * Includes Perlin and Simplex noise implementations.
 * Based on the THREE.Terrain noise module.
 */

class Grad {
    constructor(public x: number, public y: number, public z: number) {}

    dot2(x: number, y: number): number {
        return this.x * x + this.y * y;
    }

    dot3(x: number, y: number, z: number): number {
        return this.x * x + this.y * y + this.z * z;
    }
}

const grad3 = [
    new Grad(1, 1, 0), new Grad(-1, 1, 0), new Grad(1, -1, 0), new Grad(-1, -1, 0),
    new Grad(1, 0, 1), new Grad(-1, 0, 1), new Grad(1, 0, -1), new Grad(-1, 0, -1),
    new Grad(0, 1, 1), new Grad(0, -1, 1), new Grad(0, 1, -1), new Grad(0, -1, -1)
];

const p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103,
    30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94,
    252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171,
    168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
    1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159,
    86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147,
    118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183,
    170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129,
    22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
    251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239,
    107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4,
    150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
    61, 156, 180
];

// Skewing and unskewing factors for 2D
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return (1 - t) * a + t * b;
}

/**
 * Noise generator class with seeding support.
 */
export class NoiseGenerator {
    private perm: number[] = new Array(512);
    private gradP: Grad[] = new Array(512);

    constructor(seed?: number) {
        this.seed(seed ?? Math.random());
    }

    /**
     * Seed the noise generator.
     * Supports 2^16 different seed values.
     */
    seed(seed: number): void {
        if (seed > 0 && seed < 1) {
            seed *= 65536;
        }

        seed = Math.floor(seed);
        if (seed < 256) {
            seed |= seed << 8;
        }

        for (let i = 0; i < 256; i++) {
            let v: number;
            if (i & 1) {
                v = p[i] ^ (seed & 255);
            } else {
                v = p[i] ^ ((seed >> 8) & 255);
            }

            this.perm[i] = this.perm[i + 256] = v;
            this.gradP[i] = this.gradP[i + 256] = grad3[v % 12];
        }
    }

    /**
     * 2D Simplex noise.
     * @returns Value in range [-1, 1]
     */
    simplex(xin: number, yin: number): number {
        let n0: number, n1: number, n2: number;

        // Skew the input space
        const s = (xin + yin) * F2;
        let i = Math.floor(xin + s);
        let j = Math.floor(yin + s);

        const t = (i + j) * G2;
        const x0 = xin - i + t;
        const y0 = yin - j + t;

        // Determine which simplex we're in
        let i1: number, j1: number;
        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        } else {
            i1 = 0;
            j1 = 1;
        }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        // Hash coordinates
        i &= 255;
        j &= 255;
        const gi0 = this.gradP[i + this.perm[j]];
        const gi1 = this.gradP[i + i1 + this.perm[j + j1]];
        const gi2 = this.gradP[i + 1 + this.perm[j + 1]];

        // Calculate contributions from corners
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) {
            n0 = 0;
        } else {
            t0 *= t0;
            n0 = t0 * t0 * gi0.dot2(x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) {
            n1 = 0;
        } else {
            t1 *= t1;
            n1 = t1 * t1 * gi1.dot2(x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) {
            n2 = 0;
        } else {
            t2 *= t2;
            n2 = t2 * t2 * gi2.dot2(x2, y2);
        }

        // Scale to [-1, 1]
        return 70 * (n0 + n1 + n2);
    }

    /**
     * 2D Perlin noise.
     * @returns Value in range approximately [-1, 1]
     */
    perlin(x: number, y: number): number {
        // Find unit grid cell
        let X = Math.floor(x);
        let Y = Math.floor(y);

        // Get relative xy coordinates within cell
        x = x - X;
        y = y - Y;

        // Wrap at 255
        X = X & 255;
        Y = Y & 255;

        // Calculate noise contributions from each corner
        const n00 = this.gradP[X + this.perm[Y]].dot2(x, y);
        const n01 = this.gradP[X + this.perm[Y + 1]].dot2(x, y - 1);
        const n10 = this.gradP[X + 1 + this.perm[Y]].dot2(x - 1, y);
        const n11 = this.gradP[X + 1 + this.perm[Y + 1]].dot2(x - 1, y - 1);

        // Compute fade curve
        const u = fade(x);

        // Interpolate
        return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(y));
    }

    /**
     * Fractional Brownian Motion using Perlin noise.
     * @param x X coordinate
     * @param y Y coordinate
     * @param octaves Number of octaves (default 8)
     * @param persistence Amplitude multiplier per octave (default 0.5)
     * @param lacunarity Frequency multiplier per octave (default 2.0)
     * @returns Value in range approximately [-1, 1]
     */
    fbm(x: number, y: number, octaves: number = 8, persistence: number = 0.5, lacunarity: number = 2.0): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.perlin(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * Ridged multifractal noise.
     * @returns Value in range [0, 1]
     */
    ridged(x: number, y: number, octaves: number = 8, persistence: number = 0.5, lacunarity: number = 2.0): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            const signal = 1 - Math.abs(this.perlin(x * frequency, y * frequency));
            total += signal * signal * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * Billow noise (absolute value of Perlin).
     * @returns Value in range [0, 1]
     */
    billow(x: number, y: number, octaves: number = 8, persistence: number = 0.5, lacunarity: number = 2.0): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += Math.abs(this.perlin(x * frequency, y * frequency)) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * Turbulence noise.
     */
    turbulence(x: number, y: number, octaves: number = 8, persistence: number = 0.5, lacunarity: number = 2.0): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += Math.abs(this.perlin(x * frequency, y * frequency)) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return (2 * total / maxValue) - 1;
    }
}

/**
 * Global noise generator instance (can be reseeded).
 */
export const noise = new NoiseGenerator();
