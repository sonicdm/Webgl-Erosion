@group(0) @binding(0) var readLavaFlux: texture_2d<f32>;
@group(0) @binding(1) var readLava: texture_2d<f32>;
@group(0) @binding(2) var readLavaVel: texture_2d<f32>;
@group(0) @binding(3) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var writeLavaVel: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var readLavaFlux2: texture_2d<f32>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    u_VelAdvMag: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};

@group(0) @binding(6) var<uniform> uniforms: Uniforms;

// 8-neighbor direction offsets: N, NE, E, SE, S, SW, W, NW
const dirDx = array<i32, 8>(0, 1, 1, 1, 0, -1, -1, -1);
const dirDy = array<i32, 8>(1, 1, 0, -1, -1, -1, 0, 1);
// Normalized direction vectors
const dirNx = array<f32, 8>(0.0, 0.7071, 1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071);
const dirNy = array<f32, 8>(1.0, 0.7071, 0.0, -0.7071, -1.0, -0.7071, 0.0, 0.7071);

// Get flux from a neighbor directed toward current cell
fn getNeighborFluxTowardUs(nFlux1: vec4<f32>, nFlux2: vec4<f32>, d: i32) -> f32 {
    let opp = (d + 4) % 8;
    switch opp {
        case 0: { return nFlux1.x; }
        case 1: { return nFlux1.y; }
        case 2: { return nFlux1.z; }
        case 3: { return nFlux1.w; }
        case 4: { return nFlux2.x; }
        case 5: { return nFlux2.y; }
        case 6: { return nFlux2.z; }
        case 7: { return nFlux2.w; }
        default: { return 0.0; }
    }
}

fn getOwnFlux(flux1: vec4<f32>, flux2: vec4<f32>, d: i32) -> f32 {
    switch d {
        case 0: { return flux1.x; }
        case 1: { return flux1.y; }
        case 2: { return flux1.z; }
        case 3: { return flux1.w; }
        case 4: { return flux2.x; }
        case 5: { return flux2.y; }
        case 6: { return flux2.z; }
        case 7: { return flux2.w; }
        default: { return 0.0; }
    }
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readLava);
    let dim = vec2<f32>(f32(texture_size.x), f32(texture_size.y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let coord = vec2<i32>(global_id.xy);

    let curFlux1 = textureLoad(readLavaFlux, coord, 0);
    let curFlux2 = textureLoad(readLavaFlux2, coord, 0);
    let cur = textureLoad(readLava, coord, 0);
    let curVel = textureLoad(readLavaVel, coord, 0);

    // Sum inflow from all 8 neighbors
    var fin: f32 = 0.0;
    for (var d: i32 = 0; d < 8; d++) {
        let nx = coord.x + dirDx[d];
        let ny = coord.y + dirDy[d];
        if (nx < 0 || nx >= i32(uniforms.u_SimRes) || ny < 0 || ny >= i32(uniforms.u_SimRes)) {
            continue;
        }
        let nCoord = vec2<i32>(nx, ny);
        let nFlux1 = textureLoad(readLavaFlux, nCoord, 0);
        let nFlux2 = textureLoad(readLavaFlux2, nCoord, 0);
        fin += getNeighborFluxTowardUs(nFlux1, nFlux2, d);
    }

    // Sum outflow from current cell
    var fout: f32 = 0.0;
    for (var d: i32 = 0; d < 8; d++) {
        fout += getOwnFlux(curFlux1, curFlux2, d);
    }

    let deltaVol = uniforms.u_timestep * (fin - fout) / (uniforms.u_PipeLen * uniforms.u_PipeLen);

    let d1 = cur.r;
    let d2 = max(d1 + deltaVol, 0.0);
    let da = (d1 + d2) / 2.0;

    // Velocity from flux field (8-neighbor)
    var vel = vec2<f32>(0.0);
    for (var d: i32 = 0; d < 8; d++) {
        let outFlux = getOwnFlux(curFlux1, curFlux2, d);

        var inFlux: f32 = 0.0;
        let nx = coord.x + dirDx[d];
        let ny = coord.y + dirDy[d];
        if (nx >= 0 && nx < i32(uniforms.u_SimRes) && ny >= 0 && ny < i32(uniforms.u_SimRes)) {
            let nCoord = vec2<i32>(nx, ny);
            let nFlux1 = textureLoad(readLavaFlux, nCoord, 0);
            let nFlux2 = textureLoad(readLavaFlux2, nCoord, 0);
            inFlux = getNeighborFluxTowardUs(nFlux1, nFlux2, d);
        }

        let netFlux = outFlux - inFlux;
        vel += vec2<f32>(dirNx[d], dirNy[d]) * netFlux;
    }

    if (da <= 0.0001) {
        vel = vec2<f32>(0.0);
    } else {
        vel = vel / (da * uniforms.u_PipeLen);
    }

    // Velocity advection
    var useVel = curVel.xy / uniforms.u_SimRes * 0.5;
    let oldLoc = curuv - useVel * uniforms.u_timestep;
    let velDim = vec2<f32>(f32(textureDimensions(readLavaVel).x), f32(textureDimensions(readLavaVel).y));
    let uvTex = oldLoc * velDim - 0.5;
    let i0 = clamp(i32(floor(uvTex.x)), 0, i32(velDim.x) - 1);
    let j0 = clamp(i32(floor(uvTex.y)), 0, i32(velDim.y) - 1);
    let i1 = min(i0 + 1, i32(velDim.x) - 1);
    let j1 = min(j0 + 1, i32(velDim.y) - 1);
    let fx = fract(uvTex.x);
    let fy = fract(uvTex.y);
    let v00 = textureLoad(readLavaVel, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readLavaVel, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readLavaVel, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readLavaVel, vec2<i32>(i1, j1), 0);
    let oldVel = mix(mix(v00.xy, v10.xy, fx), mix(v01.xy, v11.xy, fx), fy);
    vel += oldVel * uniforms.u_VelAdvMag;

    if (d2 < 0.01) {
        vel = vec2<f32>(0.0);
    }

    let speed = length(vel);

    // Temperature advection: incoming lava carries its temperature.
    var newTemp = cur.g;
    if (fin > 0.001 && d2 > 0.001) {
        var tempWeightedSum: f32 = 0.0;
        for (var d: i32 = 0; d < 8; d++) {
            let nx = coord.x + dirDx[d];
            let ny = coord.y + dirDy[d];
            if (nx < 0 || nx >= i32(uniforms.u_SimRes) || ny < 0 || ny >= i32(uniforms.u_SimRes)) {
                continue;
            }
            let nCoord = vec2<i32>(nx, ny);
            let nFlux1 = textureLoad(readLavaFlux, nCoord, 0);
            let nFlux2 = textureLoad(readLavaFlux2, nCoord, 0);
            let fluxIn = getNeighborFluxTowardUs(nFlux1, nFlux2, d);
            if (fluxIn > 0.0) {
                let nLava = textureLoad(readLava, nCoord, 0);
                tempWeightedSum += fluxIn * nLava.g;
            }
        }
        let tempIn = tempWeightedSum / max(fin, 0.001);
        let inFrac = clamp(uniforms.u_timestep * fin / (d2 * uniforms.u_PipeLen * uniforms.u_PipeLen), 0.0, 1.0);
        newTemp = mix(cur.g, tempIn, inFrac);
    }

    let deltaH = d2 - d1;

    textureStore(writeLava, coord, vec4<f32>(d2, newTemp, cur.b, cur.a));
    textureStore(writeLavaVel, coord, vec4<f32>(vel.x, vel.y, speed, deltaH));
}
