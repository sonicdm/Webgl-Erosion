@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSediment: texture_2d<f32>;
@group(0) @binding(2) var readSedimentAdvectA: texture_2d<f32>;
@group(0) @binding(3) var readSedimentAdvectB: texture_2d<f32>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;

@group(0) @binding(6) var readTerrain: texture_2d<f32>;
@group(0) @binding(7) var readSedimentBlend: texture_2d<f32>;
@group(0) @binding(8) var writeSedimentBlend: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
};

@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = f32(textureDimensions(readSediment).x);
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(dim, dim);

    let curvel = textureLoad(readVel, coord, 0);
    let targetPos = curuv * dim - uniforms.u_timestep * curvel.xy;
    let st_xy = floor(targetPos - 0.5) + 0.5;
    let st_zw = st_xy + 1.0;
    let st_xy_i = vec2<i32>(i32(st_xy.x), i32(st_xy.y));
    let st_zy_i = vec2<i32>(i32(st_zw.x), i32(st_xy.y));
    let st_xw_i = vec2<i32>(i32(st_xy.x), i32(st_zw.y));
    let st_zw_i = vec2<i32>(i32(st_zw.x), i32(st_zw.y));
    let dim_i = i32(dim);
    let nodeVal0 = textureLoad(readSediment, clamp(st_xy_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal1 = textureLoad(readSediment, clamp(st_zy_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal2 = textureLoad(readSediment, clamp(st_xw_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal3 = textureLoad(readSediment, clamp(st_zw_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let clampMin = min(min(min(nodeVal0, nodeVal1), nodeVal2), nodeVal3);
    let clampMax = max(max(max(nodeVal0, nodeVal1), nodeVal2), nodeVal3);

    let sediment = textureLoad(readSediment, coord, 0).x;
    let advectA = textureLoad(readSedimentAdvectA, coord, 0).x;
    let advectB = textureLoad(readSedimentAdvectB, coord, 0).x;
    var res = advectA + 0.5 * (sediment - advectB);
    res = clamp(res, clampMin, clampMax);

    textureStore(writeSediment, coord, vec4<f32>(res, 0.0, 0.0, 1.0));

    // Sediment blend accumulation (flow trace data) — matches simple advection formula
    let curTerrain = textureLoad(readTerrain, coord, 0);
    let curSediVal = sediment * curTerrain.y * 0.1;
    let sediBlendVal = textureLoad(readSedimentBlend, coord, 0).x;
    let newSediBlendVal = (sediBlendVal * 1660.0 + curSediVal) / 1661.0;
    textureStore(writeSedimentBlend, coord, vec4<f32>(newSediBlendVal, 0.0, 0.0, 1.0));
}
