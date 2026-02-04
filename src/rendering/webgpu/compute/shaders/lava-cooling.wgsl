@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_CoolingRate: f32,
    u_ProportionalCooling: f32,
    u_SolidificationThreshold: f32,
    u_RockFraction: f32,
    u_CrustGrowthRate: f32,
    u_AmbientCoolingRate: f32,
    u_ViscTempScale: f32,
    u_timestep: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};

@group(0) @binding(4) var<uniform> uniforms: Uniforms;
@group(0) @binding(5) var readLavaVel: texture_2d<f32>;
@group(0) @binding(6) var readCoolLava: texture_2d<f32>;
@group(0) @binding(7) var readBasalt: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let lava = textureLoad(readLava, coord, 0);
    let terrain = textureLoad(readTerrain, coord, 0);
    let lavaVel = textureLoad(readLavaVel, coord, 0);

    var lavaHeight = lava.r;
    var temperature = lava.g;
    var viscosity = lava.b;
    var crustThickness = lava.a;
    var terrainHeight = terrain.r;
    var water = terrain.g;
    var rock = terrain.b;
    var baseRock = terrain.a;

    let speed = lavaVel.b; // flow speed from velocity pass
    let coolLavaHeight = textureLoad(readCoolLava, coord, 0).r;
    let basaltHeight = textureLoad(readBasalt, coord, 0).r;

    if (lavaHeight < 0.0001) {
        textureStore(writeLava, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        textureStore(writeTerrain, coord, terrain);
        return;
    }

    // --- Lateral exposure: edges cool faster (Griffiths 2000 — self-channeling) ---
    // Cells at the flow margin have fewer lava neighbors → more exposed surface area →
    // cool faster and form crust levees that confine the hotter core.
    let simRes = i32(uniforms.u_SimRes);
    let topCoord = clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), vec2<i32>(simRes - 1));
    let rightCoord = clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));
    let bottomCoord = clamp(coord + vec2<i32>(0, -1), vec2<i32>(0), vec2<i32>(simRes - 1));
    let leftCoord = clamp(coord + vec2<i32>(-1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));

    let topLava = textureLoad(readLava, topCoord, 0);
    let rightLava = textureLoad(readLava, rightCoord, 0);
    let bottomLava = textureLoad(readLava, bottomCoord, 0);
    let leftLava = textureLoad(readLava, leftCoord, 0);

    // Count how many sides are exposed (neighbor has little or no lava)
    let threshold = lavaHeight * 0.3;
    var exposedSides: f32 = 0.0;
    if (topLava.r < threshold) { exposedSides += 1.0; }
    if (rightLava.r < threshold) { exposedSides += 1.0; }
    if (bottomLava.r < threshold) { exposedSides += 1.0; }
    if (leftLava.r < threshold) { exposedSides += 1.0; }

    // Exposure multiplier: center of flow = 1.0, fully exposed edge = 2.6
    let exposureMultiplier = 1.0 + exposedSides * 0.4;

    // --- Temperature decay (multiplicative, matching reference) ---
    // Multiplicative cooling: T *= (1 - rate * factors). Hot lava cools slower than
    // cool lava (proportional to T), creating smooth gradients. More physical than
    // subtractive cooling which creates death spirals at low T.
    //
    // Reference: temp[i] = T * (1.0 - coolRate * flowCoolFactor * exposureMul * insulationFactor)
    // Reference flowHeatK = 20. At speed=1: flowCoolFactor = 1/(1+20) ≈ 0.048.
    // Flowing lava retains almost all heat — this is critical for flow distance.
    let flowCoolFactor = 1.0 / (1.0 + speed * 20.0);

    // Insulation: cool lava + basalt underneath act as thermal blanket (like lava tubes).
    let insulationFactor = 1.0 / (1.0 + (coolLavaHeight + basaltHeight) * 5.0);

    // Single multiplicative cooling step (reference model)
    temperature *= (1.0 - uniforms.u_CoolingRate * flowCoolFactor * exposureMultiplier * insulationFactor);
    temperature = max(temperature, 0.0);

    // --- Viscosity: base + temperature ramp ---
    // Even hot basaltic lava is ~3-5x slower than water.
    // Base viscosity of 0.6 gives viscDamp ≈ 0.25 at T=1.0 (1/4 water speed).
    // Ramps up quadratically as temperature drops.
    let alpha = uniforms.u_ViscTempScale;
    let coolFrac = max(0.0, 1.0 - temperature);
    viscosity = 0.6 + alpha * coolFrac * coolFrac;

    // --- Crust growth ---
    // Flowing lava breaks crust apart — only grows on slow/stalled lava.
    // Edges grow crust faster (more exposed surface → Griffiths channelization).
    let crustFlowSuppression = 1.0 / (1.0 + speed * 5.0);
    if (temperature < 0.6) {
        crustThickness += uniforms.u_CrustGrowthRate * (0.6 - temperature) * crustFlowSuppression * exposureMultiplier;
        crustThickness = min(crustThickness, lavaHeight * 0.3);
    }
    // Hot lava melts crust
    if (temperature > 0.8) {
        crustThickness = max(0.0, crustThickness - 0.005);
    }
    // Moving lava shears crust
    if (speed > 0.5) {
        crustThickness = max(0.0, crustThickness - speed * 0.001);
    }

    // Solidification is handled by the separate lava-solidification pass
    // (mobile → cool lava → basalt). No direct lava → terrain conversion here.

    // Clean up properties when lava is truly gone (already converted by solidification)
    if (lavaHeight < 0.0001) {
        crustThickness = 0.0;
        temperature = 0.0;
        viscosity = 0.0;
        lavaHeight = 0.0;
    }

    textureStore(writeLava, coord, vec4<f32>(lavaHeight, temperature, viscosity, crustThickness));
    textureStore(writeTerrain, coord, vec4<f32>(terrainHeight, water, rock, baseRock));
}
