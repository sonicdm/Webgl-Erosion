@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readLava: texture_2d<f32>;
@group(0) @binding(2) var readLavaFlux: texture_2d<f32>;
@group(0) @binding(3) var writeLavaFlux: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var readLavaVel: texture_2d<f32>;
@group(0) @binding(5) var readNoise: texture_2d<f32>;
@group(0) @binding(6) var readCoolLava: texture_2d<f32>;
@group(0) @binding(7) var readBasalt: texture_2d<f32>;
@group(0) @binding(8) var writeLavaFlux2: texture_storage_2d<rgba32float, write>;

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

@group(0) @binding(9) var<uniform> uniforms: Uniforms;

// 8-neighbor direction offsets: N, NE, E, SE, S, SW, W, NW
const dirDx = array<i32, 8>(0, 1, 1, 1, 0, -1, -1, -1);
const dirDy = array<i32, 8>(1, 1, 0, -1, -1, -1, 0, 1);
// Distance scaling: cardinal = 1.0, diagonal = 1/sqrt(2)
const dirDist = array<f32, 8>(1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071);
// Normalized direction vectors for momentum dot product
const dirNx = array<f32, 8>(0.0, 0.7071, 1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071);
const dirNy = array<f32, 8>(1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071, 0.0, 0.7071);

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let div = 1.0 / uniforms.u_SimRes;
    let g = 0.80;
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

    // Hot-over-cool: only mobile (hot) lava can flow out
    let mobileFrac = clamp(temperature * 2.0, 0.0, 1.0);
    let mobileLava = lavaHeight * mobileFrac;

    // Surface height = terrain + basalt + coolLava + water + lava
    let surfaceHeight = curTerrain.r + curBasalt + curCoolLava + curTerrain.g + lavaHeight;

    // Viscosity factor (Stokes regime)
    let viscFactor = 1.0 / (1.0 + viscosity_val * uniforms.u_ViscosityScale);

    let flowCoeff = g * uniforms.u_PipeArea / uniforms.u_PipeLen;

    // Read current velocity for momentum bias
    let vel = textureLoad(readLavaVel, coord, 0).xy;
    let vMag = length(vel);
    let momInfluence = uniforms.u_MomentumStrength * clamp(vMag * 3.0, 0.0, 1.0);

    // Yield stress (Bingham plastic)
    let coolingYield = max(0.0, viscosity_val - 0.6);
    let yieldThreshold = uniforms.u_YieldStress * coolingYield;

    // Crust barrier: hot lava overrides crust
    let thermalOverride = clamp(temperature * 2.0 - 0.5, 0.0, 1.0);
    let effectiveCrustStr = uniforms.u_CrustStrength * (1.0 - thermalOverride);

    // Compute flux for all 8 directions
    var flux: array<f32, 8>;

    for (var d: i32 = 0; d < 8; d++) {
        let nx = coord.x + dirDx[d];
        let ny = coord.y + dirDy[d];
        let nCoord = vec2<i32>(nx, ny);

        // Boundary check
        if (nx < 0 || nx >= i32(uniforms.u_SimRes) || ny < 0 || ny >= i32(uniforms.u_SimRes)) {
            flux[d] = 0.0;
            continue;
        }

        let nTerrain = textureLoad(readTerrain, nCoord, 0);
        let nLava = textureLoad(readLava, nCoord, 0);
        let nCoolLava = textureLoad(readCoolLava, nCoord, 0).r;
        let nBasalt = textureLoad(readBasalt, nCoord, 0).r;

        // Neighbor surface height includes all layers
        let nSurfaceHeight = nTerrain.r + nBasalt + nCoolLava + nTerrain.g + nLava.r;

        let dh = surfaceHeight - nSurfaceHeight;
        if (dh <= 0.0) {
            flux[d] = 0.0;
            continue;
        }

        // DEPTH BOOST: Exponential preference for deeper channels
        let terrainDiff = clamp(curTerrain.r - nTerrain.r, -0.1, 0.1);
        let depthBoost = pow(2.0, terrainDiff * uniforms.u_DepthBoostStrength);

        // NOISE RESISTANCE: Cubed noise for extreme selectivity
        let noiseVal = textureLoad(readNoise, nCoord, 0).r;
        let noiseResist = pow(noiseVal, uniforms.u_NoiseResistPower);

        // MOMENTUM BIAS: Velocity alignment preference
        var momBias: f32 = 1.0;
        if (vMag > 0.001) {
            let dotProd = (vel.x * dirNx[d] + vel.y * dirNy[d]) / vMag;
            momBias = max(0.05, 1.0 + dotProd * momInfluence);
        }

        // Yield + crust barrier
        let nBarrier = yieldThreshold + nLava.a * effectiveCrustStr;
        if (abs(dh) < nBarrier) {
            flux[d] = 0.0;
            continue;
        }

        // Combined flux: dh * viscosity * gravity * distance * channeling factors
        flux[d] = max(0.0, flowCoeff * dh * viscFactor * dirDist[d] * momBias * depthBoost * noiseResist);
    }

    // Conservation factor — only mobile (hot) lava can flow out
    var totalFlux: f32 = 0.0;
    for (var d: i32 = 0; d < 8; d++) {
        totalFlux += flux[d];
    }
    let lavaOut = uniforms.u_timestep * totalFlux;
    let k = min(1.0, (mobileLava * uniforms.u_PipeLen * uniforms.u_PipeLen) / max(lavaOut, 0.0001));
    for (var d: i32 = 0; d < 8; d++) {
        flux[d] *= k;
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
