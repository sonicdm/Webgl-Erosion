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

        // Create or update uniform buffers
        const uniformData = new Float32Array([
            uniforms.time,
            uniforms.rainDegree,
            uniforms.simRes,
            ...uniforms.mouseWorldPos,
            ...uniforms.mouseWorldDir,
            0.0, // padding for vec3 alignment
            uniforms.brushSize,
            uniforms.brushStrength,
            uniforms.brushType,
            uniforms.brushPressed,
            ...uniforms.brushPos,
            uniforms.brushOperation,
            uniforms.rainErosion,
            uniforms.rainErosionStrength,
            uniforms.rainErosionDropSize,
            uniforms.flattenTargetHeight,
            ...uniforms.slopeStartPos,
            ...uniforms.slopeEndPos,
            uniforms.slopeActive,
            uniforms.sourceCount,
            0.0, // padding
        ]);

        let uniformBuffer = this.uniformBuffers.get('rain');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'rain-uniforms');
            this.uniformBuffers.set('rain', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
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

    private flowPipeline: GPUComputePipeline | null = null;
    private flowBindGroupLayout: GPUBindGroupLayout | null = null;
    private evaporationPipeline: GPUComputePipeline | null = null;
    private evaporationBindGroupLayout: GPUBindGroupLayout | null = null;

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
     * Note: MRT requires separate compute dispatches or multiple storage bindings.
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
        // TODO: Implement MRT water height pass
        // This pass outputs both terrain and velocity textures
        // Implementation deferred - requires MRT handling in compute shaders
        console.warn('[ComputeNodePipeline] waterHeightPass not yet implemented');
    }

    /**
     * Sediment compute pass (MRT: 4 outputs - terrain, sediment, terrain_nor, velocity).
     * Ports sediment-frag.glsl to WGSL compute shader.
     */
    sedimentPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            timestep: number;
            Kc: number;
            Ks: number;
            Kd: number;
            // ... other sediment uniforms
        }
    ): void {
        // TODO: Implement MRT sediment pass (4 outputs)
        // Implementation deferred - requires MRT handling
        console.warn('[ComputeNodePipeline] sedimentPass not yet implemented');
    }

    /**
     * Sediment advection compute pass (MRT: 3 outputs).
     * Ports sediadvect-frag.glsl and maccormack-frag.glsl to WGSL compute shader.
     */
    sedimentAdvectionPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            advectionMethod: number; // 1 = MacCormack, else = Simple
            advectMultiplier: number;
        }
    ): void {
        // TODO: Implement sediment advection pass
        // MacCormack requires 3 subpasses, Simple requires 1 pass
        console.warn('[ComputeNodePipeline] sedimentAdvectionPass not yet implemented');
    }

    /**
     * Max slippage compute pass.
     * Ports maxslippageheight-frag.glsl to WGSL compute shader.
     */
    maxSlippagePass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
        }
    ): void {
        // TODO: Implement max slippage pass
        console.warn('[ComputeNodePipeline] maxSlippagePass not yet implemented');
    }

    /**
     * Thermal flux compute pass.
     * Ports thermalterrainflux-frag.glsl to WGSL compute shader.
     */
    thermalFluxPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            thermalRate: number;
            thermalErosionScale: number;
        }
    ): void {
        // TODO: Implement thermal flux pass
        console.warn('[ComputeNodePipeline] thermalFluxPass not yet implemented');
    }

    /**
     * Thermal apply compute pass.
     * Ports thermalapply-frag.glsl to WGSL compute shader.
     */
    thermalApplyPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
        }
    ): void {
        // TODO: Implement thermal apply pass
        console.warn('[ComputeNodePipeline] thermalApplyPass not yet implemented');
    }

    /**
     * Thermal erosion compute pass (flux + apply).
     * Ports thermalterrainflux-frag.glsl and thermalapply-frag.glsl to WGSL compute shader.
     */
    thermalPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            thermalRate: number;
            thermalErosionScale: number;
        }
    ): void {
        this.thermalFluxPass(texturePool, uniforms);
        texturePool.swapTerrainFluxTextures();
        this.thermalApplyPass(texturePool, { simRes: uniforms.simRes });
    }

    /**
     * Average smoothing compute pass (MRT: 2 outputs - terrain, terrain_nor).
     * Ports average-frag.glsl to WGSL compute shader.
     */
    averagePass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
        }
    ): void {
        // TODO: Implement average pass (MRT: 2 outputs)
        console.warn('[ComputeNodePipeline] averagePass not yet implemented');
    }

    /**
     * Lava flow compute pass.
     * Ports lava flow shaders to WGSL compute shader.
     */
    lavaPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            // ... lava physics constants
        }
    ): void {
        // TODO: Implement lava passes (flow, update, terrain interaction)
        console.warn('[ComputeNodePipeline] lavaPass not yet implemented');
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
        this.evaporationPipeline = null;
        this.evaporationBindGroupLayout = null;
    }
}
