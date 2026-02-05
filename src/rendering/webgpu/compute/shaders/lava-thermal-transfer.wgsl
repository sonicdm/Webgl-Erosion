@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readLavaVel: texture_2d<f32>;
@group(0) @binding(2) var writeLava: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_KCond: f32,
    u_CrustMixSuppression: f32,
    u_SofteningTemp: f32,
    u_timestep: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var readTerrain: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let simRes = i32(uniforms.u_SimRes);
    let coord = vec2<i32>(global_id.xy);

    // Bounds check
    if (coord.x >= simRes || coord.y >= simRes) {
        return;
    }

    let lava = textureLoad(readLava, coord, 0);
    let vel = textureLoad(readLavaVel, coord, 0);

    var H = lava.r;       // lava height
    var T = lava.g;       // temperature
    var visc = lava.b;    // viscosity
    var C = lava.a;       // crust thickness

    let deltaH = vel.a;   // volume change from advection (from pass 3)

    // No lava: write zeros
    if (H < 0.0001) {
        textureStore(writeLava, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        return;
    }

    // --- Mixing suppression by crust ---
    // Thick crust prevents incoming hot lava from freely mixing with cooler lava below
    let mixFactor = clamp(1.0 - C * uniforms.u_CrustMixSuppression, 0.0, 1.0);

    // --- Conduction from incoming lava ---
    // When deltaH > 0, new lava arrived. Estimate incoming temperature from neighbors.
    if (deltaH > 0.001 && H > 0.001) {
        // Clamp neighbor coords to bounds
        let top = clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), vec2<i32>(simRes - 1));
        let right = clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));
        let bottom = clamp(coord + vec2<i32>(0, -1), vec2<i32>(0), vec2<i32>(simRes - 1));
        let left = clamp(coord + vec2<i32>(-1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));

        let topLava = textureLoad(readLava, top, 0);
        let rightLava = textureLoad(readLava, right, 0);
        let bottomLava = textureLoad(readLava, bottom, 0);
        let leftLava = textureLoad(readLava, left, 0);

        // Weighted average neighbor temperature (by height as proxy for contribution)
        let totalNeighborH = topLava.r + rightLava.r + bottomLava.r + leftLava.r;
        var T_in = T; // fallback
        if (totalNeighborH > 0.001) {
            T_in = (topLava.g * topLava.r + rightLava.g * rightLava.r +
                    bottomLava.g * bottomLava.r + leftLava.g * leftLava.r) / totalNeighborH;
        }

        // Heat transfer: bounded conduction proportional to new material fraction
        let heightFactor = min(deltaH / H, 0.5);
        let dT = uniforms.u_KCond * (T_in - T) * uniforms.u_timestep * heightFactor * mixFactor;
        T = T + dT;
    }

    // --- Lateral conduction (even through crust, but reduced) ---
    // Pure 4-neighbor heat diffusion
    {
        let top = clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), vec2<i32>(simRes - 1));
        let right = clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));
        let bottom = clamp(coord + vec2<i32>(0, -1), vec2<i32>(0), vec2<i32>(simRes - 1));
        let left = clamp(coord + vec2<i32>(-1, 0), vec2<i32>(0), vec2<i32>(simRes - 1));

        let topT = textureLoad(readLava, top, 0);
        let rightT = textureLoad(readLava, right, 0);
        let bottomT = textureLoad(readLava, bottom, 0);
        let leftT = textureLoad(readLava, left, 0);

        var neighborCount: f32 = 0.0;
        var avgNeighborTemp: f32 = 0.0;
        if (topT.r > 0.001) { avgNeighborTemp += topT.g; neighborCount += 1.0; }
        if (rightT.r > 0.001) { avgNeighborTemp += rightT.g; neighborCount += 1.0; }
        if (bottomT.r > 0.001) { avgNeighborTemp += bottomT.g; neighborCount += 1.0; }
        if (leftT.r > 0.001) { avgNeighborTemp += leftT.g; neighborCount += 1.0; }

        if (neighborCount > 0.0) {
            avgNeighborTemp /= neighborCount;
            // Crust reduces but never blocks conduction entirely
            let crustConductionFactor = max(0.1, 1.0 - C * 2.0);
            let lateralDT = uniforms.u_KCond * 0.25 * (avgNeighborTemp - T) * uniforms.u_timestep * crustConductionFactor;
            T = T + lateralDT;
        }
    }

    // --- Substrate conduction (hot-over-cool layering) ---
    // Griffiths 2000 / Tomita 2024: when hot lava flows over recently solidified rock,
    // the substrate acts as a heat sink — the overriding flow cools faster than it would
    // on bare terrain. The rock fraction (terrain.b) indicates solidified lava deposits.
    {
        let terrain = textureLoad(readTerrain, coord, 0);
        let rockFraction = terrain.b;  // 0 = no rock, 1 = fully rock (solidified lava)

        // Substrate conduction: proportional to rock fraction and temperature difference.
        // Assume substrate is "cold" (T_substrate ≈ 0.1) — recently solidified rock is still
        // warm but much cooler than active lava.
        let T_substrate = 0.1;
        if (rockFraction > 0.05 && T > T_substrate) {
            let substrateCooling = uniforms.u_KCond * 0.5 * rockFraction * (T - T_substrate) * uniforms.u_timestep;
            // Crust insulates from substrate too
            let substrateCrustFactor = max(0.2, 1.0 - C * 1.5);
            T = T - substrateCooling * substrateCrustFactor;
        }
    }

    // --- Re-mobilization ---
    // If temperature exceeds softening threshold, crust melts and flow resumes.
    // Also reduce viscosity — re-heated lava becomes more fluid (Tomita 2024).
    if (T > uniforms.u_SofteningTemp && C > 0.001) {
        let meltRate = (T - uniforms.u_SofteningTemp) / (1.0 - uniforms.u_SofteningTemp + 0.001);
        C = max(0.0, C - meltRate * uniforms.u_timestep * 0.5);
        // Reduce viscosity toward hot value when reheated
        let targetVisc = 0.6 + 4.0 * pow(max(0.0, 1.0 - T), 2.0);
        visc = mix(visc, targetVisc, meltRate * uniforms.u_timestep * 0.3);
    }

    T = clamp(T, 0.0, 1.5); // allow slight superheat from mixing

    textureStore(writeLava, coord, vec4<f32>(H, T, visc, C));
}
