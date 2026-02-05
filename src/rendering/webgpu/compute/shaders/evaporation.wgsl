@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> evapod: f32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let cur = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    let eva = 1.0 - evapod;
    textureStore(writeTerrain, vec2<i32>(global_id.xy), vec4<f32>(cur.x, cur.y * eva, cur.z, cur.w));
}
