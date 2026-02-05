@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readMaxSlippage: texture_2d<f32>;
@group(0) @binding(2) var writeTerrainFlux: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    unif_thermalRate: f32,
    u_RockErosionResistance: f32,
    u_BasaltErosionResistance: f32,
    _pad0: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var readBasalt: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let terraintop = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let terrainright = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let terrainbottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let terrainleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let terraincur = textureLoad(readTerrain, coord, 0);

    // Rock-awareness: reduce thermal flux from rock cells
    let rockVal = terraincur.z;
    let rockStrength = clamp((rockVal - 0.1) / 0.9, 0.0, 1.0);
    var rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, rockVal > 0.1);

    // Basalt erosion resistance: porous/brittle volcanic rock
    let basaltHeight = textureLoad(readBasalt, coord, 0).r;
    if (basaltHeight > 0.01) {
        let basaltStrength = clamp(basaltHeight * 10.0, 0.0, 1.0);
        rockFactor *= (1.0 - uniforms.u_BasaltErosionResistance * basaltStrength);
    }

    let slippagetop = textureLoad(readMaxSlippage, coord + vec2<i32>(0, 1), 0).x;
    let slippageright = textureLoad(readMaxSlippage, coord + vec2<i32>(1, 0), 0).x;
    let slippagebottom = textureLoad(readMaxSlippage, coord + vec2<i32>(0, -1), 0).x;
    let slippageleft = textureLoad(readMaxSlippage, coord + vec2<i32>(-1, 0), 0).x;
    let slippagecur = textureLoad(readMaxSlippage, coord, 0).x;

    var diff = vec4<f32>(
        terraincur.x - terraintop.x - (slippagecur + slippagetop) * 0.5,
        terraincur.x - terrainright.x - (slippagecur + slippageright) * 0.5,
        terraincur.x - terrainbottom.x - (slippagecur + slippagebottom) * 0.5,
        terraincur.x - terrainleft.x - (slippagecur + slippageleft) * 0.5
    );
    diff = max(diff, vec4<f32>(0.0));

    var newFlow = diff * 1.2 * rockFactor;

    var outfactor = (newFlow.x + newFlow.y + newFlow.z + newFlow.w) * uniforms.u_timestep;
    if (outfactor > 1e-5) {
        outfactor = terraincur.x / outfactor;
        if (outfactor > 1.0) { outfactor = 1.0; }
        newFlow = newFlow * outfactor;
    }

    // Boundary protection: zero thermal flux at edges to prevent erosion from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        newFlow = vec4<f32>(0.0);
    }

    textureStore(writeTerrainFlux, coord, newFlow);
}
