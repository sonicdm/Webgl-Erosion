@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var readBasalt: texture_2d<f32>;
@group(0) @binding(6) var writeBasalt: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_HeatRadius: i32,
    u_CoolingRate: f32,
    u_SolidificationThreshold: f32,
    u_RockFraction: f32,
    u_WaterEvapRate: f32,
    u_Timestep: f32,
    _pad0: f32,
};

@group(0) @binding(4) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let texture_size = textureDimensions(readTerrain);
    let lava = textureLoad(readLava, coord, 0);
    let terrain = textureLoad(readTerrain, coord, 0);

    var lavaHeight = lava.r;
    var temperature = lava.g;
    var viscosity = lava.b;
    var crustThickness = lava.a;
    var terrainHeight = terrain.r;
    var water = terrain.g;
    var rock = terrain.b;
    var baseRock = terrain.a;
    var basalt = textureLoad(readBasalt, coord, 0).r;

    // --- MUTUAL EXCLUSION: capacity-based ---
    // Lava and water cannot occupy the same cell volume.
    // Lava is denser (~2700 kg/m³ vs ~1000 kg/m³) — it takes priority.
    let CELL_CAPACITY = 1.0;
    let totalFluid = lavaHeight + water;
    if (totalFluid > CELL_CAPACITY && lavaHeight > 0.001 && water > 0.001) {
        let excess = totalFluid - CELL_CAPACITY;
        water = max(0.0, water - excess);
    }

    // --- FLOW BLOCKING: thick lava displaces water underneath ---
    // Lava is ~2.7x denser than water — it sinks and pushes water aside.
    // Thicker lava blocks more aggressively.
    if (lavaHeight > 0.02 && water > 0.001) {
        let displaceRate = lavaHeight * 0.025;
        let displace = min(water, displaceRate);
        water = max(0.0, water - displace);
    }

    // --- DIRECT CONTACT: quench cooling + rapid crust formation ---
    if (lavaHeight > 0.001 && water > 0.001) {
        // Contact amount proportional to interface area (min of the two heights)
        let contactAmount = min(water, lavaHeight * 0.1) * 0.5;
        water = max(0.0, water - contactAmount);

        // Quench cooling — reduced from 5.0 to 1.5 to avoid instant freezing.
        // Real lava-water interaction cools the surface rapidly but doesn't instantly
        // solidify the entire flow — it forms a quench crust that insulates the core.
        let quenchCooling = contactAmount * 0.075;
        temperature = max(0.0, temperature - quenchCooling);

        // Rapid quench crust formation on contact (thicker than normal cooling)
        crustThickness += contactAmount * 0.15;
        crustThickness = min(crustThickness, lavaHeight * 0.5);

        // Flash evaporation: hot lava (T > 0.7) vaporizes nearby water aggressively
        if (temperature > 0.7) {
            let flashEvap = min(water, temperature * 0.015);
            water = max(0.0, water - flashEvap);
        }

        // Immediate solidification only if deeply quenched (well below threshold).
        // Quenched lava becomes basalt (porous, brittle igneous rock), NOT terrain/rock.
        if (temperature < uniforms.u_SolidificationThreshold * 0.5) {
            let solidAmount = min(min(lavaHeight * 0.003, lavaHeight), 0.0001);
            basalt += solidAmount;
            lavaHeight = max(0.0, lavaHeight - solidAmount);
        }
    }

    // --- HEAT RADIUS: nearby hot lava evaporates water ---
    // Temperature-scaled: hotter lava evaporates more distant water.
    // Only lava above T=0.4 contributes significant heat.
    if (water > 0.001) {
        var nearbyHeat: f32 = 0.0;
        let radius = uniforms.u_HeatRadius;
        for (var dy: i32 = -radius; dy <= radius; dy++) {
            for (var dx: i32 = -radius; dx <= radius; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                let nc = coord + vec2<i32>(dx, dy);
                if (nc.x >= 0 && nc.x < i32(texture_size.x) && nc.y >= 0 && nc.y < i32(texture_size.y)) {
                    let neighborLava = textureLoad(readLava, nc, 0);
                    let nTemp = neighborLava.g;
                    if (neighborLava.r > 0.01 && nTemp > 0.4) {
                        let dist = length(vec2<f32>(f32(dx), f32(dy)));
                        // Heat contribution scales with temperature squared (radiative)
                        nearbyHeat += nTemp * nTemp * neighborLava.r / (1.0 + dist);
                    }
                }
            }
        }
        if (nearbyHeat > 0.01) {
            water = max(0.0, water - nearbyHeat * uniforms.u_WaterEvapRate * 0.025);
        }
    }

    // --- NUMERICAL GUARD: zero out lava channels below epsilon ---
    if (lavaHeight < 0.0001) {
        lavaHeight = 0.0;
        temperature = 0.0;
        viscosity = 0.0;
        crustThickness = 0.0;
    }

    textureStore(writeLava, coord, vec4<f32>(lavaHeight, temperature, viscosity, crustThickness));
    textureStore(writeTerrain, coord, vec4<f32>(terrainHeight, water, rock, baseRock));
    textureStore(writeBasalt, coord, vec4<f32>(basalt, 0.0, 0.0, 0.0));
}
