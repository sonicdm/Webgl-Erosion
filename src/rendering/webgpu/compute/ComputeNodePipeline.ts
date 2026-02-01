import { ComputePass } from './ComputePass';
import { WebGPUTexturePool } from '../../../simulation/WebGPUTexturePool';
import {
    createStorageTextureBinding,
    createSampledTextureBinding,
    createUniformBuffer,
    createStorageTextureLayoutEntry,
    createSampledTextureLayoutEntry,
    createUniformBufferLayoutEntry,
    calculateWorkgroupCount2D,
} from './ComputeNodeHelpers';

// Rain compute shader WGSL code
const RAIN_COMPUTE_SHADER = `
// Rain precipitation compute shader
// Ported from rain-frag.glsl

@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_Time: f32,
    raindeg: f32,
    u_SimRes: f32,
    u_MouseWorldPos: vec4<f32>,
    u_MouseWorldDir: vec3<f32>,
    u_BrushSize: f32,
    u_BrushStrength: f32,
    u_BrushType: i32,
    u_BrushPressed: i32,
    u_BrushPos: vec2<f32>,
    u_BrushOperation: i32,
    u_RainErosion: i32,
    u_RainErosionStrength: f32,
    u_RainErosionDropSize: f32,
    u_FlattenTargetHeight: f32,
    u_SlopeStartPos: vec2<f32>,
    u_SlopeEndPos: vec2<f32>,
    u_SlopeActive: i32,
    u_SourceCount: i32,
    _padding: f32,
};

struct SourceData {
    positions: array<vec2<f32>, 16>,
    sizes: array<f32, 16>,
    strengths: array<f32, 16>,
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> sources: SourceData;

const OCTAVES: i32 = 6;

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

fn mod289(x: f32) -> f32 {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_vec4(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn perm(x: vec4<f32>) -> vec4<f32> {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

fn noise3D(p: vec3<f32>) -> f32 {
    let a = floor(p);
    let d = p - a;
    let d_smooth = d * d * (3.0 - 2.0 * d);
    let b = a.xxyy + vec4<f32>(0.0, 1.0, 0.0, 1.0);
    let k1 = perm(b.xyxy);
    let k2 = perm(k1.xyxy + b.zzww);
    let c = k2 + a.zzzz;
    let k3 = perm(c);
    let k4 = perm(c + 1.0);
    let o1 = fract(k3 * (1.0 / 41.0));
    let o2 = fract(k4 * (1.0 / 41.0));
    let o3 = o2 * d_smooth.z + o1 * (1.0 - d_smooth.z);
    let o4 = o3.yw * d_smooth.x + o3.xz * (1.0 - d_smooth.x);
    return o4.y * d_smooth.y + o4.x * (1.0 - d_smooth.y);
}

fn fbm(st: vec2<f32>) -> f32 {
    var value: f32 = 0.0;
    var amplitude: f32 = 0.5;
    var st_var = st;
    for (var i: i32 = 0; i < OCTAVES; i++) {
        value += amplitude * noise2D(st_var);
        st_var *= 2.0;
        amplitude *= 0.53;
    }
    return value;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let cur = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    var currentHeight = cur.x;
    var addterrain: f32 = 0.0;
    var addwater: f32 = 0.0;
    let amount = 0.0006 * uniforms.u_BrushStrength;
    let aw = fbm(uv * 10.0 + vec2<f32>(sin(uniforms.u_Time * 35.0), cos(uniforms.u_Time * 115.0)));
    
    if (uniforms.u_BrushType != 0 && uniforms.u_BrushPressed == 1) {
        let pointOnPlane = uniforms.u_BrushPos;
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * uniforms.u_BrushSize) {
            var dens = (0.01 * uniforms.u_BrushSize - pdis2fragment * 0.5) / (0.01 * uniforms.u_BrushSize);
            dens = max(0.0, dens);
            if (uniforms.u_BrushType == 1) {
                addterrain = amount * 1.0 * 280.0;
                if (uniforms.u_BrushOperation == 1) { addterrain = -addterrain; }
            } else if (uniforms.u_BrushType == 2) {
                addwater = amount * dens * 200.0 * aw;
                if (uniforms.u_BrushOperation == 1) { addwater = -addwater; }
            } else if (uniforms.u_BrushType == 4 && uniforms.u_BrushOperation == 0) {
                let top = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, 1), 0);
                let right = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(1, 0), 0);
                let bottom = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, -1), 0);
                let left = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(-1, 0), 0);
                let avgHeight = (top.x + right.x + bottom.x + left.x) / 4.0;
                addterrain = (avgHeight - currentHeight) * dens * uniforms.u_BrushStrength * 0.1;
            } else if (uniforms.u_BrushType == 5 && uniforms.u_BrushOperation == 0) {
                let targetHeightTextureSpace = uniforms.u_FlattenTargetHeight * (2000.30 / 500.0);
                addterrain = (targetHeightTextureSpace - currentHeight) * dens * uniforms.u_BrushStrength * 0.2;
            } else if (uniforms.u_BrushType == 6 && uniforms.u_SlopeActive == 2) {
                let slopeDir = uniforms.u_SlopeEndPos - uniforms.u_SlopeStartPos;
                let slopeLength = length(slopeDir);
                if (slopeLength > 0.001) {
                    let slopeDirNorm = normalize(slopeDir);
                    let toCurrent = uv - uniforms.u_SlopeStartPos;
                    let projDist = dot(toCurrent, slopeDirNorm);
                    let startIdx = vec2<i32>(i32(uniforms.u_SlopeStartPos.x * f32(texture_size.x)), i32(uniforms.u_SlopeStartPos.y * f32(texture_size.y)));
                    let endIdx = vec2<i32>(i32(uniforms.u_SlopeEndPos.x * f32(texture_size.x)), i32(uniforms.u_SlopeEndPos.y * f32(texture_size.y)));
                    let startTerrain = textureLoad(readTerrain, startIdx, 0);
                    let endTerrain = textureLoad(readTerrain, endIdx, 0);
                    let t = clamp(projDist / slopeLength, 0.0, 1.0);
                    let targetHeight = mix(startTerrain.x, endTerrain.x, t);
                    let distToBrush = distance(uv, uniforms.u_BrushPos);
                    let brushRadius = 0.01 * uniforms.u_BrushSize;
                    if (distToBrush < brushRadius) {
                        dens = max(0.0, (brushRadius - distToBrush) / brushRadius);
                        addterrain = (targetHeight - currentHeight) * dens * uniforms.u_BrushStrength * 0.3;
                    }
                }
            }
        }
    }
    
    if (uniforms.u_RainErosion == 1 && uniforms.u_Time % 5.0 == 1.0) {
        let smallradius = 0.025 * uniforms.u_RainErosionDropSize;
        let rdx = random(vec2<f32>(30.0, cos(uniforms.u_Time)));
        let rdy = random(vec2<f32>(uniforms.u_Time, 10.0));
        let rdr = random(vec2<f32>(20.0, uniforms.u_Time * 10.0));
        let dis2small = distance(vec2<f32>(rdx, rdy), uv);
        if (dis2small < smallradius) {
            addwater += 0.06 * uniforms.u_RainErosionStrength * (1.0 + 5.0 * rdr);
        }
    }
    
    var rain = 0.0;
    for (var i: i32 = 0; i < uniforms.u_SourceCount; i++) {
        let pointOnPlane = sources.positions[i];
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * sources.sizes[i]) {
            let dens = (0.01 * sources.sizes[i] - pdis2fragment) / (0.01 * sources.sizes[i]);
            var sourceWater = 0.0006 * sources.strengths[i] * dens * 280.0;
            sourceWater *= fbm(uv * 200.0 + vec2<f32>(sin(uniforms.u_Time * 5.0), cos(uniforms.u_Time * 15.0)));
            addwater += sourceWater;
        }
    }
    
    var rockMaterial = cur.z;
    var baseRockSurfaceHeight = cur.w;
    if (uniforms.u_BrushType == 3 && uniforms.u_BrushPressed == 1) {
        let pointOnPlane = uniforms.u_BrushPos;
        let pdis2fragment = distance(pointOnPlane, uv);
        if (pdis2fragment < 0.01 * uniforms.u_BrushSize) {
            var dens = max(0.0, (0.01 * uniforms.u_BrushSize - pdis2fragment * 0.5) / (0.01 * uniforms.u_BrushSize));
            let mixFactor = min(dens * uniforms.u_BrushStrength * 2.0, 1.0);
            if (uniforms.u_BrushOperation == 0) {
                rockMaterial = max(rockMaterial, mix(rockMaterial, 1.0, mixFactor));
                if (rockMaterial > 0.5 && mixFactor > 0.01) {
                    baseRockSurfaceHeight = min(max(cur.x + addterrain, -0.10), 2000.30);
                }
            } else {
                rockMaterial = min(rockMaterial, mix(rockMaterial, 0.0, mixFactor));
                if (rockMaterial < 0.1) { baseRockSurfaceHeight = 0.0; }
            }
        }
    }
    
    let finalHeight = min(max(cur.x + addterrain, -0.10), 2000.30);
    let finalWater = max(cur.y + rain * uniforms.raindeg + addwater, 0.0);
    textureStore(writeTerrain, vec2<i32>(global_id.xy), vec4<f32>(finalHeight, finalWater, rockMaterial, baseRockSurfaceHeight));
}
`;

/**
 * ComputeNode pipeline for simulation compute passes.
 * Ports GLSL fragment shaders to WGSL compute shaders.
 */
export class ComputeNodePipeline extends ComputePass {
    private rainPipeline: GPUComputePipeline | null = null;
    private rainBindGroupLayout: GPUBindGroupLayout | null = null;
    private uniformBuffers: Map<string, GPUBuffer> = new Map();

    constructor(device: GPUDevice) {
        super(device);
    }

    /**
     * Rain precipitation compute pass.
     * Ports rain-frag.glsl to WGSL compute shader.
     * 
     * @param texturePool - WebGPU texture pool with input/output textures
     * @param uniforms - Uniform values (time, brush state, etc.)
     */
    rainPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            time: number;
            rainDegree: number;
            simRes: number;
            mouseWorldPos: [number, number, number, number];
            mouseWorldDir: [number, number, number];
            brushSize: number;
            brushStrength: number;
            brushType: number;
            brushPressed: number;
            brushPos: [number, number];
            brushOperation: number;
            rainErosion: number;
            rainErosionStrength: number;
            rainErosionDropSize: number;
            flattenTargetHeight: number;
            slopeStartPos: [number, number];
            slopeEndPos: [number, number];
            slopeActive: number;
            sourceCount: number;
            sourcePositions: Float32Array;
            sourceSizes: Float32Array;
            sourceStrengths: Float32Array;
        }
    ): void {
        const device = this.device;

        // Create compute pipeline if not already created
        if (!this.rainPipeline) {
            // Create bind group layout first, then pass to pipeline
            this.rainBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
                createUniformBufferLayoutEntry(3),
            ]);
            this.rainPipeline = this.createComputePipeline(
                RAIN_COMPUTE_SHADER, 'main', this.rainBindGroupLayout
            );
        }

        // Pack uniform buffer with correct WGSL struct alignment.
        // The Uniforms struct contains vec4 (align 16), vec3 (align 16), vec2 (align 8),
        // and i32 members that MUST be written with correct byte patterns (not as floats).
        // Using DataView to write each field at its exact byte offset.
        const RAIN_UNIFORM_BYTE_SIZE = 128; // struct size padded to multiple of 16
        const uniformArrayBuffer = new ArrayBuffer(RAIN_UNIFORM_BYTE_SIZE);
        const view = new DataView(uniformArrayBuffer);
        const LE = true; // little-endian

        // f32 scalars (offset 0-8)
        view.setFloat32(0, uniforms.time, LE);
        view.setFloat32(4, uniforms.rainDegree, LE);
        view.setFloat32(8, uniforms.simRes, LE);
        // byte 12: implicit padding for vec4 (16-byte) alignment

        // vec4<f32> u_MouseWorldPos (offset 16)
        view.setFloat32(16, uniforms.mouseWorldPos[0], LE);
        view.setFloat32(20, uniforms.mouseWorldPos[1], LE);
        view.setFloat32(24, uniforms.mouseWorldPos[2], LE);
        view.setFloat32(28, uniforms.mouseWorldPos[3], LE);

        // vec3<f32> u_MouseWorldDir (offset 32, align 16)
        view.setFloat32(32, uniforms.mouseWorldDir[0], LE);
        view.setFloat32(36, uniforms.mouseWorldDir[1], LE);
        view.setFloat32(40, uniforms.mouseWorldDir[2], LE);

        // f32 scalars after vec3 (offset 44-48)
        view.setFloat32(44, uniforms.brushSize, LE);
        view.setFloat32(48, uniforms.brushStrength, LE);

        // i32 fields — MUST use setInt32 so bit pattern is correct for GPU integer comparison
        view.setInt32(52, uniforms.brushType, LE);
        view.setInt32(56, uniforms.brushPressed, LE);

        // byte 60: implicit padding for vec2 (8-byte) alignment

        // vec2<f32> u_BrushPos (offset 64)
        view.setFloat32(64, uniforms.brushPos[0], LE);
        view.setFloat32(68, uniforms.brushPos[1], LE);

        // i32 fields (offset 72-76)
        view.setInt32(72, uniforms.brushOperation, LE);
        view.setInt32(76, uniforms.rainErosion, LE);

        // f32 scalars (offset 80-88)
        view.setFloat32(80, uniforms.rainErosionStrength, LE);
        view.setFloat32(84, uniforms.rainErosionDropSize, LE);
        view.setFloat32(88, uniforms.flattenTargetHeight, LE);

        // byte 92: implicit padding for vec2 (8-byte) alignment

        // vec2<f32> u_SlopeStartPos (offset 96)
        view.setFloat32(96, uniforms.slopeStartPos[0], LE);
        view.setFloat32(100, uniforms.slopeStartPos[1], LE);

        // vec2<f32> u_SlopeEndPos (offset 104)
        view.setFloat32(104, uniforms.slopeEndPos[0], LE);
        view.setFloat32(108, uniforms.slopeEndPos[1], LE);

        // i32 fields (offset 112-116)
        view.setInt32(112, uniforms.slopeActive, LE);
        view.setInt32(116, uniforms.sourceCount, LE);

        // _padding (offset 120)
        view.setFloat32(120, 0.0, LE);
        // bytes 124-127: struct padding to 128

        let uniformBuffer = this.uniformBuffers.get('rain');
        if (!uniformBuffer || uniformBuffer.size < RAIN_UNIFORM_BYTE_SIZE) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, new Float32Array(uniformArrayBuffer), 'rain-uniforms');
            this.uniformBuffers.set('rain', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformArrayBuffer);
        }

        // Create source data buffer
        const sourceData = new Float32Array(16 * 2 + 16 + 16); // positions + sizes + strengths
        sourceData.set(uniforms.sourcePositions, 0);
        sourceData.set(uniforms.sourceSizes, 16 * 2);
        sourceData.set(uniforms.sourceStrengths, 16 * 2 + 16);

        let sourceBuffer = this.uniformBuffers.get('rain-sources');
        if (!sourceBuffer || sourceBuffer.size < sourceData.byteLength) {
            if (sourceBuffer) sourceBuffer.destroy();
            sourceBuffer = createUniformBuffer(device, sourceData, 'rain-sources');
            this.uniformBuffers.set('rain-sources', sourceBuffer);
        } else {
            device.queue.writeBuffer(sourceBuffer, 0, sourceData.buffer);
        }

        // Create bind group
        const bindGroup = this.createBindGroup(this.rainBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 1),
            { binding: 2, resource: { buffer: uniformBuffer } },
            { binding: 3, resource: { buffer: sourceBuffer } },
        ]);

        // Dispatch compute
        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.rainPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    // Evaporation compute shader (simple - just multiplies water channel)
    private EVAPORATION_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> evapod: f32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let cur = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    let eva = 1.0 - evapod;
    textureStore(writeTerrain, vec2<i32>(global_id.xy), vec4<f32>(cur.x, cur.y * eva, cur.z, cur.w));
}
`;

    // Flow compute shader
    private FLOW_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readFlux: texture_2d<f32>;
@group(0) @binding(2) var readSedi: texture_2d<f32>;
@group(0) @binding(3) var writeFlux: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
};

@group(0) @binding(4) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readTerrain);
    let uv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(texture_size);
    let div = 1.0 / uniforms.u_SimRes;
    let g = 0.80;
    let pipelen = uniforms.u_PipeLen;
    
    let top = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, 1), 0);
    let right = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(1, 0), 0);
    let bottom = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(0, -1), 0);
    let left = textureLoad(readTerrain, vec2<i32>(global_id.xy) + vec2<i32>(-1, 0), 0);
    
    let curTerrain = textureLoad(readTerrain, vec2<i32>(global_id.xy), 0);
    let curFlux = textureLoad(readFlux, vec2<i32>(global_id.xy), 0);
    
    let rockVal = curTerrain.z;
    let isRock = rockVal > 0.1;
    var effectivePipeLen = pipelen;
    if (isRock) {
        effectivePipeLen = pipelen * 0.4;
    }
    
    let Htopout = (curTerrain.y + curTerrain.x) - (top.y + top.x);
    let Hrightout = (curTerrain.y + curTerrain.x) - (right.y + right.x);
    let Hbottomout = (curTerrain.y + curTerrain.x) - (bottom.x + bottom.y);
    let Hleftout = (curTerrain.y + curTerrain.x) - (left.y + left.x);
    
    var ftopout = max(0.0, curFlux.x + (uniforms.u_timestep * g * uniforms.u_PipeArea * Htopout) / effectivePipeLen);
    var frightout = max(0.0, curFlux.y + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hrightout) / effectivePipeLen);
    var fbottomout = max(0.0, curFlux.z + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hbottomout) / effectivePipeLen);
    var fleftout = max(0.0, curFlux.w + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hleftout) / effectivePipeLen);
    
    let waterOut = uniforms.u_timestep * (ftopout + frightout + fbottomout + fleftout);
    let k = min(1.0, (curTerrain.y * uniforms.u_PipeLen * uniforms.u_PipeLen) / waterOut);
    
    ftopout *= k;
    frightout *= k;
    fbottomout *= k;
    fleftout *= k;
    
    // Boundary conditions
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        ftopout = 0.0;
        frightout = 0.0;
        fbottomout = 0.0;
        fleftout = 0.0;
    }
    
    textureStore(writeFlux, vec2<i32>(global_id.xy), vec4<f32>(ftopout, frightout, fbottomout, fleftout));
}
`;

    // Water height / velocity compute shader (alterwaterhight-frag.glsl)
    private WATER_HEIGHT_COMPUTE_SHADER = `
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
`;

    // Sediment compute shader (sediment-frag.glsl) - 4 outputs: terrain, sediment, terrainNormal, velocity
    private SEDIMENT_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readVelocity: texture_2d<f32>;
@group(0) @binding(2) var readSediment: texture_2d<f32>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var writeTerrainNormal: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var writeVelocity: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_Ks: f32,
    u_Kc: f32,
    u_Kd: f32,
    u_timestep: f32,
    u_Time: f32,
    u_RockErosionResistance: f32,
};

@group(0) @binding(7) var<uniform> uniforms: Uniforms;

fn calnor(coord: vec2<i32>) -> vec3<f32> {
    let r = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let t = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let b = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let l = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    var nor = vec3<f32>(l.x - r.x, 2.0, t.x - b.x);
    nor = normalize(nor);
    return nor;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let div = 1.0 / uniforms.u_SimRes;

    var Kc = uniforms.u_Kc;
    var Ks = uniforms.u_Ks;
    var Kd = uniforms.u_Kd;

    let curTerrain = textureLoad(readTerrain, coord, 0);
    var rockMaterialValue = curTerrain.z;
    let isRock = rockMaterialValue > 0.1;
    var baseRockSurfaceHeight = curTerrain.w;
    if (isRock && baseRockSurfaceHeight < 0.001) {
        baseRockSurfaceHeight = curTerrain.x;
    }

    let rockStrength = clamp((rockMaterialValue - 0.1) / 0.9, 0.0, 1.0);
    var rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, isRock);
    let hasSedimentOnRock = isRock && curTerrain.x > baseRockSurfaceHeight + 0.001;
    var neighborRockFactor = 1.0;
    var capacityBoost = 1.0;
    let wasRecentlyRock = curTerrain.z > 0.05;

    if (!isRock && !wasRecentlyRock) {
        let topTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
        let rightTerrain = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
        let bottomTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
        let leftTerrain = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
        var rockNeighbors = 0;
        if (topTerrain.z > 0.1) { rockNeighbors++; }
        if (rightTerrain.z > 0.1) { rockNeighbors++; }
        if (bottomTerrain.z > 0.1) { rockNeighbors++; }
        if (leftTerrain.z > 0.1) { rockNeighbors++; }
        if (rockNeighbors > 0) {
            neighborRockFactor = 1.0 + f32(rockNeighbors) * 0.5;
            capacityBoost = 1.0 + f32(rockNeighbors) * 0.3;
        }
    }

    var effectiveCapacityRockFactor = select(rockFactor, 1.0, hasSedimentOnRock);
    Ks *= neighborRockFactor;
    Kc *= capacityBoost;
    Kc *= effectiveCapacityRockFactor;

    let nor = calnor(coord);
    let slopeSin = abs(sqrt(1.0 - nor.y * nor.y));

    let curvel = textureLoad(readVelocity, coord, 0);
    let curSediment = textureLoad(readSediment, coord, 0);
    let velo = length(curvel.xy);
    let slope = max(0.1, abs(slopeSin));
    let sedicap = Kc * slope * velo;

    var cursedi = curSediment.x;
    var hight = curTerrain.x;
    var outsedi = curSediment.x;
    var heightChange = 0.0;
    var originalRockMaterial = curTerrain.z;

    if (sedicap > cursedi) {
        let erodingSedimentLayer = hasSedimentOnRock && hight > baseRockSurfaceHeight;
        let effectiveRockFactor = select(rockFactor, 1.0, erodingSedimentLayer);
        var changesedi = (sedicap - cursedi) * (Ks * effectiveRockFactor);
        hight = hight - changesedi;
        heightChange = -changesedi;
        if (hasSedimentOnRock && hight <= baseRockSurfaceHeight) {
            baseRockSurfaceHeight = hight;
        }
        let sedimentOutputFactor = select(effectiveCapacityRockFactor, 1.0, erodingSedimentLayer);
        outsedi = outsedi + changesedi * sedimentOutputFactor;
        if (rockMaterialValue > 0.1 && changesedi > 0.0 && !erodingSedimentLayer) {
            let conversionRate = min(changesedi * 0.05, originalRockMaterial * 0.01);
            originalRockMaterial = max(0.0, originalRockMaterial - conversionRate);
        }
    } else {
        var changesedi = (cursedi - sedicap) * Kd;
        if (isRock && baseRockSurfaceHeight < 0.001) {
            baseRockSurfaceHeight = curTerrain.x;
        }
        hight = hight + changesedi;
        heightChange = changesedi;
        outsedi = outsedi - changesedi;
    }

    var finalRockMaterial = originalRockMaterial;
    let waterLevel = curTerrain.y;
    let waterVelocity = length(curvel.xy);
    let currentTotalHeight = hight + waterLevel;
    let canSpreadRock = waterLevel < 0.1 && waterVelocity < 0.5;

    if (!isRock && heightChange < 0.0 && canSpreadRock && !wasRecentlyRock) {
        let topTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
        let rightTerrain = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
        let bottomTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
        let leftTerrain = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
        var lowestContiguousRockHeight = 999999.0;
        var bestRockValue = 0.0;
        var contiguousRockCount = 0u;

        if (topTerrain.z > 0.5) {
            if (topTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = topTerrain.x;
                bestRockValue = topTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (rightTerrain.z > 0.5) {
            if (rightTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = rightTerrain.x;
                bestRockValue = rightTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (bottomTerrain.z > 0.5) {
            if (bottomTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = bottomTerrain.x;
                bestRockValue = bottomTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (leftTerrain.z > 0.5) {
            if (leftTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = leftTerrain.x;
                bestRockValue = leftTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }

        let originalTerrainHeight = curTerrain.x;
        if (contiguousRockCount > 0u && originalTerrainHeight > lowestContiguousRockHeight) {
            let depthBelowContiguousEdge = lowestContiguousRockHeight - hight;
            var lowestRockTotalHeight = 999999.0;
            if (topTerrain.z > 0.5) {
                let rockTotalHeight = topTerrain.x + topTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (rightTerrain.z > 0.5) {
                let rockTotalHeight = rightTerrain.x + rightTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (bottomTerrain.z > 0.5) {
                let rockTotalHeight = bottomTerrain.x + bottomTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (leftTerrain.z > 0.5) {
                let rockTotalHeight = leftTerrain.x + leftTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            let isBelowWaterSurface = currentTotalHeight < lowestRockTotalHeight + 0.3;
            if (depthBelowContiguousEdge >= 0.2 && !isBelowWaterSurface) {
                let erosionAmount = abs(heightChange);
                let effectiveDepth = depthBelowContiguousEdge - 0.2;
                let depthFactor = clamp(effectiveDepth * 2.0, 0.0, 1.0);
                let spreadFactor = min(erosionAmount * 0.5 * (1.0 + depthFactor * 0.2), 0.01);
                let currentRockValue = curTerrain.z;
                let newRockValue = max(currentRockValue, mix(currentRockValue, 1.0, spreadFactor));
                let rockMaterialAdded = newRockValue - currentRockValue;
                if (rockMaterialAdded > 0.0) {
                    let sedimentConsumed = rockMaterialAdded * outsedi * 0.5;
                    outsedi = max(0.0, outsedi - sedimentConsumed);
                    let heightAdjustment = rockMaterialAdded * effectiveDepth * 0.05 * 1.1;
                    hight = hight + heightAdjustment;
                }
                finalRockMaterial = newRockValue;
                baseRockSurfaceHeight = hight;
            }
        }
    }

    if (finalRockMaterial > 0.5 && baseRockSurfaceHeight < 0.001) {
        baseRockSurfaceHeight = hight;
    }

    textureStore(writeTerrainNormal, coord, vec4<f32>(vec3<f32>(abs(slopeSin)), 1.0));
    textureStore(writeSediment, coord, vec4<f32>(outsedi, 0.0, 0.0, 1.0));
    textureStore(writeTerrain, coord, vec4<f32>(hight, curTerrain.y, finalRockMaterial, baseRockSurfaceHeight));
    textureStore(writeVelocity, coord, curvel);
}
`;

    // Sediment advection simple (sediadvect-frag.glsl) - 3 outputs
    private SEDIMENT_ADVECT_SIMPLE_SHADER = `
@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSediment: texture_2d<f32>;
@group(0) @binding(2) var readSedimentBlend: texture_2d<f32>;
@group(0) @binding(3) var readTerrain: texture_2d<f32>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var writeVel: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var writeSedimentBlend: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
    unif_advectMultiplier: f32,
};

@group(0) @binding(7) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = vec2<f32>(f32(textureDimensions(readSediment).x), f32(textureDimensions(readSediment).y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;

    let curvel = textureLoad(readVel, coord, 0);
    let cursedi = textureLoad(readSediment, coord, 0);
    let curterrain = textureLoad(readTerrain, coord, 0);

    var useVel = curvel / uniforms.u_SimRes;
    useVel = useVel * uniforms.unif_advectMultiplier * 0.5;

    let oldloc = vec2<f32>(
        curuv.x - useVel.x * uniforms.u_timestep,
        curuv.y - useVel.y * uniforms.u_timestep
    );
    let uv_tex = oldloc * dim - 0.5;
    let i0 = clamp(i32(floor(uv_tex.x)), 0, i32(dim.x) - 1);
    let j0 = clamp(i32(floor(uv_tex.y)), 0, i32(dim.y) - 1);
    let i1 = min(i0 + 1, i32(dim.x) - 1);
    let j1 = min(j0 + 1, i32(dim.y) - 1);
    let fx = fract(uv_tex.x);
    let fy = fract(uv_tex.y);
    let v00 = textureLoad(readSediment, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readSediment, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readSediment, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readSediment, vec2<i32>(i1, j1), 0);
    let oldsedi = mix(mix(v00.x, v10.x, fx), mix(v01.x, v11.x, fx), fy);

    let curSediVal = cursedi.x * curterrain.y * 0.1;
    let sediBlendVal = textureLoad(readSedimentBlend, coord, 0).x;
    let newSediBlendVal = (sediBlendVal * 1660.0 + curSediVal) / 1661.0;

    textureStore(writeSediment, coord, vec4<f32>(oldsedi, 0.0, 0.0, 1.0));
    textureStore(writeVel, coord, curvel);
    textureStore(writeSedimentBlend, coord, vec4<f32>(newSediBlendVal, 0.0, 0.0, 1.0));
}
`;

    // Sediment advection forward (for MacCormack) - writes to sedimentAdvectA only
    private SEDIMENT_ADVECT_FORWARD_SHADER = `
@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSediment: texture_2d<f32>;
@group(0) @binding(2) var writeSedimentAdvectA: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
    unif_advectMultiplier: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = vec2<f32>(f32(textureDimensions(readSediment).x), f32(textureDimensions(readSediment).y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;

    let curvel = textureLoad(readVel, coord, 0);
    var useVel = curvel / uniforms.u_SimRes;
    useVel = useVel * uniforms.unif_advectMultiplier * 0.5;

    let oldloc = vec2<f32>(
        curuv.x - useVel.x * uniforms.u_timestep,
        curuv.y - useVel.y * uniforms.u_timestep
    );
    let uv_tex = oldloc * dim - 0.5;
    let i0 = clamp(i32(floor(uv_tex.x)), 0, i32(dim.x) - 1);
    let j0 = clamp(i32(floor(uv_tex.y)), 0, i32(dim.y) - 1);
    let i1 = min(i0 + 1, i32(dim.x) - 1);
    let j1 = min(j0 + 1, i32(dim.y) - 1);
    let fx = fract(uv_tex.x);
    let fy = fract(uv_tex.y);
    let v00 = textureLoad(readSediment, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readSediment, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readSediment, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readSediment, vec2<i32>(i1, j1), 0);
    let oldsedi = mix(mix(v00.x, v10.x, fx), mix(v01.x, v11.x, fx), fy);

    textureStore(writeSedimentAdvectA, coord, vec4<f32>(oldsedi, 0.0, 0.0, 1.0));
}
`;

    // Sediment advection backward (for MacCormack) - sample A at backward-traced position, write B
    private SEDIMENT_ADVECT_BACKWARD_SHADER = `
@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSedimentAdvectA: texture_2d<f32>;
@group(0) @binding(2) var writeSedimentAdvectB: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = vec2<f32>(f32(textureDimensions(readSedimentAdvectA).x), f32(textureDimensions(readSedimentAdvectA).y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;

    let curvel = textureLoad(readVel, coord, 0);
    let useVel = curvel.xy / uniforms.u_SimRes * uniforms.u_timestep;
    let oldloc = vec2<f32>(curuv.x + useVel.x, curuv.y + useVel.y);
    let uv_tex = oldloc * dim - 0.5;
    let i0 = clamp(i32(floor(uv_tex.x)), 0, i32(dim.x) - 1);
    let j0 = clamp(i32(floor(uv_tex.y)), 0, i32(dim.y) - 1);
    let i1 = min(i0 + 1, i32(dim.x) - 1);
    let j1 = min(j0 + 1, i32(dim.y) - 1);
    let fx = fract(uv_tex.x);
    let fy = fract(uv_tex.y);
    let v00 = textureLoad(readSedimentAdvectA, vec2<i32>(i0, j0), 0);
    let v10 = textureLoad(readSedimentAdvectA, vec2<i32>(i1, j0), 0);
    let v01 = textureLoad(readSedimentAdvectA, vec2<i32>(i0, j1), 0);
    let v11 = textureLoad(readSedimentAdvectA, vec2<i32>(i1, j1), 0);
    let oldsedi = mix(mix(v00.x, v10.x, fx), mix(v01.x, v11.x, fx), fy);

    textureStore(writeSedimentAdvectB, coord, vec4<f32>(oldsedi, 0.0, 0.0, 1.0));
}
`;

    // MacCormack correction (maccormack-frag.glsl) + sediment blend update
    private MACCORMACK_CORRECTION_SHADER = `
@group(0) @binding(0) var readVel: texture_2d<f32>;
@group(0) @binding(1) var readSediment: texture_2d<f32>;
@group(0) @binding(2) var readSedimentAdvectA: texture_2d<f32>;
@group(0) @binding(3) var readSedimentAdvectB: texture_2d<f32>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;

@group(0) @binding(6) var readTerrain: texture_2d<f32>;
@group(0) @binding(7) var readSedimentBlend: texture_2d<f32>;
@group(0) @binding(8) var writeSedimentBlend: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_timestep: f32,
};

@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let dim = f32(textureDimensions(readSediment).x);
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / vec2<f32>(dim, dim);

    let curvel = textureLoad(readVel, coord, 0);
    let targetPos = curuv * dim - uniforms.u_timestep * curvel.xy;
    let st_xy = floor(targetPos - 0.5) + 0.5;
    let st_zw = st_xy + 1.0;
    let st_xy_i = vec2<i32>(i32(st_xy.x), i32(st_xy.y));
    let st_zy_i = vec2<i32>(i32(st_zw.x), i32(st_xy.y));
    let st_xw_i = vec2<i32>(i32(st_xy.x), i32(st_zw.y));
    let st_zw_i = vec2<i32>(i32(st_zw.x), i32(st_zw.y));
    let dim_i = i32(dim);
    let nodeVal0 = textureLoad(readSediment, clamp(st_xy_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal1 = textureLoad(readSediment, clamp(st_zy_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal2 = textureLoad(readSediment, clamp(st_xw_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let nodeVal3 = textureLoad(readSediment, clamp(st_zw_i, vec2<i32>(0, 0), vec2<i32>(dim_i - 1, dim_i - 1)), 0).x;
    let clampMin = min(min(min(nodeVal0, nodeVal1), nodeVal2), nodeVal3);
    let clampMax = max(max(max(nodeVal0, nodeVal1), nodeVal2), nodeVal3);

    let sediment = textureLoad(readSediment, coord, 0).x;
    let advectA = textureLoad(readSedimentAdvectA, coord, 0).x;
    let advectB = textureLoad(readSedimentAdvectB, coord, 0).x;
    var res = advectA + 0.5 * (sediment - advectB);
    res = clamp(res, clampMin, clampMax);

    textureStore(writeSediment, coord, vec4<f32>(res, 0.0, 0.0, 1.0));

    // Sediment blend accumulation (flow trace data) — matches simple advection formula
    let curTerrain = textureLoad(readTerrain, coord, 0);
    let curSediVal = sediment * curTerrain.y * 0.1;
    let sediBlendVal = textureLoad(readSedimentBlend, coord, 0).x;
    let newSediBlendVal = (sediBlendVal * 1660.0 + curSediVal) / 1661.0;
    textureStore(writeSedimentBlend, coord, vec4<f32>(newSediBlendVal, 0.0, 0.0, 1.0));
}
`;

    // Max slippage compute shader (maxslippageheight-frag.glsl)
    private MAX_SLIPPAGE_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeMaxSlippage: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    unif_TalusScale: f32,
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let terraintop = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let terrainright = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let terrainbottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let terrainleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let terraincur = textureLoad(readTerrain, coord, 0);

    let _maxHeightDiff = uniforms.unif_TalusScale;
    let maxLocalDiff = _maxHeightDiff * 0.01;
    var avgDiff = (terraintop.x + terrainright.x + terrainbottom.x + terrainleft.x) * 0.25 - terraincur.x;
    avgDiff = 10.0 * max(abs(avgDiff) - maxLocalDiff, 0.0);

    // Boundary: at edges, use max slippage (no thermal erosion) to prevent artifacts from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    var result = max(_maxHeightDiff - avgDiff, 0.0);
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        result = _maxHeightDiff;
    }

    textureStore(writeMaxSlippage, coord, vec4<f32>(result, 0.0, 0.0, 1.0));
}
`;

    // Thermal flux compute shader (thermalterrainflux-frag.glsl)
    private THERMAL_FLUX_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readMaxSlippage: texture_2d<f32>;
@group(0) @binding(2) var writeTerrainFlux: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    unif_thermalRate: f32,
    u_RockErosionResistance: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let terraintop = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let terrainright = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let terrainbottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let terrainleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let terraincur = textureLoad(readTerrain, coord, 0);

    // Rock-awareness: reduce thermal flux from rock cells
    let rockVal = terraincur.z;
    let rockStrength = clamp((rockVal - 0.1) / 0.9, 0.0, 1.0);
    let rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, rockVal > 0.1);

    let slippagetop = textureLoad(readMaxSlippage, coord + vec2<i32>(0, 1), 0).x;
    let slippageright = textureLoad(readMaxSlippage, coord + vec2<i32>(1, 0), 0).x;
    let slippagebottom = textureLoad(readMaxSlippage, coord + vec2<i32>(0, -1), 0).x;
    let slippageleft = textureLoad(readMaxSlippage, coord + vec2<i32>(-1, 0), 0).x;
    let slippagecur = textureLoad(readMaxSlippage, coord, 0).x;

    var diff = vec4<f32>(
        terraincur.x - terraintop.x - (slippagecur + slippagetop) * 0.5,
        terraincur.x - terrainright.x - (slippagecur + slippageright) * 0.5,
        terraincur.x - terrainbottom.x - (slippagecur + slippagebottom) * 0.5,
        terraincur.x - terrainleft.x - (slippagecur + slippageleft) * 0.5
    );
    diff = max(diff, vec4<f32>(0.0));

    var newFlow = diff * 1.2 * rockFactor;

    var outfactor = (newFlow.x + newFlow.y + newFlow.z + newFlow.w) * uniforms.u_timestep;
    if (outfactor > 1e-5) {
        outfactor = terraincur.x / outfactor;
        if (outfactor > 1.0) { outfactor = 1.0; }
        newFlow = newFlow * outfactor;
    }

    // Boundary protection: zero thermal flux at edges to prevent erosion from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        newFlow = vec4<f32>(0.0);
    }

    textureStore(writeTerrainFlux, coord, newFlow);
}
`;

    // Thermal apply compute shader (thermalapply-frag.glsl)
    private THERMAL_APPLY_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrainFlux: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    unif_thermalErosionScale: f32,
    u_RockErosionResistance: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);

    let topflux = textureLoad(readTerrainFlux, coord + vec2<i32>(0, 1), 0);
    let rightflux = textureLoad(readTerrainFlux, coord + vec2<i32>(1, 0), 0);
    let bottomflux = textureLoad(readTerrainFlux, coord + vec2<i32>(0, -1), 0);
    let leftflux = textureLoad(readTerrainFlux, coord + vec2<i32>(-1, 0), 0);
    let outputflux = textureLoad(readTerrainFlux, coord, 0);

    let inputflux = vec4<f32>(topflux.z, rightflux.w, bottomflux.x, leftflux.y);
    let vol = inputflux.x + inputflux.y + inputflux.z + inputflux.w - outputflux.x - outputflux.y - outputflux.z - outputflux.w;

    let thermalErosionScale = uniforms.unif_thermalErosionScale;
    let tdelta = min(50.0, uniforms.u_timestep * thermalErosionScale) * vol;

    let curTerrain = textureLoad(readTerrain, coord, 0);

    // Rock-awareness: reduce thermal erosion on rock cells
    let rockVal = curTerrain.z;
    let rockStrength = clamp((rockVal - 0.1) / 0.9, 0.0, 1.0);
    let rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, rockVal > 0.1);

    // Boundary protection: skip thermal erosion at edges
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    var safeDelta = tdelta * rockFactor;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        safeDelta = 0.0;
    }

    textureStore(writeTerrain, coord, vec4<f32>(curTerrain.x + safeDelta, curTerrain.y, curTerrain.z, curTerrain.w));
}
`;

    // Average smoothing compute shader (average-frag.glsl) - 2 outputs: terrain, writeAvg (terrainNorTexture)
    private AVERAGE_COMPUTE_SHADER = `
@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var writeAvg: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    unif_ErosionMode: f32,
};

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let diagonalWeight = 0.707;
    var threathhold = 0.1;

    let cur = textureLoad(readTerrain, coord, 0);
    let top = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let topright = textureLoad(readTerrain, coord + vec2<i32>(1, 1), 0);
    let right = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let bottomright = textureLoad(readTerrain, coord + vec2<i32>(1, -1), 0);
    let bottom = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let bottomleft = textureLoad(readTerrain, coord + vec2<i32>(-1, -1), 0);
    let left = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    let topleft = textureLoad(readTerrain, coord + vec2<i32>(-1, 1), 0);

    let t_d = cur.x - top.x;
    let r_d = cur.x - right.x;
    let b_d = cur.x - bottom.x;
    let l_d = cur.x - left.x;
    let tr_d = cur.x - topright.x;
    let br_d = cur.x - bottomright.x;
    let bl_d = cur.x - bottomleft.x;
    let tl_d = cur.x - topleft.x;

    var avg_hdiff = t_d + r_d + b_d + l_d + (tr_d + br_d + bl_d + tl_d) * diagonalWeight;
    avg_hdiff = avg_hdiff / (4.0 * (1.0 + diagonalWeight));
    avg_hdiff = abs(avg_hdiff);

    var avg_hdiff_4 = t_d + r_d + b_d + l_d;
    avg_hdiff_4 = avg_hdiff_4 / 4.0;
    avg_hdiff_4 = abs(avg_hdiff_4);

    if (uniforms.unif_ErosionMode == 1.0) {
        threathhold = avg_hdiff / 2.0;
    } else if (uniforms.unif_ErosionMode == 2.0) {
        threathhold = pow(avg_hdiff, 3.0);
    }

    var cur_h = cur.x;
    var col = 0.0;
    let curWeight = 8.0;

    // Skip smoothing for rock cells (rock resists all erosion types)
    let rockVal = cur.z;
    let isRock = rockVal > 0.1;

    if (!isRock && (((abs(r_d) > threathhold && abs(l_d) > threathhold) && r_d * l_d > 0.0) ||
        ((abs(t_d) > threathhold && abs(b_d) > threathhold) && t_d * b_d > 0.0) ||
        ((abs(tr_d) > threathhold && abs(bl_d) > threathhold) && tr_d * bl_d > 0.0) ||
        ((abs(tl_d) > threathhold && abs(br_d) > threathhold) && tl_d * br_d > 0.0))) {
        cur_h = (cur.x * curWeight + top.x + right.x + bottom.x + left.x + topright.x * diagonalWeight + topleft.x * diagonalWeight + bottomleft.x * diagonalWeight + bottomright.x * diagonalWeight) / (4.0 * (1.0 + diagonalWeight) + curWeight);
        col = 1.0;
    }

    // Boundary protection: skip smoothing at edges to prevent artifacts from out-of-bounds reads
    let dim = vec2<f32>(f32(textureDimensions(readTerrain).x), f32(textureDimensions(readTerrain).y));
    let uv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let div = 1.0 / uniforms.u_SimRes;
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        cur_h = cur.x;
        col = 0.0;
    }

    textureStore(writeTerrain, coord, vec4<f32>(cur_h, cur.y, cur.z, cur.w));
    textureStore(writeAvg, coord, vec4<f32>(col, col, col, 1.0));
}
`;

    private flowPipeline: GPUComputePipeline | null = null;
    private flowBindGroupLayout: GPUBindGroupLayout | null = null;
    private waterHeightPipeline: GPUComputePipeline | null = null;
    private waterHeightBindGroupLayout: GPUBindGroupLayout | null = null;
    private sedimentPipeline: GPUComputePipeline | null = null;
    private sedimentBindGroupLayout: GPUBindGroupLayout | null = null;
    private sedimentAdvectSimplePipeline: GPUComputePipeline | null = null;
    private sedimentAdvectSimpleBindGroupLayout: GPUBindGroupLayout | null = null;
    private sedimentAdvectForwardPipeline: GPUComputePipeline | null = null;
    private sedimentAdvectForwardBindGroupLayout: GPUBindGroupLayout | null = null;
    private sedimentAdvectBackwardPipeline: GPUComputePipeline | null = null;
    private sedimentAdvectBackwardBindGroupLayout: GPUBindGroupLayout | null = null;
    private maccormackCorrectionPipeline: GPUComputePipeline | null = null;
    private maccormackCorrectionBindGroupLayout: GPUBindGroupLayout | null = null;
    private maxSlippagePipeline: GPUComputePipeline | null = null;
    private maxSlippageBindGroupLayout: GPUBindGroupLayout | null = null;
    private thermalFluxPipeline: GPUComputePipeline | null = null;
    private thermalFluxBindGroupLayout: GPUBindGroupLayout | null = null;
    private thermalApplyPipeline: GPUComputePipeline | null = null;
    private thermalApplyBindGroupLayout: GPUBindGroupLayout | null = null;
    private averagePipeline: GPUComputePipeline | null = null;
    private averageBindGroupLayout: GPUBindGroupLayout | null = null;
    private evaporationPipeline: GPUComputePipeline | null = null;
    private evaporationBindGroupLayout: GPUBindGroupLayout | null = null;

    // Lava compute pipelines
    private lavaSourcePipeline: GPUComputePipeline | null = null;
    private lavaSourceBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaFluxPipeline: GPUComputePipeline | null = null;
    private lavaFluxBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaHeightVelPipeline: GPUComputePipeline | null = null;
    private lavaHeightVelBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaThermalErosionPipeline: GPUComputePipeline | null = null;
    private lavaThermalErosionBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaCoolingPipeline: GPUComputePipeline | null = null;
    private lavaCoolingBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaWaterInteractionPipeline: GPUComputePipeline | null = null;
    private lavaWaterInteractionBindGroupLayout: GPUBindGroupLayout | null = null;

    /**
     * Flow (flux) compute pass.
     * Ports flow-frag.glsl to WGSL compute shader.
     */
    flowPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
        }
    ): void {
        const device = this.device;

        if (!this.flowPipeline) {
            this.flowBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
            ]);
            this.flowPipeline = this.createComputePipeline(
                this.FLOW_COMPUTE_SHADER, 'main', this.flowBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes,
            uniforms.pipeLen,
            uniforms.timestep,
            uniforms.pipeArea,
        ]);

        let uniformBuffer = this.uniformBuffers.get('flow');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'flow-uniforms');
            this.uniformBuffers.set('flow', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.flowBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createSampledTextureBinding(texturePool.readFluxTexture, 1),
            createSampledTextureBinding(texturePool.readSedimentTexture, 2),
            createStorageTextureBinding(texturePool.writeFluxTexture, 3),
            { binding: 4, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.flowPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Evaporation compute pass.
     * Ports eva-frag.glsl to WGSL compute shader.
     */
    evaporationPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            evaporationConstant: number;
        }
    ): void {
        const device = this.device;

        if (!this.evaporationPipeline) {
            this.evaporationBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
            ]);
            this.evaporationPipeline = this.createComputePipeline(
                this.EVAPORATION_COMPUTE_SHADER, 'main', this.evaporationBindGroupLayout
            );
        }

        const uniformData = new Float32Array([uniforms.evaporationConstant]);
        let uniformBuffer = this.uniformBuffers.get('evaporation');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'evaporation-uniforms');
            this.uniformBuffers.set('evaporation', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.evaporationBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 1),
            { binding: 2, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.evaporationPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Water Height compute pass (MRT: 2 outputs - terrain, velocity).
     * Ports alterwaterhight-frag.glsl to WGSL compute shader.
     */
    waterHeightPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            velMult: number;
            time: number;
            velAdvMag: number;
        }
    ): void {
        const device = this.device;

        if (!this.waterHeightPipeline) {
            this.waterHeightBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createStorageTextureLayoutEntry(4, 'write-only'),
                createUniformBufferLayoutEntry(5),
            ]);
            this.waterHeightPipeline = this.createComputePipeline(
                this.WATER_HEIGHT_COMPUTE_SHADER,
                'main',
                this.waterHeightBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes,
            uniforms.pipeLen,
            uniforms.timestep,
            uniforms.pipeArea,
            uniforms.velMult,
            uniforms.time,
            uniforms.velAdvMag,
        ]);

        let uniformBuffer = this.uniformBuffers.get('waterHeight');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'waterHeight-uniforms');
            this.uniformBuffers.set('waterHeight', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.waterHeightBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readFluxTexture, 0),
            createSampledTextureBinding(texturePool.readTerrainTexture, 1),
            createSampledTextureBinding(texturePool.readVelTexture, 2),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 3),
            createStorageTextureBinding(texturePool.writeVelTexture, 4),
            { binding: 5, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.waterHeightPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Sediment compute pass (MRT: 4 outputs - terrain, sediment, terrain_nor, velocity).
     * Ports sediment-frag.glsl to WGSL compute shader.
     */
    sedimentPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            Kc: number;
            Ks: number;
            Kd: number;
            time: number;
            rockErosionResistance: number;
        }
    ): void {
        const device = this.device;

        if (!this.sedimentPipeline) {
            this.sedimentBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createStorageTextureLayoutEntry(4, 'write-only'),
                createStorageTextureLayoutEntry(5, 'write-only'),
                createStorageTextureLayoutEntry(6, 'write-only'),
                createUniformBufferLayoutEntry(7),
            ]);
            this.sedimentPipeline = this.createComputePipeline(
                this.SEDIMENT_COMPUTE_SHADER,
                'main',
                this.sedimentBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes,
            uniforms.pipeLen,
            uniforms.Ks,
            uniforms.Kc,
            uniforms.Kd,
            uniforms.timestep,
            uniforms.time,
            uniforms.rockErosionResistance,
        ]);

        let uniformBuffer = this.uniformBuffers.get('sediment');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'sediment-uniforms');
            this.uniformBuffers.set('sediment', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.sedimentBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createSampledTextureBinding(texturePool.readVelTexture, 1),
            createSampledTextureBinding(texturePool.readSedimentTexture, 2),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 3),
            createStorageTextureBinding(texturePool.writeSedimentTexture, 4),
            createStorageTextureBinding(texturePool.terrainNorTexture, 5),
            createStorageTextureBinding(texturePool.writeVelTexture, 6),
            { binding: 7, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.sedimentPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Sediment advection compute pass (MRT: 3 outputs for simple; MacCormack uses 3 subpasses).
     * Ports sediadvect-frag.glsl and maccormack-frag.glsl to WGSL compute shader.
     */
    sedimentAdvectionPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            timestep: number;
            advectionMethod: number; // 1 = MacCormack, else = Simple
            advectMultiplier: number;
        }
    ): void {
        const device = this.device;

        if (uniforms.advectionMethod === 1) {
            // MacCormack: forward -> backward -> correction
            if (!this.sedimentAdvectForwardPipeline) {
                this.sedimentAdvectForwardBindGroupLayout = this.createBindGroupLayout([
                    createSampledTextureLayoutEntry(0),
                    createSampledTextureLayoutEntry(1),
                    createStorageTextureLayoutEntry(2, 'write-only'),
                    createUniformBufferLayoutEntry(3),
                ]);
                this.sedimentAdvectForwardPipeline = this.createComputePipeline(
                    this.SEDIMENT_ADVECT_FORWARD_SHADER,
                    'main',
                    this.sedimentAdvectForwardBindGroupLayout
                );
            }
            if (!this.sedimentAdvectBackwardPipeline) {
                this.sedimentAdvectBackwardBindGroupLayout = this.createBindGroupLayout([
                    createSampledTextureLayoutEntry(0),
                    createSampledTextureLayoutEntry(1),
                    createStorageTextureLayoutEntry(2, 'write-only'),
                    createUniformBufferLayoutEntry(3),
                ]);
                this.sedimentAdvectBackwardPipeline = this.createComputePipeline(
                    this.SEDIMENT_ADVECT_BACKWARD_SHADER,
                    'main',
                    this.sedimentAdvectBackwardBindGroupLayout
                );
            }
            if (!this.maccormackCorrectionPipeline) {
                this.maccormackCorrectionBindGroupLayout = this.createBindGroupLayout([
                    createSampledTextureLayoutEntry(0),
                    createSampledTextureLayoutEntry(1),
                    createSampledTextureLayoutEntry(2),
                    createSampledTextureLayoutEntry(3),
                    createStorageTextureLayoutEntry(4, 'write-only'),
                    createUniformBufferLayoutEntry(5),
                    createSampledTextureLayoutEntry(6),
                    createSampledTextureLayoutEntry(7),
                    createStorageTextureLayoutEntry(8, 'write-only'),
                ]);
                this.maccormackCorrectionPipeline = this.createComputePipeline(
                    this.MACCORMACK_CORRECTION_SHADER,
                    'main',
                    this.maccormackCorrectionBindGroupLayout
                );
            }

            const forwardUniformData = new Float32Array([
                uniforms.simRes,
                uniforms.timestep,
                uniforms.advectMultiplier,
            ]);
            let forwardUniformBuffer = this.uniformBuffers.get('sedimentAdvectForward');
            if (!forwardUniformBuffer || forwardUniformBuffer.size < forwardUniformData.byteLength) {
                if (forwardUniformBuffer) forwardUniformBuffer.destroy();
                forwardUniformBuffer = createUniformBuffer(device, forwardUniformData, 'sedimentAdvectForward-uniforms');
                this.uniformBuffers.set('sedimentAdvectForward', forwardUniformBuffer);
            } else {
                device.queue.writeBuffer(forwardUniformBuffer, 0, forwardUniformData.buffer);
            }

            const backwardUniformData = new Float32Array([uniforms.simRes, uniforms.timestep]);
            let backwardUniformBuffer = this.uniformBuffers.get('sedimentAdvectBackward');
            if (!backwardUniformBuffer || backwardUniformBuffer.size < backwardUniformData.byteLength) {
                if (backwardUniformBuffer) backwardUniformBuffer.destroy();
                backwardUniformBuffer = createUniformBuffer(device, backwardUniformData, 'sedimentAdvectBackward-uniforms');
                this.uniformBuffers.set('sedimentAdvectBackward', backwardUniformBuffer);
            } else {
                device.queue.writeBuffer(backwardUniformBuffer, 0, backwardUniformData.buffer);
            }

            const correctionUniformData = new Float32Array([uniforms.simRes, uniforms.timestep]);
            let correctionUniformBuffer = this.uniformBuffers.get('maccormackCorrection');
            if (!correctionUniformBuffer || correctionUniformBuffer.size < correctionUniformData.byteLength) {
                if (correctionUniformBuffer) correctionUniformBuffer.destroy();
                correctionUniformBuffer = createUniformBuffer(device, correctionUniformData, 'maccormackCorrection-uniforms');
                this.uniformBuffers.set('maccormackCorrection', correctionUniformBuffer);
            } else {
                device.queue.writeBuffer(correctionUniformBuffer, 0, correctionUniformData.buffer);
            }

            const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);

            // 1. Forward advect: read sediment, vel -> write sedimentAdvectA
            const encoder1 = device.createCommandEncoder();
            const pass1 = encoder1.beginComputePass();
            pass1.setPipeline(this.sedimentAdvectForwardPipeline);
            pass1.setBindGroup(0, this.createBindGroup(this.sedimentAdvectForwardBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.readSedimentTexture, 1),
                createStorageTextureBinding(texturePool.sedimentAdvectATexture, 2),
                { binding: 3, resource: { buffer: forwardUniformBuffer } },
            ]));
            pass1.dispatchWorkgroups(workgroupX, workgroupY, 1);
            pass1.end();
            device.queue.submit([encoder1.finish()]);

            // 2. Backward advect: read vel, sedimentAdvectA -> write sedimentAdvectB
            const encoder2 = device.createCommandEncoder();
            const pass2 = encoder2.beginComputePass();
            pass2.setPipeline(this.sedimentAdvectBackwardPipeline);
            pass2.setBindGroup(0, this.createBindGroup(this.sedimentAdvectBackwardBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.sedimentAdvectATexture, 1),
                createStorageTextureBinding(texturePool.sedimentAdvectBTexture, 2),
                { binding: 3, resource: { buffer: backwardUniformBuffer } },
            ]));
            pass2.dispatchWorkgroups(workgroupX, workgroupY, 1);
            pass2.end();
            device.queue.submit([encoder2.finish()]);

            // 3. Correction: read sediment, A, B -> write sediment
            const encoder3 = device.createCommandEncoder();
            const pass3 = encoder3.beginComputePass();
            pass3.setPipeline(this.maccormackCorrectionPipeline);
            pass3.setBindGroup(0, this.createBindGroup(this.maccormackCorrectionBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.readSedimentTexture, 1),
                createSampledTextureBinding(texturePool.sedimentAdvectATexture, 2),
                createSampledTextureBinding(texturePool.sedimentAdvectBTexture, 3),
                createStorageTextureBinding(texturePool.writeSedimentTexture, 4),
                { binding: 5, resource: { buffer: correctionUniformBuffer } },
                createSampledTextureBinding(texturePool.readTerrainTexture, 6),
                createSampledTextureBinding(texturePool.readSedimentBlendTexture, 7),
                createStorageTextureBinding(texturePool.writeSedimentBlendTexture, 8),
            ]));
            pass3.dispatchWorkgroups(workgroupX, workgroupY, 1);
            pass3.end();
            device.queue.submit([encoder3.finish()]);
        } else {
            // Simple: one pass
            if (!this.sedimentAdvectSimplePipeline) {
                this.sedimentAdvectSimpleBindGroupLayout = this.createBindGroupLayout([
                    createSampledTextureLayoutEntry(0),
                    createSampledTextureLayoutEntry(1),
                    createSampledTextureLayoutEntry(2),
                    createSampledTextureLayoutEntry(3),
                    createStorageTextureLayoutEntry(4, 'write-only'),
                    createStorageTextureLayoutEntry(5, 'write-only'),
                    createStorageTextureLayoutEntry(6, 'write-only'),
                    createUniformBufferLayoutEntry(7),
                ]);
                this.sedimentAdvectSimplePipeline = this.createComputePipeline(
                    this.SEDIMENT_ADVECT_SIMPLE_SHADER,
                    'main',
                    this.sedimentAdvectSimpleBindGroupLayout
                );
            }

            const uniformData = new Float32Array([
                uniforms.simRes,
                uniforms.timestep,
                uniforms.advectMultiplier,
            ]);
            let uniformBuffer = this.uniformBuffers.get('sedimentAdvectSimple');
            if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
                if (uniformBuffer) uniformBuffer.destroy();
                uniformBuffer = createUniformBuffer(device, uniformData, 'sedimentAdvectSimple-uniforms');
                this.uniformBuffers.set('sedimentAdvectSimple', uniformBuffer);
            } else {
                device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
            }

            const bindGroup = this.createBindGroup(this.sedimentAdvectSimpleBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.readSedimentTexture, 1),
                createSampledTextureBinding(texturePool.readSedimentBlendTexture, 2),
                createSampledTextureBinding(texturePool.readTerrainTexture, 3),
                createStorageTextureBinding(texturePool.writeSedimentTexture, 4),
                createStorageTextureBinding(texturePool.writeVelTexture, 5),
                createStorageTextureBinding(texturePool.writeSedimentBlendTexture, 6),
                { binding: 7, resource: { buffer: uniformBuffer } },
            ]);

            const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
            const commandEncoder = device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.sedimentAdvectSimplePipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
            computePass.end();
            device.queue.submit([commandEncoder.finish()]);
        }
    }

    /**
     * Max slippage compute pass.
     * Ports maxslippageheight-frag.glsl to WGSL compute shader.
     */
    maxSlippagePass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            talusScale: number;
        }
    ): void {
        const device = this.device;

        if (!this.maxSlippagePipeline) {
            this.maxSlippageBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
            ]);
            this.maxSlippagePipeline = this.createComputePipeline(
                this.MAX_SLIPPAGE_COMPUTE_SHADER,
                'main',
                this.maxSlippageBindGroupLayout
            );
        }

        const uniformData = new Float32Array([uniforms.simRes, uniforms.talusScale]);
        let uniformBuffer = this.uniformBuffers.get('maxSlippage');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'maxSlippage-uniforms');
            this.uniformBuffers.set('maxSlippage', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.maxSlippageBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createStorageTextureBinding(texturePool.writeMaxSlippageTexture, 1),
            { binding: 2, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.maxSlippagePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Thermal flux compute pass.
     * Ports thermalterrainflux-frag.glsl to WGSL compute shader.
     */
    thermalFluxPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            thermalRate: number;
            rockErosionResistance: number;
        }
    ): void {
        const device = this.device;

        if (!this.thermalFluxPipeline) {
            this.thermalFluxBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createUniformBufferLayoutEntry(3),
            ]);
            this.thermalFluxPipeline = this.createComputePipeline(
                this.THERMAL_FLUX_COMPUTE_SHADER,
                'main',
                this.thermalFluxBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes,
            uniforms.pipeLen,
            uniforms.timestep,
            uniforms.pipeArea,
            uniforms.thermalRate,
            uniforms.rockErosionResistance,
        ]);
        let uniformBuffer = this.uniformBuffers.get('thermalFlux');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'thermalFlux-uniforms');
            this.uniformBuffers.set('thermalFlux', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.thermalFluxBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createSampledTextureBinding(texturePool.readMaxSlippageTexture, 1),
            createStorageTextureBinding(texturePool.writeTerrainFluxTexture, 2),
            { binding: 3, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.thermalFluxPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Thermal apply compute pass.
     * Ports thermalapply-frag.glsl to WGSL compute shader.
     */
    thermalApplyPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            thermalErosionScale: number;
            rockErosionResistance: number;
        }
    ): void {
        const device = this.device;

        if (!this.thermalApplyPipeline) {
            this.thermalApplyBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createUniformBufferLayoutEntry(3),
            ]);
            this.thermalApplyPipeline = this.createComputePipeline(
                this.THERMAL_APPLY_COMPUTE_SHADER,
                'main',
                this.thermalApplyBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes,
            uniforms.pipeLen,
            uniforms.timestep,
            uniforms.pipeArea,
            uniforms.thermalErosionScale,
            uniforms.rockErosionResistance,
        ]);
        let uniformBuffer = this.uniformBuffers.get('thermalApply');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'thermalApply-uniforms');
            this.uniformBuffers.set('thermalApply', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.thermalApplyBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainFluxTexture, 0),
            createSampledTextureBinding(texturePool.readTerrainTexture, 1),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 2),
            { binding: 3, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.thermalApplyPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Thermal erosion compute pass (flux + apply).
     * Ports thermalterrainflux-frag.glsl and thermalapply-frag.glsl to WGSL compute shader.
     */
    thermalPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            thermalRate: number;
            thermalErosionScale: number;
            rockErosionResistance: number;
        }
    ): void {
        this.thermalFluxPass(texturePool, {
            simRes: uniforms.simRes,
            pipeLen: uniforms.pipeLen,
            timestep: uniforms.timestep,
            pipeArea: uniforms.pipeArea,
            thermalRate: uniforms.thermalRate,
            rockErosionResistance: uniforms.rockErosionResistance,
        });
        texturePool.swapTerrainFluxTextures();
        this.thermalApplyPass(texturePool, {
            simRes: uniforms.simRes,
            pipeLen: uniforms.pipeLen,
            timestep: uniforms.timestep,
            pipeArea: uniforms.pipeArea,
            thermalErosionScale: uniforms.thermalErosionScale,
            rockErosionResistance: uniforms.rockErosionResistance,
        });
    }

    /**
     * Average smoothing compute pass (MRT: 2 outputs - terrain, terrain_nor/writeAvg).
     * Ports average-frag.glsl to WGSL compute shader.
     */
    averagePass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            erosionMode: number;
        }
    ): void {
        const device = this.device;

        if (!this.averagePipeline) {
            this.averageBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createUniformBufferLayoutEntry(3),
            ]);
            this.averagePipeline = this.createComputePipeline(
                this.AVERAGE_COMPUTE_SHADER,
                'main',
                this.averageBindGroupLayout
            );
        }

        const uniformData = new Float32Array([uniforms.simRes, uniforms.erosionMode]);
        let uniformBuffer = this.uniformBuffers.get('average');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'average-uniforms');
            this.uniformBuffers.set('average', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.averageBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 1),
            createStorageTextureBinding(texturePool.terrainNorTexture, 2),
            { binding: 3, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.averagePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    // ===== LAVA COMPUTE PASSES =====

    /**
     * Lava source injection pass.
     * Handles lava brush (type 7) and persistent lava sources.
     */
    lavaSourcePass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            brushSize: number;
            brushStrength: number;
            brushType: number;
            brushPos: [number, number];
            brushPressed: number;
            brushOperation: number;
            emissionTemp: number;
            sourceCount: number;
            sourcePositions: Float32Array;
            sourceSizes: Float32Array;
            sourceStrengths: Float32Array;
            time: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaSourcePipeline) {
            const SHADER = `
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
`;
            this.lavaSourceBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
                createUniformBufferLayoutEntry(3),
            ]);
            this.lavaSourcePipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaSourceBindGroupLayout
            );
        }

        // Pack uniforms with DataView for mixed f32/i32 fields
        const UNIFORM_SIZE = 48;
        const buf = new ArrayBuffer(UNIFORM_SIZE);
        const v = new DataView(buf);
        const LE = true;
        v.setFloat32(0, uniforms.simRes, LE);
        v.setFloat32(4, uniforms.brushSize, LE);
        v.setFloat32(8, uniforms.brushStrength, LE);
        v.setInt32(12, uniforms.brushType, LE);
        v.setFloat32(16, uniforms.brushPos[0], LE);
        v.setFloat32(20, uniforms.brushPos[1], LE);
        v.setInt32(24, uniforms.brushPressed, LE);
        v.setInt32(28, uniforms.brushOperation, LE);
        v.setFloat32(32, uniforms.emissionTemp, LE);
        v.setInt32(36, uniforms.sourceCount, LE);
        v.setFloat32(40, uniforms.time, LE);
        v.setFloat32(44, 0.0, LE); // padding

        let uniformBuffer = this.uniformBuffers.get('lavaSource');
        if (!uniformBuffer || uniformBuffer.size < UNIFORM_SIZE) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, new Float32Array(buf), 'lavaSource-uniforms');
            this.uniformBuffers.set('lavaSource', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, buf);
        }

        // Source data buffer (same layout as water sources)
        const sourceData = new Float32Array(16 * 2 + 16 + 16);
        sourceData.set(uniforms.sourcePositions, 0);
        sourceData.set(uniforms.sourceSizes, 16 * 2);
        sourceData.set(uniforms.sourceStrengths, 16 * 2 + 16);

        let sourceBuffer = this.uniformBuffers.get('lavaSource-sources');
        if (!sourceBuffer || sourceBuffer.size < sourceData.byteLength) {
            if (sourceBuffer) sourceBuffer.destroy();
            sourceBuffer = createUniformBuffer(device, sourceData, 'lavaSource-sources');
            this.uniformBuffers.set('lavaSource-sources', sourceBuffer);
        } else {
            device.queue.writeBuffer(sourceBuffer, 0, sourceData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaSourceBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createStorageTextureBinding(texturePool.writeLavaTexture, 1),
            { binding: 2, resource: { buffer: uniformBuffer } },
            { binding: 3, resource: { buffer: sourceBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaSourcePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava flux compute pass.
     * Calculates lava outflow flux with viscosity damping, yield stress, and crust breakout.
     */
    lavaFluxPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            viscosityScale: number;
            yieldStress: number;
            crustStrength: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaFluxPipeline) {
            const SHADER = `
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
    let temperature = curLava.g;
    let viscosity_val = curLava.b;
    let crustThickness = curLava.a;

    // No lava → zero flux
    if (lavaHeight < 0.0001) {
        textureStore(writeLavaFlux, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        return;
    }

    // Crust breakout check
    let lavaPressure = lavaHeight * max(temperature, 0.1);
    let crustResistance = crustThickness * uniforms.u_CrustStrength;
    if (lavaPressure < crustResistance && crustThickness > 0.01) {
        textureStore(writeLavaFlux, coord, curFlux * 0.5);
        return;
    }

    // Surface height = terrain + water + lava
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

    // Viscosity damping
    let viscDamp = 1.0 / (1.0 + viscosity_val * uniforms.u_ViscosityScale);

    var ftop = max(0.0, curFlux.r + (uniforms.u_timestep * g * uniforms.u_PipeArea * Htop) / uniforms.u_PipeLen) * viscDamp;
    var fright = max(0.0, curFlux.g + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hright) / uniforms.u_PipeLen) * viscDamp;
    var fbottom = max(0.0, curFlux.b + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hbottom) / uniforms.u_PipeLen) * viscDamp;
    var fleft = max(0.0, curFlux.a + (uniforms.u_timestep * g * uniforms.u_PipeArea * Hleft) / uniforms.u_PipeLen) * viscDamp;

    // Yield stress: thin lava on flat ground doesn't flow
    let maxSlope = max(max(abs(Htop), abs(Hright)), max(abs(Hbottom), abs(Hleft)));
    if (lavaHeight < uniforms.u_YieldStress && maxSlope < 0.01) {
        ftop = 0.0;
        fright = 0.0;
        fbottom = 0.0;
        fleft = 0.0;
    }

    // Conservation factor
    let lavaOut = uniforms.u_timestep * (ftop + fright + fbottom + fleft);
    let k = min(1.0, (lavaHeight * uniforms.u_PipeLen * uniforms.u_PipeLen) / max(lavaOut, 0.0001));
    ftop *= k;
    fright *= k;
    fbottom *= k;
    fleft *= k;

    // Boundary conditions
    if (uv.x <= div || uv.x >= 1.0 - 2.0 * div || uv.y <= div || uv.y >= 1.0 - 2.0 * div) {
        ftop = 0.0;
        fright = 0.0;
        fbottom = 0.0;
        fleft = 0.0;
    }

    textureStore(writeLavaFlux, coord, vec4<f32>(ftop, fright, fbottom, fleft));
}
`;
            this.lavaFluxBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
            ]);
            this.lavaFluxPipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaFluxBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.pipeLen, uniforms.timestep, uniforms.pipeArea,
            uniforms.viscosityScale, uniforms.yieldStress, uniforms.crustStrength, 0.0,
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaFlux');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaFlux-uniforms');
            this.uniformBuffers.set('lavaFlux', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaFluxBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readTerrainTexture, 0),
            createSampledTextureBinding(texturePool.readLavaTexture, 1),
            createSampledTextureBinding(texturePool.readLavaFluxTexture, 2),
            createStorageTextureBinding(texturePool.writeLavaFluxTexture, 3),
            { binding: 4, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaFluxPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava height/velocity update pass.
     * Computes flux divergence, updates lava height and velocity, advects temperature.
     */
    lavaHeightVelPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            pipeLen: number;
            timestep: number;
            pipeArea: number;
            heatScale: number;
            velAdvMag: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaHeightVelPipeline) {
            const SHADER = `
@group(0) @binding(0) var readLavaFlux: texture_2d<f32>;
@group(0) @binding(1) var readLava: texture_2d<f32>;
@group(0) @binding(2) var readLavaVel: texture_2d<f32>;
@group(0) @binding(3) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var writeLavaVel: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_timestep: f32,
    u_PipeArea: f32,
    u_HeatScale: f32,
    u_VelAdvMag: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_size = textureDimensions(readLava);
    let dim = vec2<f32>(f32(texture_size.x), f32(texture_size.y));
    let curuv = (vec2<f32>(global_id.xy) + 0.5) / dim;
    let coord = vec2<i32>(global_id.xy);

    let curFlux = textureLoad(readLavaFlux, coord, 0);
    let cur = textureLoad(readLava, coord, 0);
    let curVel = textureLoad(readLavaVel, coord, 0);

    let topFlux = textureLoad(readLavaFlux, coord + vec2<i32>(0, 1), 0);
    let rightFlux = textureLoad(readLavaFlux, coord + vec2<i32>(1, 0), 0);
    let bottomFlux = textureLoad(readLavaFlux, coord + vec2<i32>(0, -1), 0);
    let leftFlux = textureLoad(readLavaFlux, coord + vec2<i32>(-1, 0), 0);

    let fin = topFlux.b + rightFlux.a + bottomFlux.r + leftFlux.g;
    let fout = curFlux.r + curFlux.g + curFlux.b + curFlux.a;
    let deltaVol = uniforms.u_timestep * (fin - fout) / (uniforms.u_PipeLen * uniforms.u_PipeLen);

    let d1 = cur.r;
    let d2 = max(d1 + deltaVol, 0.0);
    let da = (d1 + d2) / 2.0;

    var vel = vec2<f32>(
        leftFlux.g - curFlux.a + curFlux.g - rightFlux.a,
        bottomFlux.r - curFlux.b + curFlux.r - topFlux.b
    ) / 2.0;

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
    let heat = clamp(speed * uniforms.u_HeatScale, 0.0, 1.0);

    // Temperature advection: incoming lava carries its temperature
    var newTemp = cur.g;
    if (fin > 0.001 && d2 > 0.001) {
        let topLava = textureLoad(readLava, coord + vec2<i32>(0, 1), 0);
        let rightLava = textureLoad(readLava, coord + vec2<i32>(1, 0), 0);
        let bottomLava = textureLoad(readLava, coord + vec2<i32>(0, -1), 0);
        let leftLava = textureLoad(readLava, coord + vec2<i32>(-1, 0), 0);

        let tempIn = (topFlux.b * topLava.g + rightFlux.a * rightLava.g +
                      bottomFlux.r * bottomLava.g + leftFlux.g * leftLava.g) / max(fin, 0.001);
        let inFrac = clamp(uniforms.u_timestep * fin / (d2 * uniforms.u_PipeLen * uniforms.u_PipeLen), 0.0, 0.5);
        newTemp = mix(cur.g, tempIn, inFrac);
    }

    textureStore(writeLava, coord, vec4<f32>(d2, newTemp, cur.b, cur.a));
    textureStore(writeLavaVel, coord, vec4<f32>(vel.x, vel.y, speed, heat));
}
`;
            this.lavaHeightVelBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createStorageTextureLayoutEntry(4, 'write-only'),
                createUniformBufferLayoutEntry(5),
            ]);
            this.lavaHeightVelPipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaHeightVelBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.pipeLen, uniforms.timestep, uniforms.pipeArea,
            uniforms.heatScale, uniforms.velAdvMag, 0.0, 0.0,
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaHeightVel');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaHeightVel-uniforms');
            this.uniformBuffers.set('lavaHeightVel', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaHeightVelBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaFluxTexture, 0),
            createSampledTextureBinding(texturePool.readLavaTexture, 1),
            createSampledTextureBinding(texturePool.readLavaVelTexture, 2),
            createStorageTextureBinding(texturePool.writeLavaTexture, 3),
            createStorageTextureBinding(texturePool.writeLavaVelTexture, 4),
            { binding: 5, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaHeightVelPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava thermal erosion pass.
     * Hot flowing lava erodes terrain beneath it. Rock resists unless above melt threshold.
     */
    lavaThermalErosionPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            thermalErosionRate: number;
            maxErosionPerStep: number;
            erosionSpeedClamp: number;
            rockMeltThreshold: number;
            timestep: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaThermalErosionPipeline) {
            const SHADER = `
@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readLavaVel: texture_2d<f32>;
@group(0) @binding(2) var readTerrain: texture_2d<f32>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;

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

@group(0) @binding(4) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let lava = textureLoad(readLava, coord, 0);
    let lavaVel = textureLoad(readLavaVel, coord, 0);
    let terrain = textureLoad(readTerrain, coord, 0);

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
        // No Ks — this is lava thermal erosion, not water sediment transport
        var erosionRate = uniforms.u_ThermalErosionRate
                        * temperature
                        * clampedSpeed
                        * uniforms.u_Timestep;

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

    textureStore(writeTerrain, coord, vec4<f32>(height, water, rock, baseRock));
}
`;
            this.lavaThermalErosionBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
            ]);
            this.lavaThermalErosionPipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaThermalErosionBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.thermalErosionRate,
            uniforms.maxErosionPerStep, uniforms.erosionSpeedClamp,
            uniforms.rockMeltThreshold, uniforms.timestep,
            0, 0, // padding to 32 bytes (8 floats)
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaThermalErosion');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaThermalErosion-uniforms');
            this.uniformBuffers.set('lavaThermalErosion', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaThermalErosionBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createSampledTextureBinding(texturePool.readLavaVelTexture, 1),
            createSampledTextureBinding(texturePool.readTerrainTexture, 2),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 3),
            { binding: 4, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaThermalErosionPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava cooling and solidification pass.
     * Temperature decays, viscosity increases, crust grows, lava solidifies into terrain+rock.
     */
    lavaCoolingPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            coolingRate: number;
            proportionalCooling: number;
            solidificationThreshold: number;
            rockFraction: number;
            crustGrowthRate: number;
            ambientCoolingRate: number;
            viscTempScale: number;
            timestep: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaCoolingPipeline) {
            const SHADER = `
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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
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

    if (lavaHeight < 0.0001) {
        textureStore(writeLava, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        textureStore(writeTerrain, coord, terrain);
        return;
    }

    // --- Temperature decay ---
    // Ambient cooling: constant heat loss to environment
    temperature -= uniforms.u_AmbientCoolingRate * uniforms.u_timestep;

    // Surface area cooling: thin lava cools faster, crust insulates
    let surfaceAreaFactor = 1.0 + uniforms.u_ProportionalCooling / max(lavaHeight, 0.001);
    let crustInsulation = 1.0 / (1.0 + crustThickness * 5.0);
    temperature -= uniforms.u_CoolingRate * surfaceAreaFactor * crustInsulation * uniforms.u_timestep;
    temperature = max(temperature, 0.0);

    // --- Exponential viscosity model ---
    // visc = exp(alpha * (T_ref - T)), where T_ref = 1.0 (emission temp)
    // Hot (T=1): visc=1 (free flow). Cold (T=0): visc=exp(alpha) (stalled).
    let alpha = uniforms.u_ViscTempScale;
    viscosity = exp(alpha * (1.0 - temperature));
    viscosity = min(viscosity, 1000.0); // cap to prevent numerical issues

    // --- Crust growth ---
    if (temperature < 0.8) {
        crustThickness += uniforms.u_CrustGrowthRate * (1.0 - temperature) * uniforms.u_timestep;
        crustThickness = min(crustThickness, lavaHeight * 0.5);
    }

    // --- Solidification ---
    if (temperature < uniforms.u_SolidificationThreshold) {
        let solidRate = (uniforms.u_SolidificationThreshold - temperature) / uniforms.u_SolidificationThreshold;
        let solidAmount = min(lavaHeight * solidRate * uniforms.u_timestep * 2.0, lavaHeight);

        terrainHeight += solidAmount;
        rock = min(1.0, rock + solidAmount * uniforms.u_RockFraction);
        if (rock > 0.1 && baseRock < 0.001) {
            baseRock = terrainHeight;
        }
        lavaHeight -= solidAmount;

        if (lavaHeight < 0.001) {
            crustThickness = 0.0;
            temperature = 0.0;
            viscosity = 0.0;
            lavaHeight = 0.0;
        }
    }

    textureStore(writeLava, coord, vec4<f32>(lavaHeight, temperature, viscosity, crustThickness));
    textureStore(writeTerrain, coord, vec4<f32>(terrainHeight, water, rock, baseRock));
}
`;
            this.lavaCoolingBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
            ]);
            this.lavaCoolingPipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaCoolingBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.coolingRate, uniforms.proportionalCooling,
            uniforms.solidificationThreshold, uniforms.rockFraction, uniforms.crustGrowthRate,
            uniforms.ambientCoolingRate, uniforms.viscTempScale,
            uniforms.timestep, 0, 0, 0, // padding to 48 bytes (12 floats)
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaCooling');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaCooling-uniforms');
            this.uniformBuffers.set('lavaCooling', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaCoolingBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createSampledTextureBinding(texturePool.readTerrainTexture, 1),
            createStorageTextureBinding(texturePool.writeLavaTexture, 2),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 3),
            { binding: 4, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaCoolingPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava-water interaction pass.
     * Contact solidification, water evaporation, and heat radius effects.
     */
    lavaWaterInteractionPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            heatRadius: number;
            coolingRate: number;
            solidificationThreshold: number;
            rockFraction: number;
            waterEvapRate: number;
        }
    ): void {
        const device = this.device;

        if (!this.lavaWaterInteractionPipeline) {
            const SHADER = `
@group(0) @binding(0) var readLava: texture_2d<f32>;
@group(0) @binding(1) var readTerrain: texture_2d<f32>;
@group(0) @binding(2) var writeLava: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_HeatRadius: i32,
    u_CoolingRate: f32,
    u_SolidificationThreshold: f32,
    u_RockFraction: f32,
    u_WaterEvapRate: f32,
    _pad0: f32,
    _pad1: f32,
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

    // Direct contact: lava and water in same cell
    if (lavaHeight > 0.001 && water > 0.001) {
        let contactAmount = min(water, lavaHeight * 0.1) * 0.5;
        water = max(0.0, water - contactAmount);
        temperature = max(0.0, temperature - contactAmount * 10.0);

        if (temperature < uniforms.u_SolidificationThreshold * 2.0) {
            let solidAmount = min(lavaHeight * 0.1, lavaHeight);
            terrainHeight += solidAmount;
            rock = min(1.0, rock + solidAmount * uniforms.u_RockFraction);
            if (rock > 0.1 && baseRock < 0.001) {
                baseRock = terrainHeight;
            }
            lavaHeight = max(0.0, lavaHeight - solidAmount);
            crustThickness = max(crustThickness, solidAmount);
        }
    }

    // Heat radius: nearby lava heats this cell's water
    if (water > 0.001) {
        var nearbyHeat: f32 = 0.0;
        let radius = uniforms.u_HeatRadius;
        for (var dy: i32 = -radius; dy <= radius; dy++) {
            for (var dx: i32 = -radius; dx <= radius; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                let nc = coord + vec2<i32>(dx, dy);
                if (nc.x >= 0 && nc.x < i32(texture_size.x) && nc.y >= 0 && nc.y < i32(texture_size.y)) {
                    let neighborLava = textureLoad(readLava, nc, 0);
                    if (neighborLava.r > 0.01) {
                        let dist = length(vec2<f32>(f32(dx), f32(dy)));
                        nearbyHeat += neighborLava.g * neighborLava.r / (1.0 + dist);
                    }
                }
            }
        }
        if (nearbyHeat > 0.01) {
            water = max(0.0, water - nearbyHeat * uniforms.u_WaterEvapRate * 0.5);
        }
    }

    if (lavaHeight < 0.0001) {
        lavaHeight = 0.0;
        temperature = 0.0;
        viscosity = 0.0;
        crustThickness = 0.0;
    }

    textureStore(writeLava, coord, vec4<f32>(lavaHeight, temperature, viscosity, crustThickness));
    textureStore(writeTerrain, coord, vec4<f32>(terrainHeight, water, rock, baseRock));
}
`;
            this.lavaWaterInteractionBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
            ]);
            this.lavaWaterInteractionPipeline = this.createComputePipeline(
                SHADER, 'main', this.lavaWaterInteractionBindGroupLayout
            );
        }

        // Pack with DataView for mixed f32/i32
        const UNIFORM_SIZE = 32;
        const buf = new ArrayBuffer(UNIFORM_SIZE);
        const v = new DataView(buf);
        const LE = true;
        v.setFloat32(0, uniforms.simRes, LE);
        v.setInt32(4, uniforms.heatRadius, LE);
        v.setFloat32(8, uniforms.coolingRate, LE);
        v.setFloat32(12, uniforms.solidificationThreshold, LE);
        v.setFloat32(16, uniforms.rockFraction, LE);
        v.setFloat32(20, uniforms.waterEvapRate, LE);
        v.setFloat32(24, 0.0, LE);
        v.setFloat32(28, 0.0, LE);

        let uniformBuffer = this.uniformBuffers.get('lavaWaterInteraction');
        if (!uniformBuffer || uniformBuffer.size < UNIFORM_SIZE) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, new Float32Array(buf), 'lavaWaterInteraction-uniforms');
            this.uniformBuffers.set('lavaWaterInteraction', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, buf);
        }

        const bindGroup = this.createBindGroup(this.lavaWaterInteractionBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createSampledTextureBinding(texturePool.readTerrainTexture, 1),
            createStorageTextureBinding(texturePool.writeLavaTexture, 2),
            createStorageTextureBinding(texturePool.writeTerrainTexture, 3),
            { binding: 4, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaWaterInteractionPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Dispose of all resources.
     */
    override dispose(): void {
        super.dispose();
        // Destroy all uniform buffers
        for (const buffer of this.uniformBuffers.values()) {
            buffer.destroy();
        }
        this.uniformBuffers.clear();
        this.rainPipeline = null;
        this.rainBindGroupLayout = null;
        this.flowPipeline = null;
        this.flowBindGroupLayout = null;
        this.waterHeightPipeline = null;
        this.waterHeightBindGroupLayout = null;
        this.sedimentPipeline = null;
        this.sedimentBindGroupLayout = null;
        this.sedimentAdvectSimplePipeline = null;
        this.sedimentAdvectSimpleBindGroupLayout = null;
        this.sedimentAdvectForwardPipeline = null;
        this.sedimentAdvectForwardBindGroupLayout = null;
        this.sedimentAdvectBackwardPipeline = null;
        this.sedimentAdvectBackwardBindGroupLayout = null;
        this.maccormackCorrectionPipeline = null;
        this.maccormackCorrectionBindGroupLayout = null;
        this.maxSlippagePipeline = null;
        this.maxSlippageBindGroupLayout = null;
        this.thermalFluxPipeline = null;
        this.thermalFluxBindGroupLayout = null;
        this.thermalApplyPipeline = null;
        this.thermalApplyBindGroupLayout = null;
        this.averagePipeline = null;
        this.averageBindGroupLayout = null;
        this.evaporationPipeline = null;
        this.evaporationBindGroupLayout = null;
        this.lavaSourcePipeline = null;
        this.lavaSourceBindGroupLayout = null;
        this.lavaFluxPipeline = null;
        this.lavaFluxBindGroupLayout = null;
        this.lavaHeightVelPipeline = null;
        this.lavaHeightVelBindGroupLayout = null;
        this.lavaThermalErosionPipeline = null;
        this.lavaThermalErosionBindGroupLayout = null;
        this.lavaCoolingPipeline = null;
        this.lavaCoolingBindGroupLayout = null;
        this.lavaWaterInteractionPipeline = null;
        this.lavaWaterInteractionBindGroupLayout = null;
    }
}
