// Rain precipitation compute shader
// Ported from rain-frag.glsl

@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_Time: f32,
    raindeg: f32,
    u_SimRes: f32,
    u_MouseWorldPos: vec4<f32>,
    u_MouseWorldDir: vec3<f32>,
    u_BrushSize: f32,
    u_BrushStrength: f32,
    u_BrushType: i32,
    u_BrushPressed: i32,
    u_BrushPos: vec2<f32>,
    u_BrushOperation: i32,
    u_RainErosion: i32,
    u_RainErosionStrength: f32,
    u_RainErosionDropSize: f32,
    u_FlattenTargetHeight: f32,
    u_SlopeStartPos: vec2<f32>,
    u_SlopeEndPos: vec2<f32>,
    u_SlopeActive: i32,
    u_SourceCount: i32,
    _padding: f32,
};

struct SourceData {
    positions: array<vec2<f32>, 16>,
    sizes: array<f32, 16>,
    strengths: array<f32, 16>,
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> sources: SourceData;

const OCTAVES: i32 = 6;

fn random(st: vec2<f32>) -> f32 {
    return fract(sin(dot(st.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453123);
}

fn noise2D(st: vec2<f32>) -> f32 {
    let i = floor(st);
    let f = fract(st);
    let a = random(i);
    let b = random(i + vec2<f32>(1.0, 0.0));
    let c = random(i + vec2<f32>(0.0, 1.0));
    let d = random(i + vec2<f32>(1.0, 1.0));
    let u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

fn mod289(x: f32) -> f32 {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_vec4(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn perm(x: vec4<f32>) -> vec4<f32> {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

fn noise3D(p: vec3<f32>) -> f32 {
    let a = floor(p);
    let d = p - a;
    let d_smooth = d * d * (3.0 - 2.0 * d);
    let b = a.xxyy + vec4<f32>(0.0, 1.0, 0.0, 1.0);
    let k1 = perm(b.xyxy);
    let k2 = perm(k1.xyxy + b.zzww);
    let c = k2 + a.zzzz;
    let k3 = perm(c);
    let k4 = perm(c + 1.0);
    let o1 = fract(k3 * (1.0 / 41.0));
    let o2 = fract(k4 * (1.0 / 41.0));
    let o3 = o2 * d_smooth.z + o1 * (1.0 - d_smooth.z);
    let o4 = o3.yw * d_smooth.x + o3.xz * (1.0 - d_smooth.x);
    return o4.y * d_smooth.y + o4.x * (1.0 - d_smooth.y);
}

fn fbm(st: vec2<f32>) -> f32 {
    var value: f32 = 0.0;
    var amplitude: f32 = 0.5;
    var st_var = st;
    for (var i: i32 = 0; i < OCTAVES; i++) {
        value += amplitude * noise2D(st_var);
        st_var *= 2.0;
        amplitude *= 0.53;
    }
    return value;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let cur = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    var currentHeight = cur.x;
    var addterrain: f32 = 0.0;
    var addwater: f32 = 0.0;
    let amount = 0.0006 * uniforms.u_BrushStrength;
    let aw = fbm(uv * 10.0 + vec2<f32>(sin(uniforms.u_Time * 35.0), cos(uniforms.u_Time * 115.0)));

    if (uniforms.u_BrushType != 0 && uniforms.u_BrushPressed == 1) {
        let pointOnPlane = uniforms.u_BrushPos;
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * uniforms.u_BrushSize) {
            var dens = (0.01 * uniforms.u_BrushSize - pdis2fragment * 0.5) / (0.01 * uniforms.u_BrushSize);
            dens = max(0.0, dens);
            if (uniforms.u_BrushType == 1) {
                addterrain = amount * 1.0 * 280.0;
                if (uniforms.u_BrushOperation == 1) { addterrain = -addterrain; }
            } else if (uniforms.u_BrushType == 2) {
                addwater = amount * dens * 200.0 * aw;
                if (uniforms.u_BrushOperation == 1) { addwater = -addwater; }
            } else if (uniforms.u_BrushType == 4 && uniforms.u_BrushOperation == 0) {
                let top = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, 1), 0);
                let right = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(1, 0), 0);
                let bottom = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, -1), 0);
                let left = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(-1, 0), 0);
                let avgHeight = (top.x + right.x + bottom.x + left.x) / 4.0;
                addterrain = (avgHeight - currentHeight) * dens * uniforms.u_BrushStrength * 0.1;
            } else if (uniforms.u_BrushType == 5 && uniforms.u_BrushOperation == 0) {
                let targetHeightTextureSpace = uniforms.u_FlattenTargetHeight * (2000.30 / 500.0);
                addterrain = (targetHeightTextureSpace - currentHeight) * dens * uniforms.u_BrushStrength * 0.2;
            } else if (uniforms.u_BrushType == 6 && uniforms.u_SlopeActive == 2) {
                let slopeDir = uniforms.u_SlopeEndPos - uniforms.u_SlopeStartPos;
                let slopeLength = length(slopeDir);
                if (slopeLength > 0.001) {
                    let slopeDirNorm = normalize(slopeDir);
                    let toCurrent = uv - uniforms.u_SlopeStartPos;
                    let projDist = dot(toCurrent, slopeDirNorm);
                    let startIdx = vec2<i32>(i32(uniforms.u_SlopeStartPos.x * f32(texture_size.x)), i32(uniforms.u_SlopeStartPos.y * f32(texture_size.y)));
                    let endIdx = vec2<i32>(i32(uniforms.u_SlopeEndPos.x * f32(texture_size.x)), i32(uniforms.u_SlopeEndPos.y * f32(texture_size.y)));
                    let startTerrain = textureLoad(readTerrain, startIdx, 0);
                    let endTerrain = textureLoad(readTerrain, endIdx, 0);
                    let t = clamp(projDist / slopeLength, 0.0, 1.0);
                    let targetHeight = mix(startTerrain.x, endTerrain.x, t);
                    let distToBrush = distance(uv, uniforms.u_BrushPos);
                    let brushRadius = 0.01 * uniforms.u_BrushSize;
                    if (distToBrush < brushRadius) {
                        dens = max(0.0, (brushRadius - distToBrush) / brushRadius);
                        addterrain = (targetHeight - currentHeight) * dens * uniforms.u_BrushStrength * 0.3;
                    }
                }
            }
        }
    }

    if (uniforms.u_RainErosion == 1 && uniforms.u_Time % 5.0 == 1.0) {
        let smallradius = 0.025 * uniforms.u_RainErosionDropSize;
        let rdx = random(vec2<f32>(30.0, cos(uniforms.u_Time)));
        let rdy = random(vec2<f32>(uniforms.u_Time, 10.0));
        let rdr = random(vec2<f32>(20.0, uniforms.u_Time * 10.0));
        let dis2small = distance(vec2<f32>(rdx, rdy), uv);
        if (dis2small < smallradius) {
            addwater += 0.06 * uniforms.u_RainErosionStrength * (1.0 + 5.0 * rdr);
        }
    }

    var rain = 0.0;
    for (var i: i32 = 0; i < uniforms.u_SourceCount; i++) {
        let pointOnPlane = sources.positions[i];
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * sources.sizes[i]) {
            let dens = (0.01 * sources.sizes[i] - pdis2fragment) / (0.01 * sources.sizes[i]);
            var sourceWater = 0.0006 * sources.strengths[i] * dens * 280.0;
            sourceWater *= fbm(uv * 200.0 + vec2<f32>(sin(uniforms.u_Time * 5.0), cos(uniforms.u_Time * 15.0)));
            addwater += sourceWater;
        }
    }

    var rockMaterial = cur.z;
    var baseRockSurfaceHeight = cur.w;
    if (uniforms.u_BrushType == 3 && uniforms.u_BrushPressed == 1) {
        let pointOnPlane = uniforms.u_BrushPos;
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * uniforms.u_BrushSize) {
            var dens = max(0.0, (0.01 * uniforms.u_BrushSize - pdis2fragment * 0.5) / (0.01 * uniforms.u_BrushSize));
            let mixFactor = min(dens * uniforms.u_BrushStrength * 2.0, 1.0);
            if (uniforms.u_BrushOperation == 0) {
                rockMaterial = max(rockMaterial, mix(rockMaterial, 1.0, mixFactor));
                if (rockMaterial > 0.5 && mixFactor > 0.01) {
                    baseRockSurfaceHeight = min(max(cur.x + addterrain, -0.10), 2000.30);
                }
            } else {
                rockMaterial = min(rockMaterial, mix(rockMaterial, 0.0, mixFactor));
                if (rockMaterial < 0.1) { baseRockSurfaceHeight = 0.0; }
            }
        }
    }

    let finalHeight = min(max(cur.x + addterrain, -0.10), 2000.30);
    let finalWater = max(cur.y + rain * uniforms.raindeg + addwater, 0.0);
    textureStore(writeTerrain, vec2<i32>(global_id.xy), vec4<f32>(finalHeight, finalWater, rockMaterial, baseRockSurfaceHeight));
}


