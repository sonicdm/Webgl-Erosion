import { add, clamp, dot, float, floor, fract, mix, mul, smoothstep, sub, vec2, vec3 } from 'three/tsl';
import type { BiomeWeights } from './TerrainPaletteNode';

export interface TerrainDetailUniforms {
    /** Overall color modulation strength (0-2, default 1.0) */
    intensity: any;
    /** Surface bump/normal perturbation strength (0-2, default 0.5) */
    normalStrength: any;
    /** Roughness micro-variation amount (0-1, default 0.5) */
    roughnessVar: any;
    /** Frequency multiplier for noise scales (0.1-4, default 1.0) */
    scale: any;
}

export interface TerrainDetailResult {
    /** Float multiplier for albedo (~0.85-1.15 at default intensity) */
    colorModulation: any;
    /** vec3 tangent-space normal perturbation */
    detailNormal: any;
    /** Float offset for roughness (±0.02-0.08 depending on biome) */
    roughnessVariation: any;
}

/**
 * Algebraic hash (Dave Hoskins) — WebGPU-safe, no sin().
 * hash21: vec2 → float in [0, 1]
 */
function hash21(p: any): any {
    // p3 = fract(vec3(p.x, p.y, p.x) * 0.1031)
    const px = p.x.mul(float(0.1031));
    const py = p.y.mul(float(0.1030));
    const pz = p.x.mul(float(0.0973));
    let p3x = fract(px);
    let p3y = fract(py);
    let p3z = fract(pz);
    // p3 += dot(p3, p3.yzx + 33.33)
    const d = dot(vec3(p3x, p3y, p3z), vec3(p3y.add(33.33), p3z.add(33.33), p3x.add(33.33)));
    p3x = p3x.add(d);
    p3y = p3y.add(d);
    p3z = p3z.add(d);
    // return fract((p3.x + p3.y) * p3.z)
    return fract(p3x.add(p3y).mul(p3z));
}

/**
 * Value noise with bilinear interpolation and smoothstep for C1 continuity.
 * Returns float in [0, 1].
 */
function valueNoise(p: any): any {
    const i = floor(p);
    const f = fract(p);

    // Hash at 4 integer corners
    const h00 = hash21(i);
    const h10 = hash21(i.add(vec2(1, 0)));
    const h01 = hash21(i.add(vec2(0, 1)));
    const h11 = hash21(i.add(vec2(1, 1)));

    // Smoothstep interpolation
    const u = smoothstep(float(0), float(1), f.x);
    const v = smoothstep(float(0), float(1), f.y);

    return mix(mix(h00, h10, u), mix(h01, h11, u), v);
}

/**
 * 3-octave FBM (Fractal Brownian Motion).
 * Scales: 25×, 80×, 250× (lacunarity ~3.2, gain 0.45).
 * Returns float centered around 0 (range roughly -0.5 to +0.5).
 */
function fbm3(uvCoord: any, scaleMul: any): any {
    const scale1 = float(25).mul(scaleMul);
    const scale2 = float(80).mul(scaleMul);
    const scale3 = float(250).mul(scaleMul);

    const n1 = valueNoise(uvCoord.mul(scale1));           // amplitude 1.0
    const n2 = valueNoise(uvCoord.mul(scale2));            // amplitude 0.45
    const n3 = valueNoise(uvCoord.mul(scale3));            // amplitude 0.2025

    // Weighted sum, then center around 0
    // Total weight = 1.0 + 0.45 + 0.2025 = 1.6525
    const sum = n1.add(n2.mul(0.45)).add(n3.mul(0.2025));
    return sum.div(float(1.6525)).sub(float(0.5)); // [-0.5, +0.5]
}

/**
 * Create procedural terrain detail nodes for color modulation,
 * detail normal perturbation, and roughness variation.
 *
 * All outputs are scaled by the uniform parameters, allowing
 * real-time adjustment via GUI sliders.
 */
export function createTerrainDetailNode(
    uvCoord: any,
    biomeWeights: BiomeWeights,
    uniforms: TerrainDetailUniforms,
): TerrainDetailResult {
    const scaleMul = uniforms.scale;

    // --- Per-biome intensity weights ---
    // Rock: 1.0, Sand: 0.6, Grass: 0.3, Snow: 0.15
    const biomeIntensity = clamp(
        biomeWeights.rock.mul(1.0)
            .add(biomeWeights.sand.mul(0.6))
            .add(biomeWeights.grass.mul(0.3))
            .add(biomeWeights.snow.mul(0.15)),
        0, 1,
    );

    // --- FBM for color modulation ---
    const fbmVal = fbm3(uvCoord, scaleMul);

    // Color modulation: map fbm [-0.5, 0.5] → [1 - amp, 1 + amp]
    // where amp = 0.15 * intensity * biomeIntensity
    const colorAmp = float(0.15).mul(uniforms.intensity).mul(biomeIntensity);
    const colorModulation = float(1).add(fbmVal.mul(colorAmp).mul(2));

    // --- Detail normals via finite differences ---
    // Use raw FBM difference as gradient signal (no division by eps).
    // FBM is in [-0.5, 0.5], so differences are bounded to [-1, 1] naturally.
    const eps = float(0.003).div(scaleMul.max(float(0.1)));
    const fbmR = fbm3(uvCoord.add(vec2(eps, 0)), scaleMul);
    const fbmL = fbm3(uvCoord.sub(vec2(eps, 0)), scaleMul);
    const fbmU = fbm3(uvCoord.add(vec2(0, eps)), scaleMul);
    const fbmD = fbm3(uvCoord.sub(vec2(0, eps)), scaleMul);

    const gradX = fbmR.sub(fbmL); // [-1, 1]
    const gradY = fbmU.sub(fbmD); // [-1, 1]

    // Tangent-space normal perturbation
    // normalStrength directly controls perturbation magnitude (bounded, no artifacts)
    const nStr = uniforms.normalStrength.mul(biomeIntensity);
    const detailNormal = vec3(
        gradX.mul(nStr).negate(),
        float(1),
        gradY.mul(nStr).negate(),
    );

    // --- Roughness micro-variation ---
    // Per-biome roughness variation amounts:
    // Rock: ±0.08, Sand: ±0.05, Grass: ±0.03, Snow: ±0.02
    const roughnessAmp = clamp(
        biomeWeights.rock.mul(0.08)
            .add(biomeWeights.sand.mul(0.05))
            .add(biomeWeights.grass.mul(0.03))
            .add(biomeWeights.snow.mul(0.02)),
        0, 0.1,
    );
    const roughnessVariation = fbmVal.mul(roughnessAmp).mul(uniforms.roughnessVar).mul(2);

    return {
        colorModulation,
        detailNormal,
        roughnessVariation,
    };
}
