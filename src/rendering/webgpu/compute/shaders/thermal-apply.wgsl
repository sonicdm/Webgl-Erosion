@group(0) @binding(0) var readTerrainFlux: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    unif_thermalErosionScale: f32,
    u_RockErosionResistance: f32,
    u_BasaltErosionResistance: f32,
    _pad0: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var readBasalt: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let topflux = textureLoad(readTerrainFlux, coord + vec2<i32>(0, 1), 0);
    let rightflux = textureLoad(readTerrainFlux, coord + vec2<i32>(1, 0), 0);
    let bottomflux = textureLoad(readTerrainFlux, coord + vec2<i32>(0, -1), 0);
    let leftflux = textureLoad(readTerrainFlux, coord + vec2<i32>(-1, 0), 0);
    let outputflux = textureLoad(readTerrainFlux, coord, 0);

    let inputflux = vec4<f32>(topflux.z, rightflux.w, bottomflux.x, leftflux.y);
    let vol = inputflux.x + inputflux.y + inputflux.z + inputflux.w - outputflux.x - outputflux.y - outputflux.z - outputflux.w;

    let thermalErosionScale = uniforms.unif_thermalErosionScale;
    let tdelta = min(50.0, uniforms.u_timestep * thermalErosionScale) * vol;

    let curTerrain = textureLoad(readTerrain, coord, 0);

    // Rock-awareness: reduce thermal erosion on rock cells
    let rockVal = curTerrain.z;
    let rockStrength = clamp((rockVal - 0.1) / 0.9, 0.0, 1.0);
    var rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, rockVal > 0.1);

    // Basalt erosion resistance: porous/brittle volcanic rock
    let basaltHeight = textureLoad(readBasalt, coord, 0).r;
    if (basaltHeight > 0.01) {
        let basaltStrength = clamp(basaltHeight * 10.0, 0.0, 1.0);
        rockFactor *= (1.0 - uniforms.u_BasaltErosionResistance * basaltStrength);
    }

    // Boundary protection: skip thermal erosion at edges
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    var safeDelta = tdelta * rockFactor;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        safeDelta = 0.0;
    }

    textureStore(writeTerrain, coord, vec4<f32>(curTerrain.x + safeDelta, curTerrain.y, curTerrain.z, curTerrain.w));
}
