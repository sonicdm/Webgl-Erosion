/**
 * Custom terrain generation algorithms ported from initial-frag.glsl
 * These are used as THREE.Terrain heightmap functions
 */

/**
 * THREE.Terrain heightmap functions receive:
 * @param zs - Float32Array or Array of just the Z (height) values, extracted from vertex positions
 * @param options - Object with { xSegments, ySegments, xSize, ySize, minHeight, maxHeight, ... }
 * 
 * The zs array is indexed as: zs[y * (xSegments+1) + x] for vertex at grid position (x, y)
 * After the heightmap function modifies zs, THREE.Terrain will:
 * 1. Put values back into vertex array via fromArray1D
 * 2. Normalize to [minHeight, maxHeight] via Normalize
 */

// Noise functions (ported from GLSL)
// Match GLSL fract() exactly - always returns [0, 1)
function random(st: [number, number]): number {
  const val = Math.sin(st[0] * 12.9898 + st[1] * 78.233) * 43758.5453123;
  return val - Math.floor(val); // Equivalent to GLSL fract()
}

function noise2d(st: [number, number]): number {
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
function fbm(p: [number, number], octaves: number = 8): number {
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

function fbm4(p: [number, number]): number {
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

// Hash functions for Voronoi
function hash3(p: [number, number]): [number, number, number] {
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

function iqnoise(x: [number, number], u: number, v: number): number {
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
function teR(h: number): number {
  const W = 0.04;
  const k = Math.floor(h / W);
  const f = (h - k * W) / W;
  const s = Math.min(100.0 * f, 1.0);
  return (k + s) * W;
}

// Domain warp
function domainwarp(p: [number, number]): number {
  const warp1 = fbm(p);
  const warp2 = fbm([p[0] + warp1, p[1] + warp1]);
  return fbm([p[0] + warp2, p[1] + warp2]);
}

// Voronoi
function voroni(p: [number, number]): number {
  return iqnoise([p[0] * 2.0, p[1] * 2.0], 2.0, 2.0);
}

// Ridge noise
function ridgenoise(p: number): number {
  return 0.8 * (0.3 - Math.abs(0.3 - p));
}

// Ridged multifractal
function ridged_mf(p: [number, number]): number {
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
function billow_noise(p: [number, number]): number {
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
function turbulence(p: [number, number]): number {
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

// Crater mask
function crater_mask(p: [number, number], craterDensity: number): number {
  const cell = [Math.floor(p[0]), Math.floor(p[1])];
  let bowl = 0.0;
  let rim = 0.0;
  
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const c: [number, number] = [cell[0] + x, cell[1] + y];
      const rnd = hash3(c);
      const center: [number, number] = [c[0] + rnd[0], c[1] + rnd[1]];
      const radius = 0.2 + (rnd[2] * 0.25);
      const d = Math.sqrt((p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2);
      
      const depth = 1.0 - Math.min(1.0, d / radius);
      const depthSq = depth * depth;
      bowl = Math.max(bowl, depthSq);
      
      const rimWidth = radius * 0.25;
      const rimBand = (d >= radius - rimWidth && d <= radius + rimWidth) ? 1.0 : 0.0;
      rim = Math.max(rim, rimBand);
    }
  }
  
  const micro = (noise2d([p[0] * 6.0, p[1] * 6.0]) - 0.5) * 0.06;
  const mask = 1.0 - bowl * 0.6 + rim * 0.25 + micro;
  return Math.max(0.2, Math.min(1.4, mask));
}

// Dune mask
function dune_mask(p: [number, number], duneDir: [number, number]): number {
  const dir = [duneDir[0] / Math.sqrt(duneDir[0]**2 + duneDir[1]**2), duneDir[1] / Math.sqrt(duneDir[0]**2 + duneDir[1]**2)];
  const warp = (fbm4([p[0] * 0.2 + 4.0, p[1] * 0.2 + 4.0]) - 0.5) * 1.6;
  const t = (p[0] * dir[0] + p[1] * dir[1]) * 1.8 + warp;
  
  const phase = t - Math.floor(t);
  const rampUp = phase < 0.7 ? phase / 0.7 : 1.0;
  const rampDown = phase >= 0.7 ? 1.0 - (phase - 0.7) / 0.3 : 1.0;
  let ridge = rampUp * rampDown;
  ridge = Math.pow(ridge, 0.7);
  
  const ripple = (noise2d([p[0] * 6.0 + 17.0, p[1] * 6.0 + 17.0]) - 0.5) * 0.08;
  const mask = 1.0 + (ridge - 0.35) * 0.6 + ripple;
  return Math.max(0.6, Math.min(1.35, mask));
}

// Canyon mask
function canyon_mask(p: [number, number], terrainScale: number, canyonDepth: number): number {
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
function mountains(p: [number, number]): number {
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
function billowy_ridges(p: [number, number]): number {
  const billow = billow_noise([p[0] * 1.4, p[1] * 1.4]);
  const ridge = ridged_mf([p[0] * 1.1, p[1] * 1.1]);
  const detail = fbm4([p[0] * 6.0, p[1] * 6.0]) * 0.1;
  return Math.max(0.0, Math.min(1.3, billow * 0.35 + ridge * 0.65 + detail));
}

/**
 * THREE.Terrain heightmap functions
 * These modify the vertex array g in place
 */
export function createCustomTerrainHeightmap(
  baseType: number,
  terrainRandom?: any
): (zs: Float32Array | number[], options: any) => void {
  return (zs: Float32Array | number[], options: any) => {
    const xSegments = options.xSegments || 63;
    const ySegments = options.ySegments || 63;
    const xSize = options.xSize || 1024;
    const ySize = options.ySize || 1024;
    
    const terrainScale = (options.terrainScale || 3.2);
    const terrainHeight = (options.terrainHeight || 2.0);
    const terrainMask = (options.terrainMask || 0);
    const timer = options.timer || 0; // Get timer from options (matching initial-frag.glsl u_Time)
    const seedOffset = terrainRandom?.seedOffset || [0, 0];
    const duneDir = terrainRandom?.duneDir || [1, 0];
    const craterDensity = terrainRandom?.craterDensity || 1.0;
    const canyonDepth = terrainRandom?.canyonDepth || 0.5;
    
    // THREE.Terrain passes zs as a 1D array of just Z (height) values
    // Indexed as: zs[y * (xSegments+1) + x] for vertex at grid position (x, y)
    // Grid goes from (0,0) at top-left to (xSegments, ySegments) at bottom-right
    const xl = xSegments + 1;
    const yl = ySegments + 1;
    
    for (let y = 0; y < yl; y++) {
      for (let x = 0; x < xl; x++) {
        const idx = y * xl + x;
        
        // Convert grid position to UV space [0, 1] (matching terrain-geometry-builder.ts: u = x / (width - 1))
        // Since xSegments = simres - 1, we have: u = x / xSegments = x / (simres - 1) ✓
        const u = x / xSegments;
        const v = y / ySegments;
      
      // Calculate position with seed offset and timer (matching initial-frag.glsl exactly)
      // Shader: cpos = 1.5 * uv * u_TerrainScale + vec2(1.f*sin(u_Time / 3.0) + 2.1, 1.0 * cos(u_Time/17.0)+3.6) + u_TerrainSeedOffset
      const cpos: [number, number] = [
        1.5 * u * terrainScale + (Math.sin(timer / 3.0) + 2.1) + seedOffset[0],
        1.5 * v * terrainScale + (Math.cos(timer / 17.0) + 3.6) + seedOffset[1]
      ];
      
      let terrain_height = 0.0;
      
      // Generate base terrain based on type (matching initial-frag.glsl exactly)
      if (baseType === 0) {
        // Ordinary FBM - match initial-frag.glsl exactly:
        // vec2 cpos = 1.5 * uv * u_TerrainScale + vec2(1.f*sin(u_Time / 3.0) + 2.1, 1.0 * cos(u_Time/17.0)+3.6) + u_TerrainSeedOffset;
        // float base_height = pow(fbm(cpos * 2.0) * 1.1, 3.0);
        const base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0]) * 1.1, 3.0);
        terrain_height = base_height;
      } else if (baseType === 1) {
        // Domain Warp
        terrain_height = domainwarp([cpos[0] * 2.0, cpos[1] * 2.0]);
      } else if (baseType === 2) {
        // Terrace
        const base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0]) * 1.1, 3.0);
        terrain_height = teR(base_height / 1.2);
      } else if (baseType === 3) {
        // Voronoi
        terrain_height = voroni([cpos[0] * 2.0, cpos[1] * 2.0]) / 3.0;
      } else if (baseType === 4) {
        // Ridge Noise
        terrain_height = ridgenoise(Math.pow(fbm([cpos[0] * 1.5, cpos[1] * 1.5]), 2.0));
      } else if (baseType === 5) {
        // Billow Noise
        terrain_height = billow_noise([cpos[0] * 1.6, cpos[1] * 1.6]);
      } else if (baseType === 6) {
        // Turbulence
        terrain_height = turbulence([cpos[0] * 1.5, cpos[1] * 1.5]);
      } else if (baseType === 7) {
        // Craters
        const crater_base = Math.pow(fbm([cpos[0] * 1.2, cpos[1] * 1.2]), 2.2);
        terrain_height = crater_base * crater_mask([cpos[0] * 1.1 * craterDensity, cpos[1] * 1.1 * craterDensity], craterDensity);
      } else if (baseType === 8) {
        // Dunes
        const dune_base = fbm([cpos[0] * 0.6, cpos[1] * 0.6]) * 0.35 + 0.65;
        terrain_height = dune_base * dune_mask([cpos[0] * 1.2, cpos[1] * 1.2], duneDir);
      } else if (baseType === 9) {
        // Canyons
        const canyon = canyon_mask([cpos[0] * 1.1, cpos[1] * 1.1], terrainScale, canyonDepth);
        const centerDist = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2);
        const centerBias = 1.0 - Math.min(1.0, Math.max(0.0, (centerDist - 0.25) / 0.35));
        const centerPull = 0.25 + centerBias * 0.75;
        const plateau = fbm([cpos[0] * 0.5, cpos[1] * 0.5]) * 0.6 + 0.35;
        const ridge = ridged_mf([cpos[0] * 0.9, cpos[1] * 0.9]) * 0.22;
        const carve = (1.0 - canyon) * 1.15 * centerPull;
        terrain_height = Math.max(0.0, Math.min(1.2, plateau + ridge - carve));
      } else if (baseType === 10) {
        // Mountains
        terrain_height = mountains([cpos[0] * 1.4, cpos[1] * 1.4]);
      } else if (baseType === 11) {
        // Billowy Ridges
        terrain_height = billowy_ridges([cpos[0] * 1.3, cpos[1] * 1.3]);
      } else {
        // Default: Ordinary FBM
        const base_height = Math.pow(fbm([cpos[0] * 2.0, cpos[1] * 2.0]) * 1.1, 3.0);
        terrain_height = base_height;
      }
      
      // Apply height scaling (matching shader: terrain_height *= u_TerrainHeight*120.0)
      // Match initial-frag.glsl exactly: terrain_height *= u_TerrainHeight*120.0
      terrain_height *= terrainHeight * 120.0;
      
      // Apply masks (matching shader masks)
      if (terrainMask === 1) {
        // Sphere mask
        const c_mask = Math.max(0.0, 0.5 - Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2));
        terrain_height *= 2.0 * Math.pow(c_mask, 1.0);
      } else if (terrainMask === 2) {
        // Slope mask
        terrain_height *= (u + v) * 1.0;
      } else if (terrainMask === 3) {
        // Square mask
        const d = [Math.abs(u - 0.5), Math.abs(v - 0.5)];
        const size = 0.4;
        const sq_mask = Math.max(0.0, 1.0 - Math.max(d[0], d[1]) / size);
        terrain_height *= 2.0 * Math.pow(sq_mask, 1.0);
      } else if (terrainMask === 4) {
        // Ring mask
        const dist = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2);
        const inner = 0.2;
        const outer = 0.4;
        const ring = Math.max(0.0, Math.min(1.0, (outer - dist) / (outer - inner))) * Math.max(0.0, Math.min(1.0, (dist - (inner - 0.1)) / 0.1));
        terrain_height *= 2.0 * ring;
      } else if (terrainMask === 5) {
        // Radial gradient
        const dist = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2);
        const radial = 1.0 - Math.min(1.0, dist / 0.7);
        terrain_height *= 2.0 * radial;
      } else if (terrainMask === 6) {
        // Corner mask
        const corner = (1.0 - u) * (1.0 - v);
        terrain_height *= 2.0 * corner;
      } else if (terrainMask === 7) {
        // Diagonal mask
        const diag = Math.abs(u - v);
        terrain_height *= 1.0 + diag * 0.5;
      } else if (terrainMask === 8) {
        // Cross mask
        const d = [Math.abs(u - 0.5), Math.abs(v - 0.5)];
        const width = 0.15;
        const cross = Math.max(Math.max(0.0, 1.0 - d[0] / width), Math.max(0.0, 1.0 - d[1] / width));
        terrain_height *= 1.0 + cross * 0.5;
      } else if (terrainMask === 10) {
        // Crater mask
        const crater = crater_mask([cpos[0] * 1.1 * craterDensity, cpos[1] * 1.1 * craterDensity], craterDensity);
        terrain_height *= crater;
      } else if (terrainMask === 11) {
        // Dune mask
        const dune = dune_mask([cpos[0] * 1.2, cpos[1] * 1.2], duneDir);
        terrain_height *= dune;
      }
      
      // THREE.Terrain expects raw height values (not normalized)
      // It will normalize and scale to [minHeight, maxHeight] in the Normalize step
      // Set the height value directly in the zs array
      zs[idx] = terrain_height;
      }
    }
  };
}
