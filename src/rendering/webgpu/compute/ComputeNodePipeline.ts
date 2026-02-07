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

// Lava compute shaders (external WGSL files)
import lavaSourceShader from './shaders/lava-source.wgsl?raw';
import lavaFluxShader from './shaders/lava-flux.wgsl?raw';
import lavaHeightVelShader from './shaders/lava-height-vel.wgsl?raw';
import lavaThermalTransferShader from './shaders/lava-thermal-transfer.wgsl?raw';
import lavaThermalErosionShader from './shaders/lava-thermal-erosion.wgsl?raw';
import lavaCoolingShader from './shaders/lava-cooling.wgsl?raw';
import lavaWaterInteractionShader from './shaders/lava-water-interaction.wgsl?raw';
import lavaSolidificationShader from './shaders/lava-solidification.wgsl?raw';

// Water erosion compute shaders (external WGSL files)
import rainShader from './shaders/rain.wgsl?raw';
import evaporationShader from './shaders/evaporation.wgsl?raw';
import waterFlowShader from './shaders/water-flow.wgsl?raw';
import waterHeightShader from './shaders/water-height.wgsl?raw';
import sedimentShader from './shaders/sediment.wgsl?raw';
import sedimentAdvectSimpleShader from './shaders/sediment-advect-simple.wgsl?raw';
import sedimentAdvectForwardShader from './shaders/sediment-advect-forward.wgsl?raw';
import sedimentAdvectBackwardShader from './shaders/sediment-advect-backward.wgsl?raw';
import maccormackCorrectionShader from './shaders/maccormack-correction.wgsl?raw';
import maxSlippageShader from './shaders/max-slippage.wgsl?raw';
import thermalFluxShader from './shaders/thermal-flux.wgsl?raw';
import thermalApplyShader from './shaders/thermal-apply.wgsl?raw';
import averageShader from './shaders/average.wgsl?raw';

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
        },
        encoder?: GPUCommandEncoder
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
                rainShader, 'main', this.rainBindGroupLayout
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.rainPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
    }


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
    private lavaThermalTransferPipeline: GPUComputePipeline | null = null;
    private lavaThermalTransferBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaWaterInteractionPipeline: GPUComputePipeline | null = null;
    private lavaWaterInteractionBindGroupLayout: GPUBindGroupLayout | null = null;
    private lavaSolidificationPipeline: GPUComputePipeline | null = null;
    private lavaSolidificationBindGroupLayout: GPUBindGroupLayout | null = null;

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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.flowPipeline) {
            this.flowBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createSampledTextureLayoutEntry(2),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
                createSampledTextureLayoutEntry(5),   // readCoolLava
                createSampledTextureLayoutEntry(6),   // readBasalt
            ]);
            this.flowPipeline = this.createComputePipeline(
                waterFlowShader, 'main', this.flowBindGroupLayout
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
            createSampledTextureBinding(texturePool.readCoolLavaTexture, 5),
            createSampledTextureBinding(texturePool.readBasaltTexture, 6),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.flowPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.evaporationPipeline) {
            this.evaporationBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
            ]);
            this.evaporationPipeline = this.createComputePipeline(
                evaporationShader, 'main', this.evaporationBindGroupLayout
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.evaporationPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
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
                waterHeightShader,
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.waterHeightPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
            basaltErosionResistance: number;
        },
        encoder?: GPUCommandEncoder
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
                createSampledTextureLayoutEntry(8),
            ]);
            this.sedimentPipeline = this.createComputePipeline(
                sedimentShader,
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
            uniforms.basaltErosionResistance,
            0.0, // pad0
            0.0, // pad1
            0.0, // pad2
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
            createSampledTextureBinding(texturePool.readBasaltTexture, 8),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.sedimentPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
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
                    sedimentAdvectForwardShader,
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
                    sedimentAdvectBackwardShader,
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
                    maccormackCorrectionShader,
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

            const commandEncoder = encoder ?? device.createCommandEncoder();
            // 1. Forward advect: read sediment, vel -> write sedimentAdvectA
            const pass1 = commandEncoder.beginComputePass();
            pass1.setPipeline(this.sedimentAdvectForwardPipeline);
            pass1.setBindGroup(0, this.createBindGroup(this.sedimentAdvectForwardBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.readSedimentTexture, 1),
                createStorageTextureBinding(texturePool.sedimentAdvectATexture, 2),
                { binding: 3, resource: { buffer: forwardUniformBuffer } },
            ]));
            pass1.dispatchWorkgroups(workgroupX, workgroupY, 1);
            pass1.end();

            // 2. Backward advect: read vel, sedimentAdvectA -> write sedimentAdvectB
            const pass2 = commandEncoder.beginComputePass();
            pass2.setPipeline(this.sedimentAdvectBackwardPipeline);
            pass2.setBindGroup(0, this.createBindGroup(this.sedimentAdvectBackwardBindGroupLayout!, [
                createSampledTextureBinding(texturePool.readVelTexture, 0),
                createSampledTextureBinding(texturePool.sedimentAdvectATexture, 1),
                createStorageTextureBinding(texturePool.sedimentAdvectBTexture, 2),
                { binding: 3, resource: { buffer: backwardUniformBuffer } },
            ]));
            pass2.dispatchWorkgroups(workgroupX, workgroupY, 1);
            pass2.end();

            // 3. Correction: read sediment, A, B -> write sediment
            const pass3 = commandEncoder.beginComputePass();
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
            if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
                    sedimentAdvectSimpleShader,
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
            const commandEncoder = encoder ?? device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.sedimentAdvectSimplePipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
            computePass.end();
            if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.maxSlippagePipeline) {
            this.maxSlippageBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
            ]);
            this.maxSlippagePipeline = this.createComputePipeline(
                maxSlippageShader,
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.maxSlippagePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
            basaltErosionResistance: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.thermalFluxPipeline) {
            this.thermalFluxBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createUniformBufferLayoutEntry(3),
                createSampledTextureLayoutEntry(4),
            ]);
            this.thermalFluxPipeline = this.createComputePipeline(
                thermalFluxShader,
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
            uniforms.basaltErosionResistance,
            0.0, // pad0
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
            createSampledTextureBinding(texturePool.readBasaltTexture, 4),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.thermalFluxPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        basaltErosionResistance: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.thermalApplyPipeline) {
            this.thermalApplyBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createUniformBufferLayoutEntry(3),
                createSampledTextureLayoutEntry(4),
            ]);
            this.thermalApplyPipeline = this.createComputePipeline(
                thermalApplyShader,
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
            uniforms.basaltErosionResistance,
            0.0, // pad0
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
            createSampledTextureBinding(texturePool.readBasaltTexture, 4),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.thermalApplyPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
            basaltErosionResistance: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        this.thermalFluxPass(texturePool, {
            simRes: uniforms.simRes,
            pipeLen: uniforms.pipeLen,
            timestep: uniforms.timestep,
            pipeArea: uniforms.pipeArea,
            thermalRate: uniforms.thermalRate,
            rockErosionResistance: uniforms.rockErosionResistance,
            basaltErosionResistance: uniforms.basaltErosionResistance,
        }, encoder);
        texturePool.swapTerrainFluxTextures();
        this.thermalApplyPass(texturePool, {
            simRes: uniforms.simRes,
            pipeLen: uniforms.pipeLen,
            timestep: uniforms.timestep,
            pipeArea: uniforms.pipeArea,
            thermalErosionScale: uniforms.thermalErosionScale,
            rockErosionResistance: uniforms.rockErosionResistance,
            basaltErosionResistance: uniforms.basaltErosionResistance,
        }, encoder);
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
        },
        encoder?: GPUCommandEncoder
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
                averageShader,
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.averagePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaSourcePipeline) {
            
            this.lavaSourceBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createStorageTextureLayoutEntry(1, 'write-only'),
                createUniformBufferLayoutEntry(2),
                createUniformBufferLayoutEntry(3),
            ]);
            this.lavaSourcePipeline = this.createComputePipeline(
                lavaSourceShader, 'main', this.lavaSourceBindGroupLayout
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
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaSourcePipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
            depthBoostStrength: number;
            momentumStrength: number;
            noiseResistPower: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaFluxPipeline) {

            this.lavaFluxBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),   // readTerrain
                createSampledTextureLayoutEntry(1),   // readLava
                createSampledTextureLayoutEntry(2),   // readLavaFlux
                createStorageTextureLayoutEntry(3, 'write-only'),  // writeLavaFlux
                createSampledTextureLayoutEntry(4),   // readLavaVel
                createSampledTextureLayoutEntry(5),   // readNoise
                createSampledTextureLayoutEntry(6),   // readCoolLava
                createSampledTextureLayoutEntry(7),   // readBasalt
                createStorageTextureLayoutEntry(8, 'write-only'),  // writeLavaFlux2
                createSampledTextureLayoutEntry(9),   // readLavaFlux2
                createUniformBufferLayoutEntry(10),   // uniforms
            ]);
            this.lavaFluxPipeline = this.createComputePipeline(
                lavaFluxShader, 'main', this.lavaFluxBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.pipeLen, uniforms.timestep, uniforms.pipeArea,
            uniforms.viscosityScale, uniforms.yieldStress, uniforms.crustStrength,
            uniforms.depthBoostStrength, uniforms.momentumStrength, uniforms.noiseResistPower,
            0.0, 0.0, // padding to 48 bytes (12 floats)
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
            createSampledTextureBinding(texturePool.readLavaVelTexture, 4),
            createSampledTextureBinding(texturePool.noiseTexture, 5),
            createSampledTextureBinding(texturePool.readCoolLavaTexture, 6),
            createSampledTextureBinding(texturePool.readBasaltTexture, 7),
            createStorageTextureBinding(texturePool.writeLavaFlux2Texture, 8),
            createSampledTextureBinding(texturePool.readLavaFlux2Texture, 9),
            { binding: 10, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaFluxPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
            momentum: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaHeightVelPipeline) {

            this.lavaHeightVelBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),   // readLavaFlux
                createSampledTextureLayoutEntry(1),   // readLava
                createSampledTextureLayoutEntry(2),   // readLavaVel
                createStorageTextureLayoutEntry(3, 'write-only'),  // writeLava
                createStorageTextureLayoutEntry(4, 'write-only'),  // writeLavaVel
                createSampledTextureLayoutEntry(5),   // readLavaFlux2
                createUniformBufferLayoutEntry(6),    // uniforms
            ]);
            this.lavaHeightVelPipeline = this.createComputePipeline(
                lavaHeightVelShader, 'main', this.lavaHeightVelBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.pipeLen, uniforms.timestep, uniforms.pipeArea,
            uniforms.momentum, 0.0, 0.0, 0.0,
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
            createSampledTextureBinding(texturePool.readLavaFlux2Texture, 5),
            { binding: 6, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaHeightVelPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava-lava layered thermal transfer pass.
     * Handles heat conduction between lava layers: incoming hot lava over cooler lava,
     * lateral heat diffusion, crust-suppressed mixing, and re-mobilization.
     */
    lavaThermalTransferPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            kCond: number;
            crustMixSuppression: number;
            softeningTemp: number;
            timestep: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaThermalTransferPipeline) {
            
            this.lavaThermalTransferBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),    // readLava
                createSampledTextureLayoutEntry(1),    // readLavaVel
                createStorageTextureLayoutEntry(2, 'write-only'),  // writeLava
                createUniformBufferLayoutEntry(3),     // uniforms
                createSampledTextureLayoutEntry(4),    // readTerrain (substrate conduction)
            ]);
            this.lavaThermalTransferPipeline = this.createComputePipeline(
                lavaThermalTransferShader, 'main', this.lavaThermalTransferBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.simRes, uniforms.kCond, uniforms.crustMixSuppression,
            uniforms.softeningTemp, uniforms.timestep, 0, 0, 0,
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaThermalTransfer');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaThermalTransfer-uniforms');
            this.uniformBuffers.set('lavaThermalTransfer', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaThermalTransferBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createSampledTextureBinding(texturePool.readLavaVelTexture, 1),
            createStorageTextureBinding(texturePool.writeLavaTexture, 2),
            { binding: 3, resource: { buffer: uniformBuffer } },
            createSampledTextureBinding(texturePool.readTerrainTexture, 4),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaThermalTransferPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaThermalErosionPipeline) {

            this.lavaThermalErosionBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),   // readLava
                createSampledTextureLayoutEntry(1),   // readLavaVel
                createSampledTextureLayoutEntry(2),   // readTerrain
                createStorageTextureLayoutEntry(3, 'write-only'),  // writeTerrain
                createSampledTextureLayoutEntry(4),   // readBasalt
                createStorageTextureLayoutEntry(5, 'write-only'),  // writeBasalt
                createUniformBufferLayoutEntry(6),    // uniforms
            ]);
            this.lavaThermalErosionPipeline = this.createComputePipeline(
                lavaThermalErosionShader, 'main', this.lavaThermalErosionBindGroupLayout
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
            createSampledTextureBinding(texturePool.readBasaltTexture, 4),
            createStorageTextureBinding(texturePool.writeBasaltTexture, 5),
            { binding: 6, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaThermalErosionPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaCoolingPipeline) {

            this.lavaCoolingBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),   // readLava
                createSampledTextureLayoutEntry(1),   // readTerrain
                createStorageTextureLayoutEntry(2, 'write-only'),  // writeLava
                createStorageTextureLayoutEntry(3, 'write-only'),  // writeTerrain
                createUniformBufferLayoutEntry(4),    // uniforms
                createSampledTextureLayoutEntry(5),   // readLavaVel
                createSampledTextureLayoutEntry(6),   // readCoolLava
                createSampledTextureLayoutEntry(7),   // readBasalt
            ]);
            this.lavaCoolingPipeline = this.createComputePipeline(
                lavaCoolingShader, 'main', this.lavaCoolingBindGroupLayout
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
            createSampledTextureBinding(texturePool.readLavaVelTexture, 5),
            createSampledTextureBinding(texturePool.readCoolLavaTexture, 6),
            createSampledTextureBinding(texturePool.readBasaltTexture, 7),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaCoolingPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava-water interaction pass.
     * Enhanced mutual exclusion, quench crust, contact solidification, heat radius evaporation.
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
            timestep: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaWaterInteractionPipeline) {
            
            this.lavaWaterInteractionBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),
                createSampledTextureLayoutEntry(1),
                createStorageTextureLayoutEntry(2, 'write-only'),
                createStorageTextureLayoutEntry(3, 'write-only'),
                createUniformBufferLayoutEntry(4),
                createSampledTextureLayoutEntry(5),   // readBasalt
                createStorageTextureLayoutEntry(6, 'write-only'),  // writeBasalt
            ]);
            this.lavaWaterInteractionPipeline = this.createComputePipeline(
                lavaWaterInteractionShader, 'main', this.lavaWaterInteractionBindGroupLayout
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
        v.setFloat32(24, uniforms.timestep, LE);
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
            createSampledTextureBinding(texturePool.readBasaltTexture, 5),
            createStorageTextureBinding(texturePool.writeBasaltTexture, 6),
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaWaterInteractionPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Lava solidification pass.
     * Three-layer phase transitions: mobile lava → cool lava → basalt.
     * Includes re-melting by hot lava and noise-modulated crusting rates.
     */
    lavaSolidificationPass(
        texturePool: WebGPUTexturePool,
        uniforms: {
            simRes: number;
            coolThreshold: number;
            basaltThreshold: number;
            coolificationRate: number;
            basaltificationRate: number;
            reMeltRate: number;
            basaltMeltRate: number;
            noiseModulation: number;
        },
        encoder?: GPUCommandEncoder
    ): void {
        const device = this.device;

        if (!this.lavaSolidificationPipeline) {

            this.lavaSolidificationBindGroupLayout = this.createBindGroupLayout([
                createSampledTextureLayoutEntry(0),   // readLava
                createSampledTextureLayoutEntry(1),   // readCoolLava
                createSampledTextureLayoutEntry(2),   // readBasalt
                createSampledTextureLayoutEntry(3),   // readNoise
                createSampledTextureLayoutEntry(4),   // readLavaVel
                createStorageTextureLayoutEntry(5, 'write-only'),  // writeLava
                createStorageTextureLayoutEntry(6, 'write-only'),  // writeCoolLava
                createStorageTextureLayoutEntry(7, 'write-only'),  // writeBasalt
                createUniformBufferLayoutEntry(8),    // uniforms
            ]);
            this.lavaSolidificationPipeline = this.createComputePipeline(
                lavaSolidificationShader, 'main', this.lavaSolidificationBindGroupLayout
            );
        }

        const uniformData = new Float32Array([
            uniforms.coolThreshold, uniforms.basaltThreshold,
            uniforms.coolificationRate, uniforms.basaltificationRate,
            uniforms.reMeltRate, uniforms.basaltMeltRate,
            uniforms.noiseModulation, 0.0,
        ]);

        let uniformBuffer = this.uniformBuffers.get('lavaSolidification');
        if (!uniformBuffer || uniformBuffer.size < uniformData.byteLength) {
            if (uniformBuffer) uniformBuffer.destroy();
            uniformBuffer = createUniformBuffer(device, uniformData, 'lavaSolidification-uniforms');
            this.uniformBuffers.set('lavaSolidification', uniformBuffer);
        } else {
            device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);
        }

        const bindGroup = this.createBindGroup(this.lavaSolidificationBindGroupLayout!, [
            createSampledTextureBinding(texturePool.readLavaTexture, 0),
            createSampledTextureBinding(texturePool.readCoolLavaTexture, 1),
            createSampledTextureBinding(texturePool.readBasaltTexture, 2),
            createSampledTextureBinding(texturePool.noiseTexture, 3),
            createSampledTextureBinding(texturePool.readLavaVelTexture, 4),
            createStorageTextureBinding(texturePool.writeLavaTexture, 5),
            createStorageTextureBinding(texturePool.writeCoolLavaTexture, 6),
            createStorageTextureBinding(texturePool.writeBasaltTexture, 7),
            { binding: 8, resource: { buffer: uniformBuffer } },
        ]);

        const [workgroupX, workgroupY] = calculateWorkgroupCount2D(uniforms.simRes, 8);
        const commandEncoder = encoder ?? device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.lavaSolidificationPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(workgroupX, workgroupY, 1);
        computePass.end();
        if (!encoder) device.queue.submit([commandEncoder.finish()]);
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
        this.lavaSolidificationPipeline = null;
        this.lavaSolidificationBindGroupLayout = null;
    }
}
