/**
 * Shared noise functions for terrain generation
 * These match the shader implementations in initial-frag.glsl exactly
 */

// Match GLSL fract() exactly - always returns [0, 1)
function random(st: [number, number]): number {
  const val = Math.sin(st[0] * 12.9898 + st[1] * 78.233) * 43758.5453123;
  return val - Math.floor(val); // Equivalent to GLSL fract()
}

export function noise2d(st: [number, number]): number {
  const i = [Math.floor(st[0]), Math.floor(st[1])];
  const f = [st[0] - i[0], st[1] - i[1]];
  
  const a = random([i[0], i[1]]);
  const b = random([i[0] + 1, i[1]]);
  const c = random([i[0], i[1] + 1]);
  const d = random([i[0] + 1, i[1] + 1]);
  
  const u = [f[0] * f[0] * (3.0 - 2.0 * f[0]), f[1] * f[1] * (3.0 - 2.0 * f[1])];
  
  return a + (b - a) * u[0] + (c - a) * u[1] * (1.0 - u[0]) + (d - b) * u[0] * u[1];
}

// FBM function matching initial-frag.glsl exactly: OCTAVES 8, amplitude *= 0.47
export function fbm(p: [number, number], octaves: number = 8): number {
  let value = 0.0;
  let amplitude = 0.5; // Match initial-frag.glsl: float amplitude = 0.5;
  let frequency = 1.0;
  
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2d([p[0] * frequency, p[1] * frequency]);
    frequency *= 2.0; // Match initial-frag.glsl: st *= 2.0;
    amplitude *= 0.47; // Match initial-frag.glsl: amplitude *= 0.47;
  }
  
  return value;
}

export function fbm4(p: [number, number]): number {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  
  for (let i = 0; i < 4; i++) {
    value += amplitude * noise2d([p[0] * frequency, p[1] * frequency]);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

// Hash functions for Voronoi and masks
export function hash3(p: [number, number]): [number, number, number] {
  const q = [
    p[0] * 127.1 + p[1] * 311.7,
    p[0] * 269.5 + p[1] * 183.3,
    p[0] * 419.2 + p[1] * 371.9
  ];
  return [
    ((Math.sin(q[0]) * 43758.5453) % 1),
    ((Math.sin(q[1]) * 43758.5453) % 1),
    ((Math.sin(q[2]) * 43758.5453) % 1)
  ];
}

export function iqnoise(x: [number, number], u: number, v: number): number {
  const p = [Math.floor(x[0]), Math.floor(x[1])];
  const f = [x[0] - p[0], x[1] - p[1]];
  
  const k = 1.0 + 63.0 * Math.pow(1.0 - v, 4.0);
  
  let va = 0.0;
  let wt = 0.0;
  
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const g: [number, number] = [i, j];
      const o = hash3([p[0] + g[0], p[1] + g[1]]);
      const r: [number, number] = [g[0] - f[0] + o[0] * u, g[1] - f[1] + o[1] * u];
      const d = r[0] * r[0] + r[1] * r[1];
      const ww = Math.pow(1.0 - Math.min(1.0, Math.sqrt(d) / 1.414), k);
      va += o[2] * ww;
      wt += ww;
    }
  }
  
  return wt > 0 ? va / wt : 0.0;
}

// Terrace function
export function teR(h: number): number {
  const W = 0.04;
  const k = Math.floor(h / W);
  const f = (h - k * W) / W;
  const s = Math.min(100.0 * f, 1.0);
  return (k + s) * W;
}

// Domain warp
export function domainwarp(p: [number, number]): number {
  const warp1 = fbm(p);
  const warp2 = fbm([p[0] + warp1, p[1] + warp1]);
  return fbm([p[0] + warp2, p[1] + warp2]);
}

// Voronoi
export function voroni(p: [number, number]): number {
  return iqnoise([p[0] * 2.0, p[1] * 2.0], 2.0, 2.0);
}

// Ridge noise
export function ridgenoise(p: number): number {
  return 0.8 * (0.3 - Math.abs(0.3 - p));
}

// Ridged multifractal
export function ridged_mf(p: [number, number]): number {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let weight = 1.0;
  
  for (let i = 0; i < 6; i++) {
    let n = noise2d([p[0] * frequency, p[1] * frequency]);
    n = Math.abs(n * 2.0 - 1.0);
    n = 1.0 - n;
    n = n * n;
    n *= weight;
    weight = Math.min(n * 2.0, 1.0);
    value += n * amplitude;
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

// Billow noise
export function billow_noise(p: [number, number]): number {
  const warp = [
    fbm4([p[0] * 0.35 + 3.1, p[1] * 0.35 + 3.1]),
    fbm4([p[0] * 0.35 + 9.2, p[1] * 0.35 + 9.2])
  ];
  const q: [number, number] = [p[0] + (warp[0] - 0.5) * 1.2, p[1] + (warp[1] - 0.5) * 1.2];
  
  let value = 0.0;
  let amplitude = 0.5;
  let maxValue = 0.0;
  let freq = 1.0;
  
  for (let i = 0; i < 6; i++) {
    let n = noise2d([q[0] * freq, q[1] * freq]);
    n = Math.abs(n * 2.0 - 1.0);
    n = n * n;
    value += n * amplitude;
    maxValue += amplitude;
    freq *= 2.0;
    amplitude *= 0.5;
  }
  
  return maxValue > 0 ? value / maxValue : 0.0;
}

// Turbulence
export function turbulence(p: [number, number]): number {
  const warp = [
    fbm4([p[0] * 0.25 + 11.7, p[1] * 0.25 + 11.7]),
    fbm4([p[0] * 0.25 + 21.3, p[1] * 0.25 + 21.3])
  ];
  const q: [number, number] = [p[0] + (warp[0] - 0.5) * 1.8, p[1] + (warp[1] - 0.5) * 1.8];
  
  let value = 0.0;
  let amplitude = 0.5;
  let maxValue = 0.0;
  let freq = 1.0;
  
  for (let i = 0; i < 7; i++) {
    let n = noise2d([q[0] * freq, q[1] * freq]);
    n = Math.abs(n * 2.0 - 1.0);
    value += n * amplitude;
    maxValue += amplitude;
    freq *= 2.0;
    amplitude *= 0.55;
  }
  
  return maxValue > 0 ? value / maxValue : 0.0;
}

// random2 - matches shader random2
function random2(st: [number, number]): [number, number] {
  const val1 = Math.sin(st[0] * 127.1 + st[1] * 311.7) * 43758.5453123;
  const val2 = Math.sin(st[0] * 269.5 + st[1] * 183.3) * 43758.5453123;
  return [
    (val1 - Math.floor(val1)) * 2.0 - 1.0, // -1 to 1 range
    (val2 - Math.floor(val2)) * 2.0 - 1.0
  ];
}

// Hash22 - returns vec2 (matches shader hash22: random2(st) * 0.5 + 0.5)
function hash22(c: [number, number]): [number, number] {
  const r2 = random2(c);
  return [r2[0] * 0.5 + 0.5, r2[1] * 0.5 + 0.5]; // Convert to 0-1 range
}

// Hash12 - returns float (matches shader hash12)
function hash12(c: [number, number]): number {
  return hash3(c)[2];
}

// Crater mask
export function crater_mask(p: [number, number], craterDensity: number): number {
  const cell = [Math.floor(p[0]), Math.floor(p[1])];
  let bowl = 0.0;
  let rim = 0.0;
  
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const c: [number, number] = [cell[0] + x, cell[1] + y];
      const rnd = hash22(c); // Match shader: vec2 rnd = hash22(c);
      const center: [number, number] = [c[0] + rnd[0], c[1] + rnd[1]];
      // Match shader: mix(0.2, 0.45, hash12(c + vec2(2.3, 5.7)))
      const radiusHash = hash12([c[0] + 2.3, c[1] + 5.7]);
      const radius = 0.2 + (radiusHash * 0.25); // mix(0.2, 0.45, hash) = 0.2 + hash * (0.45 - 0.2)
      const d = Math.sqrt((p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2);
      
      const depth = 1.0 - Math.min(1.0, d / radius);
      const depthSq = depth * depth;
      bowl = Math.max(bowl, depthSq);
      
      const rimWidth = radius * 0.25;
      // Match shader: smoothstep(radius - rimWidth, radius, d) * (1.0 - smoothstep(radius, radius + rimWidth, d))
      const smoothstep1 = Math.max(0.0, Math.min(1.0, (d - (radius - rimWidth)) / rimWidth));
      const smoothstep2 = 1.0 - Math.max(0.0, Math.min(1.0, (d - radius) / rimWidth));
      const rimBand = smoothstep1 * smoothstep2;
      rim = Math.max(rim, rimBand);
    }
  }
  
  // Match shader: (noise(p * 6.0) - 0.5) * 0.06
  const micro = (noise2d([p[0] * 6.0, p[1] * 6.0]) - 0.5) * 0.06;
  const mask = 1.0 - bowl * 0.6 + rim * 0.25 + micro;
  return Math.max(0.2, Math.min(1.4, mask));
}

// Dune mask
export function dune_mask(p: [number, number], duneDir: [number, number]): number {
  const dirLen = Math.sqrt(duneDir[0]**2 + duneDir[1]**2);
  const dir = dirLen > 0 ? [duneDir[0] / dirLen, duneDir[1] / dirLen] : [1, 0];
  const warp = (fbm4([p[0] * 0.2 + 4.0, p[1] * 0.2 + 4.0]) - 0.5) * 1.6;
  const t = (p[0] * dir[0] + p[1] * dir[1]) * 1.8 + warp;
  
  const phase = t - Math.floor(t);
  // Match shader: smoothstep(0.0, 0.7, phase) and 1.0 - smoothstep(0.7, 1.0, phase)
  const rampUp = phase < 0.7 ? Math.max(0.0, Math.min(1.0, phase / 0.7)) : 1.0;
  const rampDown = phase >= 0.7 ? 1.0 - Math.max(0.0, Math.min(1.0, (phase - 0.7) / 0.3)) : 1.0;
  let ridge = rampUp * rampDown;
  ridge = Math.pow(ridge, 0.7);
  
  // Match shader: (noise(p * 6.0 + 17.0) - 0.5) * 0.08
  const ripple = (noise2d([p[0] * 6.0 + 17.0, p[1] * 6.0 + 17.0]) - 0.5) * 0.08;
  const mask = 1.0 + (ridge - 0.35) * 0.6 + ripple;
  return Math.max(0.6, Math.min(1.35, mask));
}

// Canyon mask
export function canyon_mask(p: [number, number], terrainScale: number, canyonDepth: number): number {
  const scaleNorm = Math.max(0.0, Math.min(1.0, terrainScale / 4.0));
  const scaleFactor = 0.7 + (scaleNorm * 0.55);
  const width = 0.18 - (scaleNorm * 0.11);
  
  const warp = [
    fbm4([p[0] * 0.08 + 2.0, p[1] * 0.08 + 2.0]),
    fbm4([p[0] * 0.08 + 8.0, p[1] * 0.08 + 8.0])
  ];
  const q: [number, number] = [p[0] * scaleFactor + (warp[0] - 0.5) * 3.0, p[1] * scaleFactor + (warp[1] - 0.5) * 3.0];
  
  const river1 = fbm4([q[0] * 0.08, q[1] * 0.08]);
  const river2 = fbm4([q[0] * 0.11 + 17.0, q[1] * 0.11 + 9.0]);
  
  const dist1 = Math.abs(river1 - 0.5);
  const dist2 = Math.abs(river2 - 0.52);
  
  const k = 0.15;
  const h = Math.max(0.0, Math.min(1.0, 0.5 + 0.5 * (dist2 - dist1) / k));
  const dist = (dist2 * h + dist1 * (1.0 - h)) - k * h * (1.0 - h);
  
  const profile = Math.max(0.0, 1.0 - dist / width);
  const heightFactor = 0.6 + (Math.min(1.0, terrainScale / 5.0) * 0.7);
  const depth = canyonDepth * heightFactor;
  const maxDepth = 0.7;
  const clampedDepth = Math.min(depth, maxDepth);
  
  const mask = 1.0 - profile * clampedDepth;
  return Math.max(0.3, Math.min(1.0, mask));
}

// Mountains
export function mountains(p: [number, number]): number {
  const warp = [
    fbm4([p[0] * 0.25 + 10.0, p[1] * 0.25 + 10.0]),
    fbm4([p[0] * 0.25 + 31.0, p[1] * 0.25 + 31.0])
  ];
  const q: [number, number] = [p[0] + (warp[0] - 0.5) * 1.8, p[1] + (warp[1] - 0.5) * 1.8];
  
  const base = ridged_mf([q[0] * 1.0, q[1] * 1.0]);
  const macro = fbm4([q[0] * 0.12, q[1] * 0.12]);
  const scaledBase = base * (0.5 + macro * 0.5);
  const detail = fbm4([q[0] * 6.0, q[1] * 6.0]) * 0.15;
  return Math.max(0.0, Math.min(1.2, scaledBase + detail));
}

// Billowy ridges
export function billowy_ridges(p: [number, number]): number {
  const billow = billow_noise([p[0] * 1.4, p[1] * 1.4]);
  const ridge = ridged_mf([p[0] * 1.1, p[1] * 1.1]);
  const detail = fbm4([p[0] * 6.0, p[1] * 6.0]) * 0.1;
  return Math.max(0.0, Math.min(1.3, billow * 0.35 + ridge * 0.65 + detail));
}
