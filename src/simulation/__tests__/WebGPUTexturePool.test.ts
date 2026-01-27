import { WebGPUTexturePool } from '../WebGPUTexturePool';

// Mock WebGPU device for testing
function createMockGPUDevice(): GPUDevice {
    const mockTexture = {
        destroy: jest.fn(),
    } as any;

    const mockDevice = {
        createTexture: jest.fn(() => mockTexture),
    } as any;

    return mockDevice;
}

describe('WebGPUTexturePool', () => {
    let mockDevice: GPUDevice;
    const simres = 256;
    const shadowMapResolution = 1024;

    beforeEach(() => {
        mockDevice = createMockGPUDevice();
    });

    describe('construction', () => {
        it('should create a WebGPUTexturePool instance', () => {
            const pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            expect(pool).toBeDefined();
        });

        it('should store simres and shadowMapResolution', () => {
            const pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            expect(pool.getSimRes()).toBe(simres);
        });
    });

    describe('setup', () => {
        it('should create all simulation textures', () => {
            const pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();

            // Verify createTexture was called for all simulation textures
            expect(mockDevice.createTexture).toHaveBeenCalledTimes(15); // 15 simulation textures

            // Verify texture creation parameters
            const calls = (mockDevice.createTexture as jest.Mock).mock.calls;
            calls.forEach(call => {
                const config = call[0];
                expect(config.size).toEqual([simres, simres, 1]);
                expect(config.format).toBe('rgba32float');
                expect(config.usage).toContain(GPUTextureUsage.TEXTURE_BINDING);
                expect(config.usage).toContain(GPUTextureUsage.STORAGE_BINDING);
                expect(config.usage).toContain(GPUTextureUsage.COPY_SRC);
                expect(config.usage).toContain(GPUTextureUsage.COPY_DST);
            });
        });

        it('should initialize all texture properties', () => {
            const pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();

            expect(pool.readTerrainTexture).toBeDefined();
            expect(pool.writeTerrainTexture).toBeDefined();
            expect(pool.readFluxTexture).toBeDefined();
            expect(pool.writeFluxTexture).toBeDefined();
            expect(pool.readTerrainFluxTexture).toBeDefined();
            expect(pool.writeTerrainFluxTexture).toBeDefined();
            expect(pool.readMaxSlippageTexture).toBeDefined();
            expect(pool.writeMaxSlippageTexture).toBeDefined();
            expect(pool.readVelTexture).toBeDefined();
            expect(pool.writeVelTexture).toBeDefined();
            expect(pool.readSedimentTexture).toBeDefined();
            expect(pool.writeSedimentTexture).toBeDefined();
            expect(pool.terrainNorTexture).toBeDefined();
            expect(pool.readSedimentBlendTexture).toBeDefined();
            expect(pool.writeSedimentBlendTexture).toBeDefined();
            expect(pool.sedimentAdvectATexture).toBeDefined();
            expect(pool.sedimentAdvectBTexture).toBeDefined();
        });
    });

    describe('ping-pong swaps', () => {
        let pool: WebGPUTexturePool;

        beforeEach(() => {
            pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();
        });

        it('should swap terrain textures', () => {
            const readBefore = pool.readTerrainTexture;
            const writeBefore = pool.writeTerrainTexture;

            pool.swapTerrainTextures();

            expect(pool.readTerrainTexture).toBe(writeBefore);
            expect(pool.writeTerrainTexture).toBe(readBefore);
        });

        it('should swap flux textures', () => {
            const readBefore = pool.readFluxTexture;
            const writeBefore = pool.writeFluxTexture;

            pool.swapFluxTextures();

            expect(pool.readFluxTexture).toBe(writeBefore);
            expect(pool.writeFluxTexture).toBe(readBefore);
        });

        it('should swap velocity textures', () => {
            const readBefore = pool.readVelTexture;
            const writeBefore = pool.writeVelTexture;

            pool.swapVelTextures();

            expect(pool.readVelTexture).toBe(writeBefore);
            expect(pool.writeVelTexture).toBe(readBefore);
        });

        it('should swap sediment textures', () => {
            const readBefore = pool.readSedimentTexture;
            const writeBefore = pool.writeSedimentTexture;

            pool.swapSedimentTextures();

            expect(pool.readSedimentTexture).toBe(writeBefore);
            expect(pool.writeSedimentTexture).toBe(readBefore);
        });

        it('should swap sediment blend textures', () => {
            const readBefore = pool.readSedimentBlendTexture;
            const writeBefore = pool.writeSedimentBlendTexture;

            pool.swapSedimentBlendTextures();

            expect(pool.readSedimentBlendTexture).toBe(writeBefore);
            expect(pool.writeSedimentBlendTexture).toBe(readBefore);
        });

        it('should swap max slippage textures', () => {
            const readBefore = pool.readMaxSlippageTexture;
            const writeBefore = pool.writeMaxSlippageTexture;

            pool.swapMaxSlippageTextures();

            expect(pool.readMaxSlippageTexture).toBe(writeBefore);
            expect(pool.writeMaxSlippageTexture).toBe(readBefore);
        });

        it('should swap terrain flux textures', () => {
            const readBefore = pool.readTerrainFluxTexture;
            const writeBefore = pool.writeTerrainFluxTexture;

            pool.swapTerrainFluxTextures();

            expect(pool.readTerrainFluxTexture).toBe(writeBefore);
            expect(pool.writeTerrainFluxTexture).toBe(readBefore);
        });
    });

    describe('heightmap texture', () => {
        let pool: WebGPUTexturePool;

        beforeEach(() => {
            pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();
        });

        it('should set and get heightmap texture', () => {
            const mockHeightmap = mockDevice.createTexture({ size: [256, 256, 1], format: 'rgba32float', usage: 0 });
            pool.setHeightMapTexture(mockHeightmap);
            expect(pool.getHeightMapTexture()).toBe(mockHeightmap);
        });

        it('should destroy old heightmap when setting new one', () => {
            const oldHeightmap = mockDevice.createTexture({ size: [256, 256, 1], format: 'rgba32float', usage: 0 });
            pool.setHeightMapTexture(oldHeightmap);
            
            const newHeightmap = mockDevice.createTexture({ size: [256, 256, 1], format: 'rgba32float', usage: 0 });
            pool.setHeightMapTexture(newHeightmap);

            expect(oldHeightmap.destroy).toHaveBeenCalled();
            expect(pool.getHeightMapTexture()).toBe(newHeightmap);
        });
    });

    describe('resize', () => {
        let pool: WebGPUTexturePool;

        beforeEach(() => {
            pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();
        });

        it('should resize all simulation textures', () => {
            const newSimres = 512;
            const destroySpy = jest.spyOn(pool as any, 'destroyTexture');

            pool.resizeSimulationTextures(newSimres);

            expect(pool.getSimRes()).toBe(newSimres);
            // Should destroy 15 textures (all simulation textures)
            expect(destroySpy).toHaveBeenCalledTimes(15);
            // Should recreate all textures
            expect(mockDevice.createTexture).toHaveBeenCalledTimes(30); // 15 initial + 15 after resize
        });
    });

    describe('dispose', () => {
        let pool: WebGPUTexturePool;

        beforeEach(() => {
            pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            pool.setup();
        });

        it('should destroy all textures', () => {
            const destroySpy = jest.spyOn(pool as any, 'destroyTexture');

            pool.dispose();

            // Should destroy all 15 simulation textures + heightmap (if set)
            expect(destroySpy).toHaveBeenCalledTimes(15);
        });
    });

    describe('device access', () => {
        it('should return the GPU device', () => {
            const pool = new WebGPUTexturePool(mockDevice, simres, shadowMapResolution);
            expect(pool.getDevice()).toBe(mockDevice);
        });
    });
});
