@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeMaxSlippage: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    unif_TalusScale: f32,
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let terraintop = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let terrainright = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let terrainbottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let terrainleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let terraincur = textureLoad(readTerrain, coord, 0);

    let _maxHeightDiff = uniforms.unif_TalusScale;
    let maxLocalDiff = _maxHeightDiff * 0.01;
    var avgDiff = (terraintop.x + terrainright.x + terrainbottom.x + terrainleft.x) * 0.25 - terraincur.x;
    avgDiff = 10.0 * max(abs(avgDiff) - maxLocalDiff, 0.0);

    // Boundary: at edges, use max slippage (no thermal erosion) to prevent artifacts from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    var result = max(_maxHeightDiff - avgDiff, 0.0);
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        result = _maxHeightDiff;
    }

    textureStore(writeMaxSlippage, coord, vec4<f32>(result, 0.0, 0.0, 1.0));
}
