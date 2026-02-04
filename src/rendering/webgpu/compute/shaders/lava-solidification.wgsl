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

    // Speed gate: flowing lava strongly resists solidification.
    // At speed=0.1 → gate=0.17, at speed=0.5 → gate=0.04 (nearly immune)
    let speedGate = 1.0 / (1.0 + speed * 50.0);

    // Phase 1: Crusting — mobile lava → cool lava.
    // Only crusts below CoolThreshold temperature. Lava above threshold stays fully mobile.
    // This prevents the "dead zone" where warm lava is too viscous to flow but too warm to solidify.
    if (mobileLava > 0.0001 && temperature < uniforms.u_CoolThreshold) {
        let crustFrac = (uniforms.u_CoolThreshold - temperature) / uniforms.u_CoolThreshold;
        let crustAmount = mobileLava * crustFrac * uniforms.u_CoolificationRate * speedGate * noise;
        let capped = min(crustAmount, mobileLava);
        if (capped > 0.00001) {
            coolLava += capped;
            mobileLava -= capped;
        }
    }

    // Phase 2: Compaction — cool lava → basalt when no active hot flow (T < 0.1)
    if (coolLava > 0.01 && temperature < 0.1) {
        let compactRate = uniforms.u_BasaltificationRate;
        let compactAmount = min(coolLava * compactRate, coolLava);
        coolLava -= compactAmount;
        basalt += compactAmount;
    }

    // Phase 3: Re-melting (hot lava can melt cool lava and basalt)
    // Low mobileLava threshold: even thin incoming hot lava triggers re-melt
    if (temperature > 0.3 && mobileLava > 0.0001) {
        let tempExcess = temperature - 0.3;
        let baseMeltRate = tempExcess * (1.0 + speed * 2.0) * min(mobileLava * 0.5, 3.0) * uniforms.u_ReMeltRate;

        // Cool lava melts easily (recently crusted)
        if (coolLava > 0.001) {
            let meltAmount = min(coolLava * baseMeltRate, coolLava * 0.08);
            if (meltAmount > 0.00001) {
                coolLava -= meltAmount;
                mobileLava += meltAmount;
                // Heat loss from melting
                temperature *= (1.0 - meltAmount / max(mobileLava, 0.01) * 0.2);
            }
        }

        // Basalt melts at ~40% the rate (solid but igneous — harder to melt)
        if (basalt > 0.001 && coolLava < 0.05 && temperature > 0.5) {
            let basaltRate = baseMeltRate * 0.4;
            let meltAmount = min(basalt * basaltRate, basalt * 0.03);
            if (meltAmount > 0.00001) {
                basalt -= meltAmount;
                mobileLava += meltAmount;
                temperature *= (1.0 - meltAmount / max(mobileLava, 0.01) * 0.4);
            }
        }
    }

    // Clean up: negligible mobile lava remnants
    if (mobileLava < 0.001 && temperature < 0.1) {
        coolLava += mobileLava;
        mobileLava = 0.0;
        temperature = 0.0;
    }

    // Write updated values
    textureStore(writeLava, coord, vec4<f32>(mobileLava, temperature, curLava.b, curLava.a));
    textureStore(writeCoolLava, coord, vec4<f32>(coolLava, 0.0, 0.0, 0.0));
    textureStore(writeBasalt, coord, vec4<f32>(basalt, 0.0, 0.0, 0.0));
}
