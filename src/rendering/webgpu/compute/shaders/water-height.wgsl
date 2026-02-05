@group(0) @binding(0) var readFlux: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var readVel: texture_2d<f32>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var writeVel: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    u_VelMult: f32,
    u_Time: f32,
    u_VelAdvMag: f32,
};

@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let dim = vec2<f32>(f32(texture_size.x), f32(texture_size.y));
    let div = 1.0 / uniforms.u_SimRes;
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;

    let curflux = textureLoad(readFlux, vec2<i32>(global_id.xy), 0);
    let cur = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    let curvel = textureLoad(readVel, vec2<i32>(global_id.xy), 0);

    let topflux = textureLoad(readFlux, vec2<i32>(global_id.xy) + vec2<i32>(0, 1), 0);
    let rightflux = textureLoad(readFlux, vec2<i32>(global_id.xy) + vec2<i32>(1, 0), 0);
    let bottomflux = textureLoad(readFlux, vec2<i32>(global_id.xy) + vec2<i32>(0, -1), 0);
    let leftflux = textureLoad(readFlux, vec2<i32>(global_id.xy) + vec2<i32>(-1, 0), 0);

    var ftopout = curflux.x;
    var frightout = curflux.y;
    var fbottomout = curflux.z;
    var fleftout = curflux.w;

    let fin = topflux.z + rightflux.w + bottomflux.x + leftflux.y;
    let fout = ftopout + frightout + fbottomout + fleftout;
    let deltavol = uniforms.u_timestep * (fin - fout) / (uniforms.u_PipeLen * uniforms.u_PipeLen);

    let d1 = cur.y;
    let d2 = max(d1 + deltavol, 0.0);
    let da = (d1 + d2) / 2.0;

    var veloci = vec2<f32>(
        leftflux.y - curflux.w + curflux.y - rightflux.w,
        bottomflux.x - curflux.z + curflux.x - topflux.z
    ) / 2.0;
    if (cur.y == 0.0 && deltavol == 0.0) {
        veloci = vec2<f32>(0.0, 0.0);
    }
    if (da <= 0.0001) {
        veloci = vec2<f32>(0.0);
    } else {
        veloci = veloci / (da * uniforms.u_PipeLen);
    }

    // Velocity advection: back-trace and sample
    var useVel = curvel / uniforms.u_SimRes;
    useVel = useVel * 0.5;
    let oldloc = vec2<f32>(
        curuv.x - useVel.x * uniforms.u_timestep,
        curuv.y - useVel.y * uniforms.u_timestep
    );
    let vel_dim = vec2<f32>(f32(textureDimensions(readVel).x), f32(textureDimensions(readVel).y));
    let uv_tex = oldloc * vel_dim - 0.5;
    let i0 = clamp(i32(floor(uv_tex.x)), 0, i32(vel_dim.x) - 1);
    let j0 = clamp(i32(floor(uv_tex.y)), 0, i32(vel_dim.y) - 1);
    let i1 = min(i0 + 1, i32(vel_dim.x) - 1);
    let j1 = min(j0 + 1, i32(vel_dim.y) - 1);
    let fx = fract(uv_tex.x);
    let fy = fract(uv_tex.y);
    let v00 = textureLoad(readVel, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readVel, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readVel, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readVel, vec2<i32>(i1, j1), 0);
    let oldvel = mix(mix(v00.xy, v10.xy, fx), mix(v01.xy, v11.xy, fx), fy);

    veloci += oldvel * uniforms.u_VelAdvMag;

    if (cur.y < 0.01) {
        veloci = vec2<f32>(0.0);
    }

    textureStore(writeTerrain, vec2<i32>(global_id.xy), vec4<f32>(cur.x, max(cur.y + deltavol, 0.0), cur.z, cur.w));
    textureStore(writeVel, vec2<i32>(global_id.xy), vec4<f32>(veloci.x * uniforms.u_VelMult, veloci.y * uniforms.u_VelMult, curvel.z, curvel.w));
}
