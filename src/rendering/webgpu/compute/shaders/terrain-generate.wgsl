// Terrain generation compute shader
// Ports all terrain generation from GLSL to WGSL with extended generator types

@group(0) @binding(0) var writeTerrainA: texture_storage_2d<rgba32float, write>;
@group(0) @binding(1) var writeTerrainB: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uniforms: TerrainGeneratorUniforms;
@group(0) @binding(3) var heightmapTexture: texture_2d<f32>;

struct TerrainGeneratorUniforms {
    // Basic parameters
    resolution: f32,
    terrainScale: f32,
    terrainHeight: f32,
    generatorType: i32,

    // Mask parameters
    maskType: i32,
    maskStrength: f32,
    maskCenterX: f32,
    maskCenterY: f32,

    // Noise parameters
    frequency: f32,
    amplitude: f32,
    octaves: i32,
    lacunarity: f32,

    persistence: f32,
    seed: f32,
    offsetX: f32,
    offsetY: f32,

    // Generator-specific parameters
    ridgeOffset: f32,
    ridgeGain: f32,
    terraceCount: f32,
    domainWarpStrength: f32,

    // Additional parameters
    erosionStrength: f32,
    smoothness: f32,
    duneDirectionX: f32,
    duneDirectionY: f32,

    craterDensity: f32,
    canyonDepth: f32,
    voronoiRandomness: f32,
    useHeightmap: i32,

    // Heightmap parameters
    heightmapAmplitude: f32,
    heightmapInvert: i32,
    padding1: f32,
    padding2: f32,
};

// ============================================================================
// Hash and random functions
// ============================================================================

fn hash11(p: f32) -> f32 {
    var q = fract(p * 0.1031);
    q = q * (q + 33.33);
    q = q * (q + q);
    return fract(q);
}

fn hash21(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
    var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

fn hash31(p: vec3f) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 = p3 + dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash33(p: vec2f) -> vec3f {
    let q = vec3f(
        dot(p, vec2f(127.1, 311.7)),
        dot(p, vec2f(269.5, 183.3)),
        dot(p, vec2f(419.2, 371.9))
    );
    return fract(sin(q) * 43758.5453);
}

fn random2(st: vec2f) -> vec2f {
    let s = vec2f(
        dot(st, vec2f(127.1, 311.7)),
        dot(st, vec2f(269.5, 183.3))
    );
    return -1.0 + 2.0 * fract(sin(s) * 43758.5453123);
}

// ============================================================================
// Noise functions
// ============================================================================

// Value noise
fn valueNoise(st: vec2f) -> f32 {
    let i = floor(st);
    let f = fract(st);

    let a = hash21(i);
    let b = hash21(i + vec2f(1.0, 0.0));
    let c = hash21(i + vec2f(0.0, 1.0));
    let d = hash21(i + vec2f(1.0, 1.0));

    let u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Gradient noise (Perlin-like)
fn gradientNoise(st: vec2f) -> f32 {
    let i = floor(st);
    let f = fract(st);

    let u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(dot(random2(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0)),
            dot(random2(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0)), u.x),
        mix(dot(random2(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0)),
            dot(random2(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0)), u.x),
        u.y
    );
}

// Simplex-like noise (faster approximation)
fn simplexNoise(p: vec2f) -> f32 {
    let K1 = 0.366025404; // (sqrt(3)-1)/2
    let K2 = 0.211324865; // (3-sqrt(3))/6

    let i = floor(p + (p.x + p.y) * K1);
    let a = p - i + (i.x + i.y) * K2;
    let o = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a.x > a.y);
    let b = a - o + K2;
    let c = a - 1.0 + 2.0 * K2;

    var h = max(vec3f(0.0), 0.5 - vec3f(dot(a, a), dot(b, b), dot(c, c)));
    h = h * h * h * h;

    let n = vec3f(
        dot(a, hash22(i) - 0.5),
        dot(b, hash22(i + o) - 0.5),
        dot(c, hash22(i + 1.0) - 0.5)
    );

    return dot(h, n) * 70.0;
}

// Voronoi noise
fn voronoi(x: vec2f, randomness: f32) -> f32 {
    let p = floor(x);
    let f = fract(x);

    var res = 8.0;
    for (var j = -1; j <= 1; j = j + 1) {
        for (var i = -1; i <= 1; i = i + 1) {
            let b = vec2f(f32(i), f32(j));
            var o = hash22(p + b);
            o = 0.5 + 0.5 * sin(6.2831 * o) * randomness;
            let r = b - f + o;
            let d = dot(r, r);
            res = min(res, d);
        }
    }
    return sqrt(res);
}

// IQ-style voronoi for more controlled output
fn iqVoronoi(x: vec2f, u: f32, v: f32) -> f32 {
    let p = floor(x);
    let f = fract(x);
    let k = 1.0 + 63.0 * pow(1.0 - v, 4.0);

    var va = 0.0;
    var wt = 0.0;

    for (var j = -2; j <= 2; j = j + 1) {
        for (var i = -2; i <= 2; i = i + 1) {
            let g = vec2f(f32(i), f32(j));
            let o = hash33(p + g) * vec3f(u, u, 1.0);
            let r = g - f + o.xy;
            let d = dot(r, r);
            let ww = pow(1.0 - smoothstep(0.0, 1.414, sqrt(d)), k);
            va = va + o.z * ww;
            wt = wt + ww;
        }
    }
    return va / wt;
}

// ============================================================================
// FBM variations
// ============================================================================

fn fbm(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        value = value + amplitude * valueNoise(p);
        p = p * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value;
}

fn fbmGradient(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        value = value + amplitude * (gradientNoise(p) * 0.5 + 0.5);
        p = p * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value;
}

fn fbmSimplex(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        value = value + amplitude * (simplexNoise(p) * 0.5 + 0.5);
        p = p * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value;
}

// Ridged multifractal
fn ridgedMF(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32, offset: f32, gain: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var frequency = 1.0;
    var weight = 1.0;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        var n = valueNoise(p * frequency);
        n = abs(n * 2.0 - 1.0);
        n = offset - n;
        n = n * n;
        n = n * weight;
        weight = clamp(n * gain, 0.0, 1.0);
        value = value + n * amplitude;
        frequency = frequency * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value;
}

// Billow noise
fn billowNoise(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var maxValue = 0.0;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        var n = valueNoise(p);
        n = abs(n * 2.0 - 1.0);
        n = n * n;
        value = value + n * amplitude;
        maxValue = maxValue + amplitude;
        p = p * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value / maxValue;
}

// Turbulence
fn turbulenceNoise(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var maxValue = 0.0;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        var n = valueNoise(p);
        n = abs(n * 2.0 - 1.0);
        value = value + n * amplitude;
        maxValue = maxValue + amplitude;
        p = p * lacunarity;
        amplitude = amplitude * persistence;
    }
    return value / maxValue;
}

// Domain warping
fn domainWarp(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32, strength: f32) -> f32 {
    let warp1 = fbm(st, max(4, octaves - 2), lacunarity, persistence);
    let warp2 = fbm(st + vec2f(5.2, 1.3), max(4, octaves - 2), lacunarity, persistence);
    let warped = st + vec2f(warp1, warp2) * strength;
    return fbm(warped, octaves, lacunarity, persistence);
}

// ============================================================================
// Terrain type generators
// ============================================================================

// Terracing function
fn terrace(h: f32, count: f32) -> f32 {
    let W = 1.0 / count;
    let k = floor(h / W);
    let f = (h - k * W) / W;
    let s = min(100.0 * f, 1.0);
    return (k + s) * W;
}

// Diamond-square (approximation using noise)
fn diamondSquare(st: vec2f, octaves: i32, roughness: f32) -> f32 {
    var value = 0.0;
    var scale = 1.0;
    var amplitude = 1.0;
    var p = st;

    for (var i = 0; i < octaves; i = i + 1) {
        let gridSize = pow(2.0, f32(i));
        let grid = floor(p * gridSize) / gridSize;
        let gridNext = grid + 1.0 / gridSize;

        let corners = vec4f(
            hash21(grid),
            hash21(vec2f(gridNext.x, grid.y)),
            hash21(vec2f(grid.x, gridNext.y)),
            hash21(gridNext)
        );

        let t = fract(p * gridSize);
        let smooth_t = t * t * (3.0 - 2.0 * t);

        let top = mix(corners.x, corners.y, smooth_t.x);
        let bottom = mix(corners.z, corners.w, smooth_t.x);
        let diamond = mix(top, bottom, smooth_t.y);

        value = value + diamond * amplitude;
        amplitude = amplitude * roughness;
        scale = scale * 2.0;
        p = p * 2.0;
    }
    return value;
}

// Fault terrain — based on THREE.Terrain.Fault
// Repeatedly draws random lines across the terrain, raising one side and lowering the other
fn faultTerrain(st: vec2f, iterations: i32, seed: f32) -> f32 {
    var height = 0.0;
    let iters = max(iterations, 1);
    let displacement = 0.5 / f32(iters);
    let smoothWidth = 0.025;

    for (var i = 0; i < iters; i = i + 1) {
        let fi = f32(i);
        let angle = hash21(vec2f(fi * 0.7123, seed * 1.317)) * 6.28318;
        let a = sin(angle);
        let b = cos(angle);
        let cx = hash21(vec2f(fi * 1.237 + 0.5, seed * 0.893));
        let cy = hash21(vec2f(fi * 0.891 + 0.3, seed * 1.557));
        let c = a * cx + b * cy;
        let dist = a * st.x + b * st.y - c;

        if (dist > smoothWidth) {
            height = height + displacement;
        } else if (dist < -smoothWidth) {
            height = height - displacement;
        } else {
            height = height + cos(dist / smoothWidth * 1.5708) * displacement;
        }
    }
    return clamp(height + 0.5, 0.0, 1.0);
}

// Hill terrain
fn hillInfluence(t: f32) -> f32 {
    let u = clamp(t, 0.0, 1.0);
    // Match THREE.Terrain's Hill shape with a smooth ease-in-out curve
    let smoothVal = 1.0 - u * u * (3.0 - 2.0 * u);
    // Apply a linear falloff like the CPU influence path
    return smoothVal * (1.0 - u);
}

fn hillTerrain(st: vec2f, frequency: f32, seed: f32, isIsland: bool) -> f32 {
    var height = 0.0;
    let f = max(frequency, 0.1);
    let count = max(1, i32(f * f * 40.0));

    // Approximate THREE.Terrain scaling in normalized space
    let freqScale = f * 2.0;
    let minRadius = min(0.9, 1.0 / (freqScale * freqScale));
    let maxRadius = min(0.9, 1.0 / freqScale);
    let minHeight = 0.15 / (freqScale * freqScale);
    let maxHeight = 0.35 / freqScale;

    for (var i = 0; i < count; i = i + 1) {
        let fi = f32(i);
        let rnd1 = hash21(vec2f(fi + 0.17, seed + 1.9));
        let rnd2 = hash21(vec2f(fi + 0.73, seed + 0.5));
        var center = hash22(vec2f(fi, seed));

        if (isIsland) {
            // Bias centers toward the middle (matches HillIsland behavior)
            let angle = center.x * 6.28318;
            let r = sqrt(center.y) * 0.4;
            center = vec2f(0.5) + vec2f(cos(angle), sin(angle)) * r;
        }

        let radius = mix(minRadius, maxRadius, rnd1);
        let strength = mix(minHeight, maxHeight, rnd2);

        let dist = distance(st, center);
        if (dist < radius) {
            let t = dist / radius;
            height = height + hillInfluence(t) * strength;
        }
    }

    if (isIsland) {
        // Apply a broad radial falloff to reinforce island silhouette
        let islandDist = distance(st, vec2f(0.5));
        let islandFalloff = smoothstep(0.6, 0.25, islandDist);
        height = height * islandFalloff;
    }

    return height;
}

// Particle deposition terrain — noise-based approximation of THREE.Terrain.Particles
// Uses clustered hill deposits over a noise base to simulate particle accumulation
fn particleTerrain(st: vec2f, seed: f32, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    // Base terrain from FBM gives underlying structure
    var height = fbm(st * 4.0 + vec2f(seed * 3.7, seed * 7.1), octaves, lacunarity, persistence) * 0.4;

    // Clustered hill deposits simulating where particles accumulate
    for (var i = 0; i < 50; i = i + 1) {
        let fi = f32(i);
        // Cluster centers biased toward middle (like particle deposition)
        let deviation = hash22(vec2f(fi * 0.317, seed * 0.191)) * 0.3 - 0.15;
        let center = vec2f(0.5, 0.5) + deviation +
            (hash22(vec2f(fi * 1.37, seed * 0.73)) - 0.5) * 0.6;
        let radius = 0.03 + hash21(vec2f(fi + 0.5, seed)) * 0.1;
        let strength = hash21(vec2f(fi, seed + 0.5)) * 0.2 + 0.05;
        let d = length(st - center);
        let hill = max(0.0, 1.0 - d / radius);
        height = height + hill * hill * hill * strength;
    }

    return clamp(height, 0.0, 1.0);
}

// Cosine terrain — based on THREE.Terrain.Cosine
fn cosineTerrain(st: vec2f, frequency: f32, seed: f32) -> f32 {
    let freq = frequency * 3.14159;
    let phase = seed * 1.618;
    return (cos(st.x * freq + phase) + cos(st.y * freq + phase * 0.7137)) * 0.25 + 0.5;
}

// Weierstrass terrain — based on THREE.Terrain.Weierstrass
// Uses seed-derived random parameters for variety, matching the original's exp(sin^2) approach
fn weierstrassTerrain(st: vec2f, octaves: i32, lacunarity: f32, seed: f32) -> f32 {
    // Derive random parameters from seed (matching THREE.Terrain's random coefficients)
    let r11 = 0.5 + hash21(vec2f(seed, 0.1)) * 1.0;
    let r12 = 0.5 + hash21(vec2f(seed, 0.2)) * 1.0;
    let r13 = 0.025 + hash21(vec2f(seed, 0.3)) * 0.10;
    let r14 = -1.0 + hash21(vec2f(seed, 0.4)) * 2.0;
    let r21 = 0.5 + hash21(vec2f(seed, 0.5)) * 1.0;
    let r22 = 0.5 + hash21(vec2f(seed, 0.6)) * 1.0;
    let r23 = 0.025 + hash21(vec2f(seed, 0.7)) * 0.10;
    let r24 = -1.0 + hash21(vec2f(seed, 0.8)) * 2.0;
    let dir1 = select(-1.0, 1.0, hash21(vec2f(seed, 0.9)) > 0.5);
    let dir2 = select(-1.0, 1.0, hash21(vec2f(seed, 1.0)) > 0.5);

    var value = 0.0;
    let iters = min(octaves * 2, 20);
    for (var k = 0; k < iters; k = k + 1) {
        let fk = f32(k);
        let x = pow(1.0 + r11, -fk) * sin(pow(1.0 + r12, fk) * (st.x + 0.25 * cos(st.y) + r14 * st.y) * r13);
        let y = pow(1.0 + r21, -fk) * sin(pow(1.0 + r22, fk) * (st.y + 0.25 * cos(st.x) + r24 * st.x) * r23);
        value = value - exp(dir1 * x * x + dir2 * y * y);
    }
    // Normalize: shift to positive range and scale to 0..1
    let maxMag = f32(iters) * exp(1.0);
    return clamp((value + maxMag) / maxMag * 0.5, 0.0, 1.0);
}

// Mountains using ridged multifractal
fn mountainsTerrain(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    let warp = vec2f(
        fbm(st * 0.25 + vec2f(10.0, 0.0), 4, lacunarity, persistence),
        fbm(st * 0.25 + vec2f(0.0, 31.0), 4, lacunarity, persistence)
    );
    let q = st + (warp - 0.5) * 1.8;

    var base = ridgedMF(q, octaves, lacunarity, persistence, 1.0, 2.0);
    let macro_scale = fbm(q * 0.12, 4, lacunarity, persistence);
    base = base * mix(0.5, 1.0, macro_scale);
    let detail = fbm(q * 6.0, 4, lacunarity, persistence) * 0.15;
    return clamp(base + detail, 0.0, 1.2);
}

// Billowy ridges
fn billowyRidgesTerrain(st: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    let billow = billowNoise(st * 1.4, octaves, lacunarity, persistence);
    let ridge = ridgedMF(st * 1.1, octaves, lacunarity, persistence, 1.0, 2.0);
    let detail = fbm(st * 6.0, 4, lacunarity, persistence) * 0.1;
    return clamp(mix(billow, ridge, 0.65) + detail, 0.0, 1.3);
}

// Crater terrain
fn craterTerrain(st: vec2f, density: f32, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    let p = st * density;
    let cell = floor(p);
    var bowl = 0.0;
    var rim = 0.0;

    for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
            let c = cell + vec2f(f32(x), f32(y));
            let rnd = hash22(c);
            let center = c + rnd;
            let radius = mix(0.2, 0.45, hash21(c + vec2f(2.3, 5.7)));
            let d = distance(p, center);

            let depth = 1.0 - smoothstep(0.0, radius, d);
            bowl = max(bowl, depth * depth);

            let rimWidth = radius * 0.25;
            let rimBand = smoothstep(radius - rimWidth, radius, d) *
                         (1.0 - smoothstep(radius, radius + rimWidth, d));
            rim = max(rim, rimBand);
        }
    }

    let micro = (valueNoise(p * 6.0) - 0.5) * 0.06;
    let base = fbm(st * 1.2, octaves, lacunarity, persistence);
    return clamp(pow(base, 2.2) * (1.0 - bowl * 0.6 + rim * 0.25 + micro), 0.0, 1.0);
}

// Dune terrain
fn duneTerrain(st: vec2f, direction: vec2f, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    let dir = normalize(direction);
    let warp = (fbm(st * 0.2 + vec2f(4.0, 0.0), 4, lacunarity, persistence) - 0.5) * 1.6;
    let t = dot(st, dir) * 1.8 + warp;

    let phase = fract(t);
    let rampUp = smoothstep(0.0, 0.7, phase);
    let rampDown = 1.0 - smoothstep(0.7, 1.0, phase);
    var ridge = rampUp * rampDown;
    ridge = pow(ridge, 0.7);

    let ripple = (valueNoise(st * 6.0 + vec2f(17.0, 0.0)) - 0.5) * 0.08;
    let base = fbm(st * 0.6, octaves, lacunarity, persistence) * 0.35 + 0.65;
    return clamp(base * (1.0 + (ridge - 0.35) * 0.6 + ripple), 0.0, 1.0);
}

// Canyon terrain
fn canyonTerrain(st: vec2f, depth: f32, scale: f32, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
    let scaleNorm = clamp(scale / 4.0, 0.0, 1.0);
    let scaleFactor = mix(0.7, 1.25, scaleNorm);
    let width = mix(0.18, 0.07, scaleNorm);

    let warp = vec2f(
        fbm(st * 0.08 + vec2f(2.0, 0.0), 4, lacunarity, persistence),
        fbm(st * 0.08 + vec2f(0.0, 8.0), 4, lacunarity, persistence)
    );
    let q = st * scaleFactor + (warp - 0.5) * 3.0;

    let river1 = fbm(q * 0.08, 4, lacunarity, persistence);
    let river2 = fbm(q * 0.11 + vec2f(17.0, 9.0), 4, lacunarity, persistence);

    let dist1 = abs(river1 - 0.5);
    let dist2 = abs(river2 - 0.52);

    let k = 0.15;
    let h = clamp(0.5 + 0.5 * (dist2 - dist1) / k, 0.0, 1.0);
    let dist = mix(dist2, dist1, h) - k * h * (1.0 - h);

    var profile = max(0.0, 1.0 - dist / width);
    profile = clamp(profile, 0.0, 1.0);

    let plateau = fbm(st * 0.5, octaves, lacunarity, persistence) * 0.6 + 0.35;
    let ridge = ridgedMF(st * 0.9, octaves, lacunarity, persistence, 1.0, 2.0) * 0.22;

    let centerDist = distance(st / scale, vec2f(0.5));
    let centerBias = 1.0 - smoothstep(0.25, 0.6, centerDist);
    let carve = (1.0 - (1.0 - profile * min(depth, 0.7))) * mix(0.25, 1.0, centerBias) * 1.15;

    return clamp(plateau + ridge - carve, 0.0, 1.2);
}

// ============================================================================
// Mask functions
// ============================================================================

fn circleMask(uv: vec2f, center: vec2f) -> f32 {
    return max(0.5 - distance(uv, center), 0.0);
}

fn squareMask(uv: vec2f, center: vec2f) -> f32 {
    let d = abs(uv - center);
    let size = 0.4;
    return max(0.0, 1.0 - max(d.x, d.y) / size);
}

fn ringMask(uv: vec2f, center: vec2f) -> f32 {
    let dist = distance(uv, center);
    let inner = 0.2;
    let outer = 0.4;
    return smoothstep(outer, inner, dist) * smoothstep(inner - 0.1, inner, dist);
}

fn radialGradientMask(uv: vec2f, center: vec2f) -> f32 {
    let dist = distance(uv, center);
    return 1.0 - smoothstep(0.0, 0.7, dist);
}

fn cornerMask(uv: vec2f) -> f32 {
    return (1.0 - uv.x) * (1.0 - uv.y);
}

fn diagonalMask(uv: vec2f) -> f32 {
    return abs(uv.x - uv.y);
}

fn crossMask(uv: vec2f, center: vec2f) -> f32 {
    let d = abs(uv - center);
    let width = 0.15;
    return max(smoothstep(width, 0.0, d.x), smoothstep(width, 0.0, d.y));
}

fn slopeMask(uv: vec2f) -> f32 {
    return (uv.x + uv.y) * 0.5;
}

fn applyMask(height: f32, uv: vec2f, maskType: i32, maskStrength: f32, center: vec2f) -> f32 {
    var mask = 1.0;

    switch (maskType) {
        case 0: { mask = 1.0; } // OFF
        case 1: { mask = 2.0 * pow(circleMask(uv, center), 1.0); } // Sphere
        case 2: { mask = slopeMask(uv); } // Slope
        case 3: { mask = 2.0 * pow(squareMask(uv, center), 1.0); } // Square
        case 4: { mask = 2.0 * ringMask(uv, center); } // Ring
        case 5: { mask = 2.0 * radialGradientMask(uv, center); } // RadialGradient
        case 6: { mask = 2.0 * cornerMask(uv); } // Corner
        case 7: { mask = 1.0 + diagonalMask(uv) * 0.5; } // Diagonal
        case 8: { mask = 1.0 + crossMask(uv, center) * 0.5; } // Cross
        default: { mask = 1.0; }
    }

    return height * mix(1.0, mask, maskStrength);
}

// ============================================================================
// Main generator function
// ============================================================================

fn generateHeight(uv: vec2f) -> f32 {
    // Check for heightmap mode first
    if (uniforms.useHeightmap == 1) {
        let dims = textureDimensions(heightmapTexture, 0);
        let texCoord = uv * vec2f(f32(dims.x), f32(dims.y)) - 0.5;
        let tc = clamp(texCoord, vec2f(0.0), vec2f(f32(dims.x) - 1.0, f32(dims.y) - 1.0));
        let tci = vec2i(i32(tc.x), i32(tc.y));
        let tcf = fract(tc);

        // Bilinear interpolation via textureLoad
        let tl = textureLoad(heightmapTexture, tci, 0).r;
        let tr = textureLoad(heightmapTexture, vec2i(min(tci.x + 1, i32(dims.x) - 1), tci.y), 0).r;
        let bl = textureLoad(heightmapTexture, vec2i(tci.x, min(tci.y + 1, i32(dims.y) - 1)), 0).r;
        let br = textureLoad(heightmapTexture, vec2i(min(tci.x + 1, i32(dims.x) - 1), min(tci.y + 1, i32(dims.y) - 1)), 0).r;
        var h = mix(mix(tl, tr, tcf.x), mix(bl, br, tcf.x), tcf.y);

        if (uniforms.heightmapInvert == 1) {
            h = 1.0 - h;
        }
        return h * uniforms.heightmapAmplitude;
    }

    let scale = uniforms.terrainScale;
    let seed = uniforms.seed;
    let octaves = uniforms.octaves;
    let lacunarity = uniforms.lacunarity;
    let persistence = uniforms.persistence;
    let freq = uniforms.frequency;

    var p = uv * scale * freq;
    p = p + vec2f(uniforms.offsetX, uniforms.offsetY);
    p = p + vec2f(seed * 17.3, seed * 23.7);

    var height = 0.0;

    switch (uniforms.generatorType) {
        // Original types (0-11)
        case 0: { // ordinaryFBM
            height = pow(fbm(p * 2.0, octaves, lacunarity, persistence) * 1.1, 3.0);
        }
        case 1: { // domainWarp
            height = domainWarp(p * 2.0, octaves, lacunarity, persistence, uniforms.domainWarpStrength);
        }
        case 2: { // terrace
            let base = pow(fbm(p * 2.0, octaves, lacunarity, persistence) * 1.1, 3.0);
            height = terrace(base / 1.2, uniforms.terraceCount);
        }
        case 3: { // voronoi — FBM-style layered voronoi
            var v = 0.0;
            var amp_v = 0.5;
            var vp = p;
            for (var vi = 0; vi < min(octaves, 6); vi = vi + 1) {
                v = v + amp_v * voronoi(vp, uniforms.voronoiRandomness);
                vp = vp * lacunarity;
                amp_v = amp_v * persistence;
            }
            height = v;
        }
        case 4: { // ridgeNoise
            let base = pow(fbm(p * 1.5, octaves, lacunarity, persistence), 2.0);
            height = 0.8 * (0.3 - abs(0.3 - base));
        }
        case 5: { // billowNoise
            let warp = vec2f(
                fbm(p * 0.35 + vec2f(3.1, 0.0), 4, lacunarity, persistence),
                fbm(p * 0.35 + vec2f(0.0, 9.2), 4, lacunarity, persistence)
            );
            let warped = p + (warp - 0.5) * 1.2;
            height = billowNoise(warped * 1.6, octaves, lacunarity, persistence);
        }
        case 6: { // turbulence
            let warp = vec2f(
                fbm(p * 0.25 + vec2f(11.7, 0.0), 4, lacunarity, persistence),
                fbm(p * 0.25 + vec2f(0.0, 21.3), 4, lacunarity, persistence)
            );
            let warped = p + (warp - 0.5) * 1.8;
            height = turbulenceNoise(warped * 1.5, octaves, lacunarity, persistence);
        }
        case 7: { // craters
            height = craterTerrain(p * 1.1, uniforms.craterDensity, octaves, lacunarity, persistence);
        }
        case 8: { // dunes
            height = duneTerrain(p * 1.2, vec2f(uniforms.duneDirectionX, uniforms.duneDirectionY),
                                octaves, lacunarity, persistence);
        }
        case 9: { // canyons
            height = canyonTerrain(p * 1.1, uniforms.canyonDepth, scale, octaves, lacunarity, persistence);
        }
        case 10: { // mountains
            height = mountainsTerrain(p * 1.4, octaves, lacunarity, persistence);
        }
        case 11: { // billowyRidges
            height = billowyRidgesTerrain(p * 1.3, octaves, lacunarity, persistence);
        }

        // THREE.Terrain ports (12-25)
        case 12: { // perlin
            height = fbmGradient(p, octaves, lacunarity, persistence);
        }
        case 13: { // simplex
            height = fbmSimplex(p, octaves, lacunarity, persistence);
        }
        case 14: { // diamondSquare
            height = diamondSquare(p / scale, octaves, persistence);
        }
        case 15: { // fault
            height = faultTerrain(uv, i32(freq * 80.0), seed);
        }
        case 16: { // hill
            height = hillTerrain(uv, freq, seed, false);
        }
        case 17: { // hillIsland
            height = hillTerrain(uv, freq, seed, true);
        }
        case 18: { // particles
            height = particleTerrain(uv, seed, octaves, lacunarity, persistence);
        }
        case 19: { // value
            height = fbm(p, octaves, lacunarity, persistence);
        }
        case 20: { // cosine
            height = cosineTerrain(p, freq, seed);
        }
        case 21: { // weierstrass
            // Scale UV to vertex-index range for correct Weierstrass behavior
            height = weierstrassTerrain(uv * f32(i32(uniforms.resolution)) * freq * 0.01, octaves, lacunarity, seed);
        }
        case 22: { // perlinLayers
            var h = 0.0;
            for (var i = 0; i < 3; i = i + 1) {
                let layer = fbmGradient(p * (1.0 + f32(i) * 0.5), octaves, lacunarity, persistence);
                h = h + layer * (1.0 / f32(i + 1));
            }
            height = h / 1.833;
        }
        case 23: { // simplexLayers
            var h = 0.0;
            for (var i = 0; i < 3; i = i + 1) {
                let layer = fbmSimplex(p * (1.0 + f32(i) * 0.5), octaves, lacunarity, persistence);
                h = h + layer * (1.0 / f32(i + 1));
            }
            height = h / 1.833;
        }
        case 24: { // perlinDiamond
            let perlin = fbmGradient(p, octaves, lacunarity, persistence);
            let diamond = diamondSquare(p / scale, octaves, persistence);
            height = mix(perlin, diamond, 0.5);
        }
        case 25: { // cosineLayers
            var h = 0.0;
            for (var i = 0; i < 4; i = i + 1) {
                let f = freq * (1.0 + f32(i));
                h = h + cosineTerrain(p, f, seed) * (1.0 / f32(i + 1));
            }
            height = h / 2.083;
        }

        // Imported heightmap (100) - handled at top
        default: {
            height = fbm(p * 2.0, octaves, lacunarity, persistence);
        }
    }

    return height;
}

// ============================================================================
// Compute shader entry point
// ============================================================================

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let resolution = u32(uniforms.resolution);

    if (global_id.x >= resolution || global_id.y >= resolution) {
        return;
    }

    let uv = vec2f(f32(global_id.x), f32(global_id.y)) / f32(resolution);
    let center = vec2f(uniforms.maskCenterX, uniforms.maskCenterY);

    // Generate base height
    var height = generateHeight(uv);

    // Apply mask
    height = applyMask(height, uv, uniforms.maskType, uniforms.maskStrength, center);

    // Scale to final height
    height = height * uniforms.terrainHeight * 120.0;

    // Output: R=height, G=water(0), B=rock(0), A=1
    let output = vec4f(height, 0.0, 0.0, 1.0);

    textureStore(writeTerrainA, vec2i(global_id.xy), output);
    textureStore(writeTerrainB, vec2i(global_id.xy), output);
}
