@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var writeAvg: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    unif_ErosionMode: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let diagonalWeight = 0.707;
    var threathhold = 0.1;

    let cur = textureLoad(readTerrain, coord, 0);
    let top = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let topright = textureLoad(readTerrain, coord + vec2<i32>(1, 1), 0);
    let right = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let bottomright = textureLoad(readTerrain, coord + vec2<i32>(1, -1), 0);
    let bottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let bottomleft = textureLoad(readTerrain, coord + vec2<i32>(-1, -1), 0);
    let left = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let topleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 1), 0);

    let t_d = cur.x - top.x;
    let r_d = cur.x - right.x;
    let b_d = cur.x - bottom.x;
    let l_d = cur.x - left.x;
    let tr_d = cur.x - topright.x;
    let br_d = cur.x - bottomright.x;
    let bl_d = cur.x - bottomleft.x;
    let tl_d = cur.x - topleft.x;

    var avg_hdiff = t_d + r_d + b_d + l_d + (tr_d + br_d + bl_d + tl_d) * diagonalWeight;
    avg_hdiff = avg_hdiff / (4.0 * (1.0 + diagonalWeight));
    avg_hdiff = abs(avg_hdiff);

    var avg_hdiff_4 = t_d + r_d + b_d + l_d;
    avg_hdiff_4 = avg_hdiff_4 / 4.0;
    avg_hdiff_4 = abs(avg_hdiff_4);

    if (uniforms.unif_ErosionMode == 1.0) {
        threathhold = avg_hdiff / 2.0;
    } else if (uniforms.unif_ErosionMode == 2.0) {
        threathhold = pow(avg_hdiff, 3.0);
    }

    var cur_h = cur.x;
    var col = 0.0;
    let curWeight = 8.0;

    // Skip smoothing for rock cells (rock resists all erosion types)
    let rockVal = cur.z;
    let isRock = rockVal > 0.1;

    if (!isRock && (((abs(r_d) > threathhold && abs(l_d) > threathhold) && r_d * l_d > 0.0) ||
        ((abs(t_d) > threathhold && abs(b_d) > threathhold) && t_d * b_d > 0.0) ||
        ((abs(tr_d) > threathhold && abs(bl_d) > threathhold) && tr_d * bl_d > 0.0) ||
        ((abs(tl_d) > threathhold && abs(br_d) > threathhold) && tl_d * br_d > 0.0))) {
        cur_h = (cur.x * curWeight + top.x + right.x + bottom.x + left.x + topright.x * diagonalWeight + topleft.x * diagonalWeight + bottomleft.x * diagonalWeight + bottomright.x * diagonalWeight) / (4.0 * (1.0 + diagonalWeight) + curWeight);
        col = 1.0;
    }

    // Boundary protection: skip smoothing at edges to prevent artifacts from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        cur_h = cur.x;
        col = 0.0;
    }

    textureStore(writeTerrain, coord, vec4<f32>(cur_h, cur.y, cur.z, cur.w));
    textureStore(writeAvg, coord, vec4<f32>(col, col, col, 1.0));
}
