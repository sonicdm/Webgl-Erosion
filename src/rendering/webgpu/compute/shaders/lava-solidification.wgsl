// Three-layer solidification system: Mobile Lava → Cool Lava → Basalt
// Basalt is a permanent separate surface that does NOT convert to terrain.
// Cool lava is frozen but can be re-melted by hot lava.

@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readCoolLava: texture_2d<f32>;
@group(0) @binding(2) var readBasalt: texture_2d<f32>;
@group(0) @binding(3) var readNoise: texture_2d<f32>;
@group(0) @binding(4) var readLavaVel: texture_2d<f32>;
@group(0) @binding(5) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var writeCoolLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var writeBasalt: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_CoolThreshold: f32,         // Default: 0.5 (T below this → cool lava)
    u_BasaltThreshold: f32,       // Default: 0.0 (T below this → basalt)
    u_CoolificationRate: f32,     // Default: 0.02/step
    u_BasaltificationRate: f32,   // Default: 0.01/step
    u_ReMeltRate: f32,            // Default: 0.05/step (cool → mobile)
    u_BasaltMeltRate: f32,        // Default: 0.005/step (basalt → mobile)
    u_NoiseModulation: f32,       // Default: 0.5 (noise affects crusting rate)
    _pad0: f32,
};

@group(0) @binding(8) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let curLava = textureLoad(readLava, coord, 0);
    let curCoolLava = textureLoad(readCoolLava, coord, 0).r;
    let curBasalt = textureLoad(readBasalt, coord, 0).r;
    let noise = textureLoad(readNoise, coord, 0).r;
    let speed = textureLoad(readLavaVel, coord, 0).b;

    var mobileLava = curLava.r;
    var temperature = curLava.g;
    var coolLava = curCoolLava;
    var basalt = curBasalt;

    // Noise-modulated crusting rate (some areas solidify faster)
    let crustMod = 1.0 + (noise - 1.0) * uniforms.u_NoiseModulation;

    // Speed gate: flowing lava resists solidification
    let speedGate = 1.0 / (1.0 + speed * 10.0);

    // Phase 1: Mobile → Cool Lava (when temperature drops below threshold)
    if (temperature < uniforms.u_CoolThreshold && mobileLava > 0.0001) {
        let coolAmount = min(mobileLava, uniforms.u_CoolificationRate * crustMod * speedGate);
        mobileLava -= coolAmount;
        coolLava += coolAmount;
    }

    // Phase 2: Cool Lava → Basalt (when fully frozen)
    if (temperature < uniforms.u_BasaltThreshold && coolLava > 0.0001) {
        let basaltAmount = min(coolLava, uniforms.u_BasaltificationRate * crustMod);
        coolLava -= basaltAmount;
        basalt += basaltAmount;
    }

    // Phase 3: Re-melting (hot lava can melt cool lava and basalt)
    // Hysteresis: need T > CoolThreshold + 0.1 to re-melt
    if (temperature > uniforms.u_CoolThreshold + 0.1 && mobileLava > 0.01) {
        let thermalPower = (temperature - 0.5) * 2.0; // 0 at T=0.5, 1 at T=1.0

        // Cool lava melts easily (lowest resistance)
        if (coolLava > 0.0001) {
            let remeltAmount = min(coolLava, uniforms.u_ReMeltRate * thermalPower);
            coolLava -= remeltAmount;
            mobileLava += remeltAmount;
        }

        // Basalt melts at moderate rate (harder than terrain, easier than rock)
        if (basalt > 0.0001 && temperature > 0.8) {
            let basaltMeltAmount = min(basalt, uniforms.u_BasaltMeltRate * thermalPower);
            basalt -= basaltMeltAmount;
            mobileLava += basaltMeltAmount;
        }
    }

    // Clean up: negligible mobile lava remnants
    if (mobileLava < 0.001 && temperature < 0.1) {
        // Convert remaining thin film to cool lava instead of discarding
        coolLava += mobileLava;
        mobileLava = 0.0;
        temperature = 0.0;
    }

    // Write updated values
    textureStore(writeLava, coord, vec4<f32>(mobileLava, temperature, curLava.b, curLava.a));
    textureStore(writeCoolLava, coord, vec4<f32>(coolLava, 0.0, 0.0, 0.0));
    textureStore(writeBasalt, coord, vec4<f32>(basalt, 0.0, 0.0, 0.0));
}
