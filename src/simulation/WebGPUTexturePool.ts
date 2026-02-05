import { generateNoiseTexture } from './NoiseTextureGenerator';

/**
 * WebGPU texture pool for simulation textures.
 * Manages all WebGPU textures used in the simulation pipeline with ping-pong support.
 *
 * This replaces LegacyTexturePool for the WebGPU render path.
 */
export class WebGPUTexturePool {
    private device: GPUDevice;
    private simres: number;
    private shadowMapResolution: number;
    private zeroBuffer: Float32Array | null = null;

    // Simulation textures (ping-pong pairs)
    public readTerrainTexture: GPUTexture;
    public writeTerrainTexture: GPUTexture;
    public readFluxTexture: GPUTexture;
    public writeFluxTexture: GPUTexture;
    public readTerrainFluxTexture: GPUTexture; // thermal
    public writeTerrainFluxTexture: GPUTexture;
    public readMaxSlippageTexture: GPUTexture;
    public writeMaxSlippageTexture: GPUTexture;
    public readVelTexture: GPUTexture;
    public writeVelTexture: GPUTexture;
    public readSedimentTexture: GPUTexture;
    public writeSedimentTexture: GPUTexture;
    public terrainNorTexture: GPUTexture;
    public readSedimentBlendTexture: GPUTexture;
    public writeSedimentBlendTexture: GPUTexture;
    public sedimentAdvectATexture: GPUTexture;
    public sedimentAdvectBTexture: GPUTexture;

    // Lava simulation textures (ping-pong pairs)
    public readLavaTexture: GPUTexture;      // R=lavaHeight, G=temperature, B=viscosity, A=crustThickness
    public writeLavaTexture: GPUTexture;
    public readLavaFluxTexture: GPUTexture;  // R=fUp, G=fRight, B=fDown, A=fLeft
    public writeLavaFluxTexture: GPUTexture;
    public readLavaVelTexture: GPUTexture;   // R=velX, G=velY, B=speed, A=heat(derived)
    public writeLavaVelTexture: GPUTexture;

    // Lava channeling: 8-neighbor second flux texture
    public readLavaFlux2Texture: GPUTexture;  // R=fS, G=fSW, B=fW, A=fNW
    public writeLavaFlux2Texture: GPUTexture;

    // Lava layer system: cool lava (frozen but re-meltable)
    public readCoolLavaTexture: GPUTexture;   // R=coolLavaHeight (rgba32float for compatibility)
    public writeCoolLavaTexture: GPUTexture;

    // Lava layer system: basalt (permanently solidified)
    public readBasaltTexture: GPUTexture;     // R=basaltHeight (rgba32float for compatibility)
    public writeBasaltTexture: GPUTexture;

    // Lava channeling: noise texture (generated once, read-only)
    public noiseTexture: GPUTexture;

    // Height map texture for importing external height maps
    public heightmapTexture: GPUTexture | null = null;

    constructor(device: GPUDevice, simres: number, shadowMapResolution: number) {
        this.device = device;
        this.simres = simres;
        this.shadowMapResolution = shadowMapResolution;

        // Initialize textures (will be created in setup())
        this.readTerrainTexture = null as any;
        this.writeTerrainTexture = null as any;
        this.readFluxTexture = null as any;
        this.writeFluxTexture = null as any;
        this.readTerrainFluxTexture = null as any;
        this.writeTerrainFluxTexture = null as any;
        this.readMaxSlippageTexture = null as any;
        this.writeMaxSlippageTexture = null as any;
        this.readVelTexture = null as any;
        this.writeVelTexture = null as any;
        this.readSedimentTexture = null as any;
        this.writeSedimentTexture = null as any;
        this.terrainNorTexture = null as any;
        this.readSedimentBlendTexture = null as any;
        this.writeSedimentBlendTexture = null as any;
        this.sedimentAdvectATexture = null as any;
        this.sedimentAdvectBTexture = null as any;
        this.readLavaTexture = null as any;
        this.writeLavaTexture = null as any;
        this.readLavaFluxTexture = null as any;
        this.writeLavaFluxTexture = null as any;
        this.readLavaVelTexture = null as any;
        this.writeLavaVelTexture = null as any;
        this.readLavaFlux2Texture = null as any;
        this.writeLavaFlux2Texture = null as any;
        this.readCoolLavaTexture = null as any;
        this.writeCoolLavaTexture = null as any;
        this.readBasaltTexture = null as any;
        this.writeBasaltTexture = null as any;
        this.noiseTexture = null as any;
    }

    /**
     * Create a WebGPU texture for simulation use.
     * Format: rgba32float (equivalent to WebGL RGBA32F)
     */
    private createSimulationTexture(width: number, height: number): GPUTexture {
        return this.device.createTexture({
            size: [width, height, 1],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.STORAGE_BINDING | 
                   GPUTextureUsage.COPY_SRC | 
                   GPUTextureUsage.COPY_DST,
        });
    }

    /**
     * Setup all simulation textures.
     * Must be called after construction.
     */
    setup(): void {
        // Create simulation textures (ping-pong pairs)
        this.readTerrainTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeTerrainTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readTerrainFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeTerrainFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readMaxSlippageTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeMaxSlippageTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readVelTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeVelTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readSedimentTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeSedimentTexture = this.createSimulationTexture(this.simres, this.simres);
        this.terrainNorTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readSedimentBlendTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeSedimentBlendTexture = this.createSimulationTexture(this.simres, this.simres);
        this.sedimentAdvectATexture = this.createSimulationTexture(this.simres, this.simres);
        this.sedimentAdvectBTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readLavaTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeLavaTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readLavaFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeLavaFluxTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readLavaVelTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeLavaVelTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readLavaFlux2Texture = this.createSimulationTexture(this.simres, this.simres);
        this.writeLavaFlux2Texture = this.createSimulationTexture(this.simres, this.simres);
        this.readCoolLavaTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeCoolLavaTexture = this.createSimulationTexture(this.simres, this.simres);
        this.readBasaltTexture = this.createSimulationTexture(this.simres, this.simres);
        this.writeBasaltTexture = this.createSimulationTexture(this.simres, this.simres);
        this.noiseTexture = generateNoiseTexture(this.device, this.simres);
        this.zeroBuffer = null;
    }

    /**
     * Resize all simulation textures when simres changes.
     */
    resizeSimulationTextures(newSimres: number): void {
        this.simres = newSimres;
        this.zeroBuffer = null;

        // Destroy old textures
        this.destroyTexture(this.readTerrainTexture);
        this.destroyTexture(this.writeTerrainTexture);
        this.destroyTexture(this.readFluxTexture);
        this.destroyTexture(this.writeFluxTexture);
        this.destroyTexture(this.readTerrainFluxTexture);
        this.destroyTexture(this.writeTerrainFluxTexture);
        this.destroyTexture(this.readMaxSlippageTexture);
        this.destroyTexture(this.writeMaxSlippageTexture);
        this.destroyTexture(this.readVelTexture);
        this.destroyTexture(this.writeVelTexture);
        this.destroyTexture(this.readSedimentTexture);
        this.destroyTexture(this.writeSedimentTexture);
        this.destroyTexture(this.terrainNorTexture);
        this.destroyTexture(this.readSedimentBlendTexture);
        this.destroyTexture(this.writeSedimentBlendTexture);
        this.destroyTexture(this.sedimentAdvectATexture);
        this.destroyTexture(this.sedimentAdvectBTexture);
        this.destroyTexture(this.readLavaTexture);
        this.destroyTexture(this.writeLavaTexture);
        this.destroyTexture(this.readLavaFluxTexture);
        this.destroyTexture(this.writeLavaFluxTexture);
        this.destroyTexture(this.readLavaVelTexture);
        this.destroyTexture(this.writeLavaVelTexture);
        this.destroyTexture(this.readLavaFlux2Texture);
        this.destroyTexture(this.writeLavaFlux2Texture);
        this.destroyTexture(this.readCoolLavaTexture);
        this.destroyTexture(this.writeCoolLavaTexture);
        this.destroyTexture(this.readBasaltTexture);
        this.destroyTexture(this.writeBasaltTexture);
        this.destroyTexture(this.noiseTexture);

        // Recreate textures with new size
        this.setup();
    }

    /**
     * Seed terrain textures from a CPU heightmap buffer and optionally clear auxiliary textures.
     */
    seedTerrainFromHeightmap(heightData: Float32Array, clearAuxiliary: boolean = true): void {
        const expectedLength = this.simres * this.simres * 4;
        if (heightData.length < expectedLength) {
            console.warn('[WebGPUTexturePool] Heightmap buffer size mismatch, skipping seed', {
                expectedLength,
                actualLength: heightData.length,
            });
            return;
        }

        this.writeTexture(this.readTerrainTexture, heightData);
        this.writeTexture(this.writeTerrainTexture, heightData);

        if (!clearAuxiliary) {
            return;
        }

        const zero = this.getZeroBuffer();
        this.writeTexture(this.readFluxTexture, zero);
        this.writeTexture(this.writeFluxTexture, zero);
        this.writeTexture(this.readVelTexture, zero);
        this.writeTexture(this.writeVelTexture, zero);
        this.writeTexture(this.readSedimentTexture, zero);
        this.writeTexture(this.writeSedimentTexture, zero);
        this.writeTexture(this.readTerrainFluxTexture, zero);
        this.writeTexture(this.writeTerrainFluxTexture, zero);
        this.writeTexture(this.readMaxSlippageTexture, zero);
        this.writeTexture(this.writeMaxSlippageTexture, zero);
        this.writeTexture(this.terrainNorTexture, zero);
        this.writeTexture(this.readSedimentBlendTexture, zero);
        this.writeTexture(this.writeSedimentBlendTexture, zero);
        this.writeTexture(this.sedimentAdvectATexture, zero);
        this.writeTexture(this.sedimentAdvectBTexture, zero);
        this.clearLavaTextures();
    }

    /**
     * Clear all auxiliary textures (flux, velocity, sediment, etc.) without touching terrain.
     */
    clearAuxiliaryTextures(): void {
        const zero = this.getZeroBuffer();
        this.writeTexture(this.readFluxTexture, zero);
        this.writeTexture(this.writeFluxTexture, zero);
        this.writeTexture(this.readVelTexture, zero);
        this.writeTexture(this.writeVelTexture, zero);
        this.writeTexture(this.readSedimentTexture, zero);
        this.writeTexture(this.writeSedimentTexture, zero);
        this.writeTexture(this.readTerrainFluxTexture, zero);
        this.writeTexture(this.writeTerrainFluxTexture, zero);
        this.writeTexture(this.readMaxSlippageTexture, zero);
        this.writeTexture(this.writeMaxSlippageTexture, zero);
        this.writeTexture(this.terrainNorTexture, zero);
        this.writeTexture(this.readSedimentBlendTexture, zero);
        this.writeTexture(this.writeSedimentBlendTexture, zero);
        this.writeTexture(this.sedimentAdvectATexture, zero);
        this.writeTexture(this.sedimentAdvectBTexture, zero);
        this.clearLavaTextures();
    }

    /**
     * Clear all lava textures to zero.
     */
    clearLavaTextures(): void {
        const zero = this.getZeroBuffer();
        this.writeTexture(this.readLavaTexture, zero);
        this.writeTexture(this.writeLavaTexture, zero);
        this.writeTexture(this.readLavaFluxTexture, zero);
        this.writeTexture(this.writeLavaFluxTexture, zero);
        this.writeTexture(this.readLavaVelTexture, zero);
        this.writeTexture(this.writeLavaVelTexture, zero);
        this.writeTexture(this.readLavaFlux2Texture, zero);
        this.writeTexture(this.writeLavaFlux2Texture, zero);
        this.writeTexture(this.readCoolLavaTexture, zero);
        this.writeTexture(this.writeCoolLavaTexture, zero);
        this.writeTexture(this.readBasaltTexture, zero);
        this.writeTexture(this.writeBasaltTexture, zero);
    }

    private getZeroBuffer(): Float32Array {
        const expectedLength = this.simres * this.simres * 4;
        if (!this.zeroBuffer || this.zeroBuffer.length !== expectedLength) {
            this.zeroBuffer = new Float32Array(expectedLength);
        }
        return this.zeroBuffer;
    }

    private writeTexture(texture: GPUTexture, data: Float32Array): void {
        const bytesPerPixel = 16;
        const bytesPerRow = this.simres * bytesPerPixel;
        this.device.queue.writeTexture(
            { texture },
            data,
            { bytesPerRow, rowsPerImage: this.simres },
            { width: this.simres, height: this.simres, depthOrArrayLayers: 1 }
        );
    }

    /**
     * Destroy a texture and free its resources.
     */
    private destroyTexture(texture: GPUTexture | null): void {
        if (texture) {
            texture.destroy();
        }
    }

    /**
     * Clean up all textures.
     */
    dispose(): void {
        this.destroyTexture(this.readTerrainTexture);
        this.destroyTexture(this.writeTerrainTexture);
        this.destroyTexture(this.readFluxTexture);
        this.destroyTexture(this.writeFluxTexture);
        this.destroyTexture(this.readTerrainFluxTexture);
        this.destroyTexture(this.writeTerrainFluxTexture);
        this.destroyTexture(this.readMaxSlippageTexture);
        this.destroyTexture(this.writeMaxSlippageTexture);
        this.destroyTexture(this.readVelTexture);
        this.destroyTexture(this.writeVelTexture);
        this.destroyTexture(this.readSedimentTexture);
        this.destroyTexture(this.writeSedimentTexture);
        this.destroyTexture(this.terrainNorTexture);
        this.destroyTexture(this.readSedimentBlendTexture);
        this.destroyTexture(this.writeSedimentBlendTexture);
        this.destroyTexture(this.sedimentAdvectATexture);
        this.destroyTexture(this.sedimentAdvectBTexture);
        this.destroyTexture(this.readLavaTexture);
        this.destroyTexture(this.writeLavaTexture);
        this.destroyTexture(this.readLavaFluxTexture);
        this.destroyTexture(this.writeLavaFluxTexture);
        this.destroyTexture(this.readLavaVelTexture);
        this.destroyTexture(this.writeLavaVelTexture);
        this.destroyTexture(this.readLavaFlux2Texture);
        this.destroyTexture(this.writeLavaFlux2Texture);
        this.destroyTexture(this.readCoolLavaTexture);
        this.destroyTexture(this.writeCoolLavaTexture);
        this.destroyTexture(this.readBasaltTexture);
        this.destroyTexture(this.writeBasaltTexture);
        this.destroyTexture(this.noiseTexture);
        this.destroyTexture(this.heightmapTexture);
    }

    // Ping-pong swap functions
    swapTerrainTextures(): void {
        const tmp = this.readTerrainTexture;
        this.readTerrainTexture = this.writeTerrainTexture;
        this.writeTerrainTexture = tmp;
    }

    swapFluxTextures(): void {
        const tmp = this.readFluxTexture;
        this.readFluxTexture = this.writeFluxTexture;
        this.writeFluxTexture = tmp;
    }

    swapVelTextures(): void {
        const tmp = this.readVelTexture;
        this.readVelTexture = this.writeVelTexture;
        this.writeVelTexture = tmp;
    }

    swapSedimentTextures(): void {
        const tmp = this.readSedimentTexture;
        this.readSedimentTexture = this.writeSedimentTexture;
        this.writeSedimentTexture = tmp;
    }

    swapSedimentBlendTextures(): void {
        const tmp = this.readSedimentBlendTexture;
        this.readSedimentBlendTexture = this.writeSedimentBlendTexture;
        this.writeSedimentBlendTexture = tmp;
    }

    swapMaxSlippageTextures(): void {
        const tmp = this.readMaxSlippageTexture;
        this.readMaxSlippageTexture = this.writeMaxSlippageTexture;
        this.writeMaxSlippageTexture = tmp;
    }

    swapTerrainFluxTextures(): void {
        const tmp = this.readTerrainFluxTexture;
        this.readTerrainFluxTexture = this.writeTerrainFluxTexture;
        this.writeTerrainFluxTexture = tmp;
    }

    swapLavaTextures(): void {
        const tmp = this.readLavaTexture;
        this.readLavaTexture = this.writeLavaTexture;
        this.writeLavaTexture = tmp;
    }

    swapLavaFluxTextures(): void {
        const tmp = this.readLavaFluxTexture;
        this.readLavaFluxTexture = this.writeLavaFluxTexture;
        this.writeLavaFluxTexture = tmp;
    }

    swapLavaVelTextures(): void {
        const tmp = this.readLavaVelTexture;
        this.readLavaVelTexture = this.writeLavaVelTexture;
        this.writeLavaVelTexture = tmp;
    }

    swapLavaFlux2Textures(): void {
        const tmp = this.readLavaFlux2Texture;
        this.readLavaFlux2Texture = this.writeLavaFlux2Texture;
        this.writeLavaFlux2Texture = tmp;
    }

    swapCoolLavaTextures(): void {
        const tmp = this.readCoolLavaTexture;
        this.readCoolLavaTexture = this.writeCoolLavaTexture;
        this.writeCoolLavaTexture = tmp;
    }

    swapBasaltTextures(): void {
        const tmp = this.readBasaltTexture;
        this.readBasaltTexture = this.writeBasaltTexture;
        this.writeBasaltTexture = tmp;
    }

    setHeightMapTexture(texture: GPUTexture | null): void {
        if (this.heightmapTexture) {
            this.destroyTexture(this.heightmapTexture);
        }
        this.heightmapTexture = texture;
    }

    getHeightMapTexture(): GPUTexture | null {
        return this.heightmapTexture;
    }

    /**
     * Get the simulation resolution.
     */
    getSimRes(): number {
        return this.simres;
    }

    /**
     * Get the GPU device.
     */
    getDevice(): GPUDevice {
        return this.device;
    }
}
