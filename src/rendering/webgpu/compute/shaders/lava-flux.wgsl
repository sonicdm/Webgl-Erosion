@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readLava: texture_2d<f32>;
@group(0) @binding(2) var readLavaFlux: texture_2d<f32>;
@group(0) @binding(3) var writeLavaFlux: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var readLavaVel: texture_2d<f32>;
@group(0) @binding(5) var readNoise: texture_2d<f32>;
@group(0) @binding(6) var readCoolLava: texture_2d<f32>;
@group(0) @binding(7) var readBasalt: texture_2d<f32>;
@group(0) @binding(8) var writeLavaFlux2: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var readLavaFlux2: texture_2d<f32>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    u_ViscosityScale: f32,
    u_YieldStress: f32,
    u_CrustStrength: f32,
    u_DepthBoostStrength: f32,
    u_MomentumStrength: f32,
    u_NoiseResistPower: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(10) var<uniform> uniforms: Uniforms;

// 8-neighbor direction offsets: N, NE, E, SE, S, SW, W, NW
const dirDx = array<i32, 8>(0, 1, 1, 1, 0, -1, -1, -1);
const dirDy = array<i32, 8>(1, 1, 0, -1, -1, -1, 0, 1);
// Distance scaling: cardinal = 1.0, diagonal = 1/sqrt(2)
const dirDist = array<f32, 8>(1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071);
// Normalized direction vectors for momentum bias
const dirNx = array<f32, 8>(0.0, 0.7071, 1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071);
const dirNy = array<f32, 8>(1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071, 0.0, 0.7071);

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let div = 1.0 / uniforms.u_SimRes;
    let coord = vec2<i32>(global_id.xy);

    let curTerrain = textureLoad(readTerrain, coord, 0);
    let curLava = textureLoad(readLava, coord, 0);
    let curCoolLava = textureLoad(readCoolLava, coord, 0).r;
    let curBasalt = textureLoad(readBasalt, coord, 0).r;

    let lavaHeight = curLava.r;
    let temperature = curLava.g;
    let viscosity_val = curLava.b;

    // No lava → zero flux
    if (lavaHeight < 0.0001) {
        textureStore(writeLavaFlux, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        textureStore(writeLavaFlux2, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        return;
    }

    // Surface height = terrain + basalt + coolLava + water + lava
    let surfaceHeight = curTerrain.r + curBasalt + curCoolLava + curTerrain.g + lavaHeight;

    // Gravity constant (same as water)
    let g = 0.80;
    let pipeLen = uniforms.u_PipeLen;
    let pipeArea = uniforms.u_PipeArea;
    let dt = uniforms.u_timestep;

    // Viscosity damping: scales the gravity-driven acceleration term only.
    // Existing flux momentum persists — viscosity slows how fast NEW flow builds.
    let viscDamping = 1.0 / (1.0 + viscosity_val * uniforms.u_ViscosityScale);

    // Yield stress: minimum dh required to flow (Bingham plastic)
    let coolingYield = max(0.0, viscosity_val - 0.6);
    let yieldThreshold = uniforms.u_YieldStress * coolingYield;

    // Read previous flux values (flux persists across frames — this is the key difference
    // from the old model. Flux accumulates like momentum, enabling proper pipe flow.)
    let prevFlux1 = textureLoad(readLavaFlux, coord, 0);
    let prevFlux2 = textureLoad(readLavaFlux2, coord, 0);
    var prevFlux: array<f32, 8>;
    prevFlux[0] = prevFlux1.r; // N
    prevFlux[1] = prevFlux1.g; // NE
    prevFlux[2] = prevFlux1.b; // E
    prevFlux[3] = prevFlux1.a; // SE
    prevFlux[4] = prevFlux2.r; // S
    prevFlux[5] = prevFlux2.g; // SW
    prevFlux[6] = prevFlux2.b; // W
    prevFlux[7] = prevFlux2.a; // NW

    // Gentle viscous drag: gradually decelerates flow at high viscosity.
    // Hot lava (visc≈0): drag≈1.0, no friction. Cool lava (visc≈4): drag≈0.96, slow deceleration.
    // Much gentler than the old model which destroyed 77% of flux per frame.
    let viscDrag = 1.0 - 0.01 * viscosity_val;
    let thermalOverride = clamp(temperature * 2.0 - 0.5, 0.0, 1.0);
    let effectiveCrustStrength = uniforms.u_CrustStrength * (1.0 - thermalOverride);

    let curVel = textureLoad(readLavaVel, coord, 0).xy;
    let curVelMag = length(curVel);
    let momentumInfluence = clamp(uniforms.u_MomentumStrength, 0.0, 1.0) * 0.5;

    // Compute new flux per direction using the pipe model:
    // f_new = max(0, f_old * drag + dt * g * A * dh / L * viscDamping)
    // Viscosity damps ACCELERATION only. Existing flux persists with gentle drag.
    var flux: array<f32, 8>;
    var totalFlux: f32 = 0.0;

    for (var d: i32 = 0; d < 8; d++) {
        let nx = coord.x + dirDx[d];
        let ny = coord.y + dirDy[d];

        if (nx < 0 || nx >= i32(uniforms.u_SimRes) || ny < 0 || ny >= i32(uniforms.u_SimRes)) {
            flux[d] = 0.0;
            continue;
        }

        let nCoord = vec2<i32>(nx, ny);
        let nTerrain = textureLoad(readTerrain, nCoord, 0);
        let nLava = textureLoad(readLava, nCoord, 0);
        let nCoolLava = textureLoad(readCoolLava, nCoord, 0).r;
        let nBasalt = textureLoad(readBasalt, nCoord, 0).r;

        let nSurfaceHeight = nTerrain.r + nBasalt + nCoolLava + nTerrain.g + nLava.r;
        let dh = surfaceHeight - nSurfaceHeight;

        // Directional channeling terms (previously unused controls).
        // These help low-iteration runs avoid vent pileup by biasing transport:
        // deeper downhill paths, aligned momentum, and terrain noise resistance.
        let terrainDiff = clamp(curTerrain.r - nTerrain.r, -0.08, 0.08);
        let depthBoost = pow(2.0, terrainDiff * uniforms.u_DepthBoostStrength * 0.5);

        var momentumBias: f32 = 1.0;
        if (curVelMag > 0.001) {
            let aligned = (curVel.x * dirNx[d] + curVel.y * dirNy[d]) / curVelMag;
            momentumBias = clamp(1.0 + aligned * momentumInfluence, 0.5, 1.5);
        }

        let noiseVal = textureLoad(readNoise, nCoord, 0).r;
        let noiseBias = pow(clamp(noiseVal, 0.05, 1.0), uniforms.u_NoiseResistPower * 0.35);
        let channelGain = depthBoost * momentumBias * noiseBias;

        // Yield + crust gate: cooler crusted neighbors resist inflow.
        let barrier = yieldThreshold + nLava.a * effectiveCrustStrength;
        let effectiveDh = select(dh, 0.0, dh < barrier);

        // Pipe model: accumulate flux with viscosity-damped acceleration
        // Existing flux persists (with gentle drag), new acceleration is scaled by viscosity
        let effectivePipeLen = pipeLen / dirDist[d];
        let accel = dt * g * pipeArea * effectiveDh * channelGain / effectivePipeLen;
        flux[d] = max(0.0, prevFlux[d] * viscDrag + accel * viscDamping);
        totalFlux += flux[d];
    }

    // Conservation: scale fluxes so total outflow doesn't exceed available lava volume
    // Same formula as water: k = min(1, lavaH * L² / (dt * totalFlux))
    let maxOutflow = lavaHeight * pipeLen * pipeLen;
    let scaledOutflow = dt * totalFlux;
    if (scaledOutflow > 0.0) {
        let k = min(1.0, maxOutflow / scaledOutflow);
        for (var d: i32 = 0; d < 8; d++) {
            flux[d] *= k;
        }
    }

    // Boundary conditions
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        for (var d: i32 = 0; d < 8; d++) {
            flux[d] = 0.0;
        }
    }

    // Pack into two flux textures:
    // flux1: vec4(N, NE, E, SE)  — directions 0,1,2,3
    // flux2: vec4(S, SW, W, NW)  — directions 4,5,6,7
    textureStore(writeLavaFlux, coord, vec4<f32>(flux[0], flux[1], flux[2], flux[3]));
    textureStore(writeLavaFlux2, coord, vec4<f32>(flux[4], flux[5], flux[6], flux[7]));
}
