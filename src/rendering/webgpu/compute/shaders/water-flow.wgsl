@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readFlux: texture_2d<f32>;
@group(0) @binding(2) var readSedi: texture_2d<f32>;
@group(0) @binding(3) var writeFlux: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
};

@group(0) @binding(4) var<uniform> uniforms: Uniforms;
@group(0) @binding(5) var readCoolLava: texture_2d<f32>;
@group(0) @binding(6) var readBasalt: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let div = 1.0 / uniforms.u_SimRes;
    let g = 0.80;
    let pipelen = uniforms.u_PipeLen;
    let coord = vec2<i32>(global_id.xy);

    let top = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let right = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let bottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let left = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);

    let curTerrain = textureLoad(readTerrain, coord, 0);
    let curFlux = textureLoad(readFlux, coord, 0);

    // Solidified lava layers act as ground for water flow.
    // Without this, water flows under cooled lava / basalt (visible seam artifacts).
    let curCoolLava = textureLoad(readCoolLava, coord, 0).r;
    let curBasalt = textureLoad(readBasalt, coord, 0).r;
    let topCoolLava = textureLoad(readCoolLava, coord + vec2<i32>(0, 1), 0).r;
    let topBasalt = textureLoad(readBasalt, coord + vec2<i32>(0, 1), 0).r;
    let rightCoolLava = textureLoad(readCoolLava, coord + vec2<i32>(1, 0), 0).r;
    let rightBasalt = textureLoad(readBasalt, coord + vec2<i32>(1, 0), 0).r;
    let bottomCoolLava = textureLoad(readCoolLava, coord + vec2<i32>(0, -1), 0).r;
    let bottomBasalt = textureLoad(readBasalt, coord + vec2<i32>(0, -1), 0).r;
    let leftCoolLava = textureLoad(readCoolLava, coord + vec2<i32>(-1, 0), 0).r;
    let leftBasalt = textureLoad(readBasalt, coord + vec2<i32>(-1, 0), 0).r;

    let rockVal = curTerrain.z;
    let isRock = rockVal > 0.1;
    var effectivePipeLen = pipelen;
    if (isRock) {
        effectivePipeLen = pipelen * 0.4;
    }

    // Surface height = terrain + solidified lava layers + water
    let curSurface = curTerrain.x + curBasalt + curCoolLava + curTerrain.y;
    let topSurface = top.x + topBasalt + topCoolLava + top.y;
    let rightSurface = right.x + rightBasalt + rightCoolLava + right.y;
    let bottomSurface = bottom.x + bottomBasalt + bottomCoolLava + bottom.y;
    let leftSurface = left.x + leftBasalt + leftCoolLava + left.y;

    let Htopout = curSurface - topSurface;
    let Hrightout = curSurface - rightSurface;
    let Hbottomout = curSurface - bottomSurface;
    let Hleftout = curSurface - leftSurface;

    var ftopout = max(0.0, curFlux.x + (uniforms.u_timestep * g * uniforms.u_PipeArea * Htopout) / effectivePipeLen);
    var frightout = max(0.0, curFlux.y + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hrightout) / effectivePipeLen);
    var fbottomout = max(0.0, curFlux.z + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hbottomout) / effectivePipeLen);
    var fleftout = max(0.0, curFlux.w + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hleftout) / effectivePipeLen);

    let waterOut = uniforms.u_timestep * (ftopout + frightout + fbottomout + fleftout);
    let k = min(1.0, (curTerrain.y * uniforms.u_PipeLen * uniforms.u_PipeLen) / waterOut);

    ftopout *= k;
    frightout *= k;
    fbottomout *= k;
    fleftout *= k;

    // Boundary conditions
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        ftopout = 0.0;
        frightout = 0.0;
        fbottomout = 0.0;
        fleftout = 0.0;
    }

    textureStore(writeFlux, coord, vec4<f32>(ftopout, frightout, fbottomout, fleftout));
}
