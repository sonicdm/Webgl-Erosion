/**
 * Terrain Generator Compute Pipeline
 *
 * Manages GPU-based terrain generation using WebGPU compute shaders.
 * Bridges TypeScript parameters to WGSL uniform buffer layout.
 */

import { GPUTerrainGeneratorParams, DEFAULT_GPU_TERRAIN_PARAMS, TERRAIN_GENERATOR_TYPES } from '../../../terrain/types';
import { heightmapCache } from '../../../terrain/HeightmapCache';
import terrainGenerateShader from './shaders/terrain-generate.wgsl?raw';

/**
 * Size of the uniform buffer in bytes.
 * Must match the TerrainGeneratorUniforms struct in terrain-generate.wgsl.
 * 32 floats * 4 bytes = 128 bytes
 */
const UNIFORM_BUFFER_SIZE = 32 * 4;

/**
 * Manages terrain generation on the GPU using compute shaders.
 */
export class TerrainGeneratorCompute {
    private device: GPUDevice;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private uniformData: Float32Array;

    // Heightmap texture for imported heightmaps
    private heightmapTexture: GPUTexture | null = null;
    private dummyHeightmapTexture: GPUTexture | null = null;

    // Current parameters
    private params: GPUTerrainGeneratorParams;

    constructor(device: GPUDevice) {
        this.device = device;
        this.params = { ...DEFAULT_GPU_TERRAIN_PARAMS };
        this.uniformData = new Float32Array(32);
    }

    /**
     * Initialize the compute pipeline.
     * Must be called before generating terrain.
     */
    async initialize(): Promise<void> {
        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Terrain Generator Bind Group Layout',
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba32float',
                        viewDimension: '2d',
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba32float',
                        viewDimension: '2d',
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: 'unfilterable-float', viewDimension: '2d' },
                },
            ],
        });

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            label: 'Terrain Generator Pipeline Layout',
            bindGroupLayouts: [this.bindGroupLayout],
        });

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            label: 'Terrain Generate Shader',
            code: terrainGenerateShader,
        });

        // Create compute pipeline
        this.pipeline = this.device.createComputePipeline({
            label: 'Terrain Generator Compute Pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'main',
            },
        });

        // Create uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            label: 'Terrain Generator Uniforms',
            size: UNIFORM_BUFFER_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create a dummy 1x1 texture for when no heightmap is loaded
        this.dummyHeightmapTexture = this.device.createTexture({
            label: 'Dummy Heightmap Texture',
            size: [1, 1, 1],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Initialize dummy texture with zeros
        const zeroData = new Float32Array([0, 0, 0, 1]);
        this.device.queue.writeTexture(
            { texture: this.dummyHeightmapTexture },
            zeroData,
            { bytesPerRow: 16 },
            { width: 1, height: 1 }
        );

        console.log('[TerrainGeneratorCompute] Initialized successfully');
    }

    /**
     * Update parameters from controls object.
     */
    updateParams(controls: {
        TerrainScale?: number;
        TerrainHeight?: number;
        TerrainBaseType?: number;
        TerrainMask?: number;
        // Generator parameters (to be added to GUI)
        terrainFrequency?: number;
        terrainAmplitude?: number;
        terrainOctaves?: number;
        terrainLacunarity?: number;
        terrainPersistence?: number;
        terrainSeed?: number;
        terrainOffsetX?: number;
        terrainOffsetY?: number;
        terrainRidgeOffset?: number;
        terrainRidgeGain?: number;
        terrainTerraceCount?: number;
        terrainDomainWarpStrength?: number;
        craterDensity?: number;
        canyonDepth?: number;
        duneDirectionX?: number;
        duneDirectionY?: number;
        heightmapAmplitude?: number;
        heightmapInvert?: boolean;
    }): void {
        // Map controls to GPU params
        if (controls.TerrainScale !== undefined) {
            this.params.terrainScale = controls.TerrainScale;
        }
        if (controls.TerrainHeight !== undefined) {
            this.params.terrainHeight = controls.TerrainHeight;
        }
        if (controls.TerrainBaseType !== undefined) {
            const baseType = Number(controls.TerrainBaseType);
            if (Number.isFinite(baseType)) {
                this.params.generatorType = baseType;
                // Auto-detect heightmap mode
                this.params.useHeightmap = baseType === TERRAIN_GENERATOR_TYPES.importedHeightmap ? 1 : 0;
            }
        }
        if (controls.TerrainMask !== undefined) {
            this.params.maskType = controls.TerrainMask;
        }

        // Generator parameters
        if (controls.terrainFrequency !== undefined) {
            this.params.frequency = controls.terrainFrequency;
        }
        if (controls.terrainAmplitude !== undefined) {
            this.params.amplitude = controls.terrainAmplitude;
        }
        if (controls.terrainOctaves !== undefined) {
            this.params.octaves = controls.terrainOctaves;
        }
        if (controls.terrainLacunarity !== undefined) {
            this.params.lacunarity = controls.terrainLacunarity;
        }
        if (controls.terrainPersistence !== undefined) {
            this.params.persistence = controls.terrainPersistence;
        }
        if (controls.terrainSeed !== undefined) {
            const seedVal = Number(controls.terrainSeed);
            if (Number.isFinite(seedVal) && seedVal !== 0) {
                this.params.seed = seedVal;
            }
        }
        if (controls.terrainOffsetX !== undefined) {
            this.params.offsetX = controls.terrainOffsetX;
        }
        if (controls.terrainOffsetY !== undefined) {
            this.params.offsetY = controls.terrainOffsetY;
        }
        if (controls.terrainRidgeOffset !== undefined) {
            this.params.ridgeOffset = controls.terrainRidgeOffset;
        }
        if (controls.terrainRidgeGain !== undefined) {
            this.params.ridgeGain = controls.terrainRidgeGain;
        }
        if (controls.terrainTerraceCount !== undefined) {
            this.params.terraceCount = controls.terrainTerraceCount;
        }
        if (controls.terrainDomainWarpStrength !== undefined) {
            this.params.domainWarpStrength = controls.terrainDomainWarpStrength;
        }
        if (controls.craterDensity !== undefined) {
            this.params.craterDensity = controls.craterDensity;
        }
        if (controls.canyonDepth !== undefined) {
            this.params.canyonDepth = controls.canyonDepth;
        }
        if (controls.duneDirectionX !== undefined) {
            this.params.duneDirectionX = controls.duneDirectionX;
        }
        if (controls.duneDirectionY !== undefined) {
            this.params.duneDirectionY = controls.duneDirectionY;
        }
        if (controls.heightmapAmplitude !== undefined) {
            this.params.heightmapAmplitude = controls.heightmapAmplitude;
        }
        if (controls.heightmapInvert !== undefined) {
            this.params.heightmapInvert = controls.heightmapInvert ? 1 : 0;
        }
    }

    /**
     * Set a random seed offset for terrain variation.
     */
    setRandomSeed(): void {
        this.params.seed = Math.random() * 1000;
        this.params.offsetX = Math.random() * 256;
        this.params.offsetY = Math.random() * 256;

        // Random dune direction
        const angle = Math.random() * Math.PI * 2;
        this.params.duneDirectionX = Math.cos(angle);
        this.params.duneDirectionY = Math.sin(angle);

        // Random crater and canyon parameters
        this.params.craterDensity = 0.8 + Math.random() * 0.7;
        this.params.canyonDepth = 0.45 + Math.random() * 0.5;
    }

    /**
     * Upload cached heightmap to GPU texture.
     * Called when using imported heightmap mode.
     */
    uploadHeightmapFromCache(resolution: number): boolean {
        if (!heightmapCache.hasCache()) {
            console.warn('[TerrainGeneratorCompute] No cached heightmap available');
            return false;
        }

        // Get scaled heightmap data from cache
        const scaledData = heightmapCache.getScaled(resolution, resolution, 1.0);
        if (!scaledData) {
            console.warn('[TerrainGeneratorCompute] Failed to get scaled heightmap from cache');
            return false;
        }

        // Destroy old texture if it exists and has different size
        if (this.heightmapTexture) {
            const currentSize = this.heightmapTexture.width;
            if (currentSize !== resolution) {
                this.heightmapTexture.destroy();
                this.heightmapTexture = null;
            }
        }

        // Create new texture if needed
        if (!this.heightmapTexture) {
            this.heightmapTexture = this.device.createTexture({
                label: 'Imported Heightmap Texture',
                size: [resolution, resolution, 1],
                format: 'rgba32float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
        }

        // Convert normalized heightmap data to RGBA32F format
        const rgbaData = new Float32Array(resolution * resolution * 4);
        for (let i = 0; i < resolution * resolution; i++) {
            rgbaData[i * 4 + 0] = scaledData[i]; // R = height
            rgbaData[i * 4 + 1] = 0; // G
            rgbaData[i * 4 + 2] = 0; // B
            rgbaData[i * 4 + 3] = 1; // A
        }

        // Upload to GPU
        const bytesPerRow = resolution * 16; // 4 floats * 4 bytes
        this.device.queue.writeTexture(
            { texture: this.heightmapTexture },
            rgbaData,
            { bytesPerRow, rowsPerImage: resolution },
            { width: resolution, height: resolution }
        );

        console.log(`[TerrainGeneratorCompute] Uploaded heightmap from cache (${resolution}x${resolution})`);
        return true;
    }

    /**
     * Generate terrain into the target textures.
     *
     * @param writeTextureA First target texture (read terrain)
     * @param writeTextureB Second target texture (write terrain)
     * @param resolution Simulation resolution
     */
    generate(
        writeTextureA: GPUTexture,
        writeTextureB: GPUTexture,
        resolution: number
    ): void {
        if (!this.pipeline || !this.bindGroupLayout || !this.uniformBuffer) {
            console.error('[TerrainGeneratorCompute] Pipeline not initialized');
            return;
        }

        // Update resolution in params
        this.params.resolution = resolution;

        // If using heightmap mode, upload from cache
        if (this.params.useHeightmap === 1) {
            this.uploadHeightmapFromCache(resolution);
        }

        // Pack uniform data
        this.packUniformData();

        // Upload uniforms to GPU
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

        // Get heightmap texture (use dummy if none loaded)
        const heightmapTex = this.heightmapTexture ?? this.dummyHeightmapTexture!;

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            label: 'Terrain Generator Bind Group',
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: writeTextureA.createView() },
                { binding: 1, resource: writeTextureB.createView() },
                { binding: 2, resource: { buffer: this.uniformBuffer } },
                { binding: 3, resource: heightmapTex.createView() },
            ],
        });

        // Create command encoder
        const encoder = this.device.createCommandEncoder({
            label: 'Terrain Generate Encoder',
        });

        // Begin compute pass
        const computePass = encoder.beginComputePass({
            label: 'Terrain Generate Pass',
        });

        computePass.setPipeline(this.pipeline);
        computePass.setBindGroup(0, bindGroup);

        // Dispatch workgroups (8x8 threads per workgroup)
        const workgroupsX = Math.ceil(resolution / 8);
        const workgroupsY = Math.ceil(resolution / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);

        computePass.end();

        // Submit
        this.device.queue.submit([encoder.finish()]);

        console.log(`[TerrainGeneratorCompute] Generated terrain (type=${this.params.generatorType}, res=${resolution})`);
    }

    /**
     * Pack parameters into the uniform buffer.
     * Must match the WGSL struct layout exactly.
     */
    private packUniformData(): void {
        const d = this.uniformData;
        // Int32Array view for writing integer fields at correct byte positions
        const intView = new Int32Array(d.buffer);

        // Basic parameters (vec4 aligned)
        d[0] = this.params.resolution;
        d[1] = this.params.terrainScale;
        d[2] = this.params.terrainHeight;
        intView[3] = this.params.generatorType; // i32

        // Mask parameters
        intView[4] = this.params.maskType; // i32
        d[5] = this.params.maskStrength;
        d[6] = this.params.maskCenterX;
        d[7] = this.params.maskCenterY;

        // Noise parameters
        d[8] = this.params.frequency;
        d[9] = this.params.amplitude;
        intView[10] = this.params.octaves; // i32
        d[11] = this.params.lacunarity;

        d[12] = this.params.persistence;
        d[13] = this.params.seed;
        d[14] = this.params.offsetX;
        d[15] = this.params.offsetY;

        // Generator-specific parameters
        d[16] = this.params.ridgeOffset;
        d[17] = this.params.ridgeGain;
        d[18] = this.params.terraceCount;
        d[19] = this.params.domainWarpStrength;

        // Additional parameters
        d[20] = this.params.erosionStrength;
        d[21] = this.params.smoothness;
        d[22] = this.params.duneDirectionX;
        d[23] = this.params.duneDirectionY;

        d[24] = this.params.craterDensity;
        d[25] = this.params.canyonDepth;
        d[26] = this.params.voronoiRandomness;
        intView[27] = this.params.useHeightmap; // i32

        // Heightmap parameters
        d[28] = this.params.heightmapAmplitude;
        intView[29] = this.params.heightmapInvert; // i32
        d[30] = this.params.padding1;
        d[31] = this.params.padding2;
    }

    /**
     * Get current parameters (for debugging/display).
     */
    getParams(): GPUTerrainGeneratorParams {
        return { ...this.params };
    }

    /**
     * Set parameters directly.
     */
    setParams(params: Partial<GPUTerrainGeneratorParams>): void {
        Object.assign(this.params, params);
    }

    /**
     * Dispose of GPU resources.
     */
    dispose(): void {
        this.uniformBuffer?.destroy();
        this.heightmapTexture?.destroy();
        this.dummyHeightmapTexture?.destroy();

        this.uniformBuffer = null;
        this.heightmapTexture = null;
        this.dummyHeightmapTexture = null;
        this.pipeline = null;
        this.bindGroupLayout = null;

        console.log('[TerrainGeneratorCompute] Disposed');
    }
}
