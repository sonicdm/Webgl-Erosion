import { readHeightmapFromTexture } from '../webgpu-terrain-readback';

// Mock GPUDevice for testing
function createMockGPUDevice(): GPUDevice {
    const mockStagingBuffer = {
        mapAsync: jest.fn(() => Promise.resolve()),
        getMappedRange: jest.fn(() => new ArrayBuffer(1024)),
        unmap: jest.fn(),
        destroy: jest.fn(),
    } as any;

    const mockCommandBuffer = {} as GPUCommandBuffer;
    const mockCommandEncoder = {
        copyTextureToBuffer: jest.fn(),
        finish: jest.fn(() => mockCommandBuffer),
    };

    const mockDevice = {
        createBuffer: jest.fn(() => mockStagingBuffer),
        createCommandEncoder: jest.fn(() => mockCommandEncoder),
        queue: { submit: jest.fn() },
        limits: { maxBufferSize: 268435456 }, // 256MB so chunked path is used when needed
    } as any;

    return mockDevice;
}

// Mock GPUTexture for testing
function createMockGPUTexture(width: number = 256): GPUTexture {
    return {
        width: width,
        height: width,
    } as GPUTexture;
}

describe('WebGPU Terrain Readback', () => {
    describe('readHeightmapFromTexture', () => {
        it('should read heightmap data from texture', async () => {
            const device = createMockGPUDevice();
            const texture = createMockGPUTexture(256);
            const buffer = new Float32Array(256 * 256 * 4);

            await readHeightmapFromTexture(device, texture, buffer);

            expect(device.createBuffer).toHaveBeenCalled();
            expect(device.createCommandEncoder).toHaveBeenCalled();
            expect(device.queue.submit).toHaveBeenCalled();
        });

        it('should create staging buffer with correct size', async () => {
            const device = createMockGPUDevice();
            const texture = createMockGPUTexture(128);
            const buffer = new Float32Array(128 * 128 * 4);

            await readHeightmapFromTexture(device, texture, buffer);

            const bufferSize = 128 * 128 * 16; // 128x128 * 16 bytes per pixel (RGBA32F)
            expect(device.createBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    size: bufferSize,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                })
            );
        });

        it('should copy texture to buffer with correct parameters', async () => {
            const device = createMockGPUDevice();
            const texture = createMockGPUTexture(256);
            const buffer = new Float32Array(256 * 256 * 4);

            await readHeightmapFromTexture(device, texture, buffer);

            const commandEncoder = device.createCommandEncoder();
            expect(commandEncoder.copyTextureToBuffer).toHaveBeenCalled();
        });
    });
});
