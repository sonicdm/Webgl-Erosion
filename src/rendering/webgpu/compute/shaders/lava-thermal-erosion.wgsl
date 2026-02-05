@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readLavaVel: texture_2d<f32>;
@group(0) @binding(2) var readTerrain: texture_2d<f32>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var readBasalt: texture_2d<f32>;
@group(0) @binding(5) var writeBasalt: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_ThermalErosionRate: f32,
    u_MaxErosionPerStep: f32,
    u_ErosionSpeedClamp: f32,
    u_RockMeltThreshold: f32,
    u_Timestep: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(6) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let lava = textureLoad(readLava, coord, 0);
    let lavaVel = textureLoad(readLavaVel, coord, 0);
    let terrain = textureLoad(readTerrain, coord, 0);
    var basalt = textureLoad(readBasalt, coord, 0).r;

    var height = terrain.r;
    var water = terrain.g;
    var rock = terrain.b;
    var baseRock = terrain.a;

    let lavaHeight = lava.r;
    let temperature = lava.g;
    let speed = lavaVel.b;

    if (lavaHeight > 0.01 && temperature > 0.1) {
        // Clamp speed to prevent runaway erosion
        let clampedSpeed = min(speed, uniforms.u_ErosionSpeedClamp);

        // Erosion scales with temperature, clamped speed, and timestep
        var erosionRate = uniforms.u_ThermalErosionRate
                        * temperature
                        * clampedSpeed
                        * uniforms.u_Timestep;

        // Erode basalt layer first (if present), then terrain underneath
        // Resistance ordering: cool lava (easiest) < terrain < basalt < rock (hardest)
        if (basalt > 0.001) {
            // Basalt erodes at 50% of terrain rate (harder than terrain, easier than rock)
            let basaltErosionRate = erosionRate * 0.5;
            let basaltEroded = min(basalt, min(basaltErosionRate, uniforms.u_MaxErosionPerStep));
            basalt -= basaltEroded;
            // Eroded basalt material is lost (absorbed into lava flow)
        } else {
            // No basalt cover — erode terrain directly (existing behavior)
            // Substrate resistance from rock hardness
            if (rock > 0.1) {
                let rockStrength = clamp((rock - 0.1) / 0.9, 0.0, 1.0);
                if (temperature > uniforms.u_RockMeltThreshold) {
                    // Above melt threshold: rock partially resists (30%)
                    erosionRate *= (1.0 - rockStrength * 0.7);
                    rock = max(0.0, rock - erosionRate * 0.01);
                } else {
                    // Below melt threshold: rock strongly resists (95%)
                    erosionRate *= (1.0 - rockStrength * 0.95);
                }
            }

            // Hard per-step cap: never erode more than maxErosionPerStep
            erosionRate = min(erosionRate, uniforms.u_MaxErosionPerStep);

            height = max(height - erosionRate, -0.10);
        }
    }

    textureStore(writeTerrain, coord, vec4<f32>(height, water, rock, baseRock));
    textureStore(writeBasalt, coord, vec4<f32>(basalt, 0.0, 0.0, 0.0));
}
