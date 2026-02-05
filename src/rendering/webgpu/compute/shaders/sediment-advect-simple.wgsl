@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSediment: texture_2d<f32>;
@group(0) @binding(2) var readSedimentBlend: texture_2d<f32>;
@group(0) @binding(3) var readTerrain: texture_2d<f32>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var writeVel: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var writeSedimentBlend: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
    unif_advectMultiplier: f32,
};

@group(0) @binding(7) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = vec2<f32>(f32(textureDimensions(readSediment).x), f32(textureDimensions(readSediment).y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;

    let curvel = textureLoad(readVel, coord, 0);
    let cursedi = textureLoad(readSediment, coord, 0);
    let curterrain = textureLoad(readTerrain, coord, 0);

    var useVel = curvel / uniforms.u_SimRes;
    useVel = useVel * uniforms.unif_advectMultiplier * 0.5;

    let oldloc = vec2<f32>(
        curuv.x - useVel.x * uniforms.u_timestep,
        curuv.y - useVel.y * uniforms.u_timestep
    );
    let uv_tex = oldloc * dim - 0.5;
    let i0 = clamp(i32(floor(uv_tex.x)), 0, i32(dim.x) - 1);
    let j0 = clamp(i32(floor(uv_tex.y)), 0, i32(dim.y) - 1);
    let i1 = min(i0 + 1, i32(dim.x) - 1);
    let j1 = min(j0 + 1, i32(dim.y) - 1);
    let fx = fract(uv_tex.x);
    let fy = fract(uv_tex.y);
    let v00 = textureLoad(readSediment, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readSediment, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readSediment, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readSediment, vec2<i32>(i1, j1), 0);
    let oldsedi = mix(mix(v00.x, v10.x, fx), mix(v01.x, v11.x, fx), fy);

    let curSediVal = cursedi.x * curterrain.y * 0.1;
    let sediBlendVal = textureLoad(readSedimentBlend, coord, 0).x;
    let newSediBlendVal = (sediBlendVal * 1660.0 + curSediVal) / 1661.0;

    textureStore(writeSediment, coord, vec4<f32>(oldsedi, 0.0, 0.0, 1.0));
    textureStore(writeVel, coord, curvel);
    textureStore(writeSedimentBlend, coord, vec4<f32>(newSediBlendVal, 0.0, 0.0, 1.0));
}
