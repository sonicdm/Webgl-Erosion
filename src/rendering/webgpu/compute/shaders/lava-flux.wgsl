@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readLava: texture_2d<f32>;
@group(0) @binding(2) var readLavaFlux: texture_2d<f32>;
@group(0) @binding(3) var writeLavaFlux: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    u_ViscosityScale: f32,
    u_YieldStress: f32,
    u_CrustStrength: f32,
    _padding: f32,
};

@group(0) @binding(4) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let div = 1.0 / uniforms.u_SimRes;
    let g = 0.80;
    let coord = vec2<i32>(global_id.xy);

    let curTerrain = textureLoad(readTerrain, coord, 0);
    let curLava = textureLoad(readLava, coord, 0);
    let curFlux = textureLoad(readLavaFlux, coord, 0);

    let lavaHeight = curLava.r;
    let viscosity_val = curLava.b;

    // No lava → zero flux
    if (lavaHeight < 0.0001) {
        textureStore(writeLavaFlux, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        return;
    }

    // Surface height = terrain + water + lava (lava sits on top)
    let surfaceHeight = curTerrain.r + curTerrain.g + lavaHeight;

    let topT = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let rightT = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let bottomT = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let leftT = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);

    let topL = textureLoad(readLava, coord + vec2<i32>(0, 1), 0);
    let rightL = textureLoad(readLava, coord + vec2<i32>(1, 0), 0);
    let bottomL = textureLoad(readLava, coord + vec2<i32>(0, -1), 0);
    let leftL = textureLoad(readLava, coord + vec2<i32>(-1, 0), 0);

    let Htop = surfaceHeight - (topT.r + topT.g + topL.r);
    let Hright = surfaceHeight - (rightT.r + rightT.g + rightL.r);
    let Hbottom = surfaceHeight - (bottomT.r + bottomT.g + bottomL.r);
    let Hleft = surfaceHeight - (leftT.r + leftT.g + leftL.r);

    // Viscosity reduces the NEW acceleration only, not the accumulated flux.
    // This way viscosity slows how fast flux builds, but doesn't drain existing momentum.
    // Water shader: flux = max(0, oldFlux + accel). Lava: flux = max(0, oldFlux + accel * viscDamp).
    let viscDamp = 1.0 / (1.0 + viscosity_val * uniforms.u_ViscosityScale);

    let accelTop = (uniforms.u_timestep * g * uniforms.u_PipeArea * Htop) / uniforms.u_PipeLen;
    let accelRight = (uniforms.u_timestep * g * uniforms.u_PipeArea * Hright) / uniforms.u_PipeLen;
    let accelBottom = (uniforms.u_timestep * g * uniforms.u_PipeArea * Hbottom) / uniforms.u_PipeLen;
    let accelLeft = (uniforms.u_timestep * g * uniforms.u_PipeArea * Hleft) / uniforms.u_PipeLen;

    var ftop = max(0.0, curFlux.r + accelTop * viscDamp);
    var fright = max(0.0, curFlux.g + accelRight * viscDamp);
    var fbottom = max(0.0, curFlux.b + accelBottom * viscDamp);
    var fleft = max(0.0, curFlux.a + accelLeft * viscDamp);

    // Yield stress (Bingham plastic): only develops as lava cools.
    // Hot basaltic lava at eruption temp is Newtonian — no yield stress.
    // As it cools, internal crystal structure develops yield strength.
    // viscosity_val base is 0.6 at T=1.0, so subtract base to get cooling contribution.
    let coolingYield = max(0.0, viscosity_val - 0.6);
    let yieldThreshold = uniforms.u_YieldStress * coolingYield;

    // Crust barrier (Tomita 2024 — solidification-driven morphology):
    // Thick crust at a neighbor acts as a structural barrier that redirects flow.
    // Hot lava must exceed both the Bingham yield stress AND the neighbor's crust resistance
    // to push into that cell. This creates levees: crusted margins physically block flow,
    // forcing it into the hotter uncrusted channel.
    let crustStr = uniforms.u_CrustStrength;
    let topBarrier = yieldThreshold + topL.a * crustStr;
    let rightBarrier = yieldThreshold + rightL.a * crustStr;
    let bottomBarrier = yieldThreshold + bottomL.a * crustStr;
    let leftBarrier = yieldThreshold + leftL.a * crustStr;

    if (abs(Htop) < topBarrier) { ftop = 0.0; }
    if (abs(Hright) < rightBarrier) { fright = 0.0; }
    if (abs(Hbottom) < bottomBarrier) { fbottom = 0.0; }
    if (abs(Hleft) < leftBarrier) { fleft = 0.0; }

    // Conservation factor - matches water flow shader
    let lavaOut = uniforms.u_timestep * (ftop + fright + fbottom + fleft);
    let k = min(1.0, (lavaHeight * uniforms.u_PipeLen * uniforms.u_PipeLen) / max(lavaOut, 0.0001));
    ftop *= k;
    fright *= k;
    fbottom *= k;
    fleft *= k;

    // Boundary conditions - matches water flow shader
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        ftop = 0.0;
        fright = 0.0;
        fbottom = 0.0;
        fleft = 0.0;
    }

    textureStore(writeLavaFlux, coord, vec4<f32>(ftop, fright, fbottom, fleft));
}
