@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var writeLava: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_BrushSize: f32,
    u_BrushStrength: f32,
    u_BrushType: i32,
    u_BrushPos: vec2<f32>,
    u_BrushPressed: i32,
    u_BrushOperation: i32,
    u_EmissionTemp: f32,
    u_SourceCount: i32,
    u_Time: f32,
    _padding: f32,
};

struct SourceData {
    positions: array<vec2<f32>, 16>,
    sizes: array<f32, 16>,
    strengths: array<f32, 16>,
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> sources: SourceData;

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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readLava);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let cur = textureLoad(readLava, vec2<i32>(global_id.xy), 0);

    var addLava: f32 = 0.0;
    var temperature = cur.g;
    var viscosity = cur.b;
    var crust = cur.a;

    // Lava brush (type 7)
    if (uniforms.u_BrushType == 7 && uniforms.u_BrushPressed == 1) {
        let pdis = distance(uniforms.u_BrushPos, uv);
        let brushRadius = 0.01 * uniforms.u_BrushSize;
        if (pdis < brushRadius) {
            let dens = max(0.0, (brushRadius - pdis * 0.5) / brushRadius);
            let nv = noise2D(uv * 50.0 + vec2<f32>(sin(uniforms.u_Time * 5.0), cos(uniforms.u_Time * 15.0)));
            let amount = 0.0006 * uniforms.u_BrushStrength * dens * 200.0;
            if (uniforms.u_BrushOperation == 0) {
                addLava = amount * (0.5 + 0.5 * nv);
                if (addLava > 0.0 && cur.r + addLava > 0.001) {
                    let totalLava = cur.r + addLava;
                    temperature = (cur.g * cur.r + uniforms.u_EmissionTemp * addLava) / totalLava;
                    crust = 0.0;
                }
            } else {
                addLava = -amount;
            }
        }
    }

    // Persistent lava sources
    for (var i: i32 = 0; i < uniforms.u_SourceCount; i++) {
        let srcPos = sources.positions[i];
        let pdis = distance(srcPos, uv);
        let srcRadius = 0.01 * sources.sizes[i];
        if (pdis < srcRadius) {
            let dens = (srcRadius - pdis) / srcRadius;
            let nv = noise2D(uv * 100.0 + vec2<f32>(sin(uniforms.u_Time * 3.0), cos(uniforms.u_Time * 7.0)));
            let sourceAmount = 0.0006 * sources.strengths[i] * dens * 200.0 * (0.5 + 0.5 * nv);
            addLava += sourceAmount;
            if (sourceAmount > 0.0) {
                let totalLava = max(cur.r + addLava, 0.001);
                temperature = (temperature * (totalLava - sourceAmount) + uniforms.u_EmissionTemp * sourceAmount) / totalLava;
                crust = max(0.0, crust - sourceAmount * 2.0);
            }

            // Vent area stays at near-emission temperature regardless of pool size.
            // Cooling can't propagate back to the source — the vent continuously
            // reheats. Full strength at center, fading at radius edge.
            let minSourceTemp = uniforms.u_EmissionTemp * 0.9;
            temperature = max(temperature, minSourceTemp * dens);
        }
    }

    let finalLava = max(cur.r + addLava, 0.0);
    if (finalLava < 0.0001) {
        temperature = 0.0;
        viscosity = 0.0;
        crust = 0.0;
    }

    textureStore(writeLava, vec2<i32>(global_id.xy), vec4<f32>(finalLava, temperature, viscosity, crust));
}
