import {
    createStorageTextureBinding,
    createSampledTextureBinding,
    createUniformBufferBinding,
    createStorageTextureLayoutEntry,
    createSampledTextureLayoutEntry,
    createUniformBufferLayoutEntry,
    createUniformBuffer,
    updateUniformBuffer,
    calculateWorkgroupCount2D,
} from '../ComputeNodeHelpers';

// Mock GPUDevice for testing
function createMockGPUDevice(): GPUDevice {
    const mockBuffer = {
        label: undefined as string | undefined,
    } as GPUBuffer;

    const mockDevice = {
        createBuffer: jest.fn(() => mockBuffer),
        queue: {
            writeBuffer: jest.fn(),
        },
    } as any;

    return mockDevice;
}

// Mock GPUTexture for testing
function createMockGPUTexture(): GPUTexture {
    const mockView = {} as GPUTextureView;
    return {
        createView: jest.fn(() => mockView),
    } as any;
}

describe('ComputeNodeHelpers', () => {
    describe('createStorageTextureBinding', () => {
        it('should create a storage texture binding', () => {
            const texture = createMockGPUTexture();
            const binding = createStorageTextureBinding(texture, 0);

            expect(binding.binding).toBe(0);
            expect(binding.resource).toBeDefined();
            expect(texture.createView).toHaveBeenCalled();
        });

        it('should use write-only access by default', () => {
            const texture = createMockGPUTexture();
            const binding = createStorageTextureBinding(texture, 1);
            expect(binding.binding).toBe(1);
        });
    });

    describe('createSampledTextureBinding', () => {
        it('should create a sampled texture binding', () => {
            const texture = createMockGPUTexture();
            const binding = createSampledTextureBinding(texture, 2);

            expect(binding.binding).toBe(2);
            expect(binding.resource).toBeDefined();
            expect(texture.createView).toHaveBeenCalled();
        });
    });

    describe('createUniformBufferBinding', () => {
        it('should create a uniform buffer binding', () => {
            const buffer = {} as GPUBuffer;
            const binding = createUniformBufferBinding(buffer, 3);

            expect(binding.binding).toBe(3);
            expect(binding.resource).toEqual({ buffer: buffer });
        });
    });

    describe('createStorageTextureLayoutEntry', () => {
        it('should create a storage texture layout entry', () => {
            const entry = createStorageTextureLayoutEntry(0);

            expect(entry.binding).toBe(0);
            expect(entry.visibility).toBe(GPUShaderStage.COMPUTE);
            expect(entry.storageTexture).toEqual({
                format: 'rgba32float',
                access: 'write-only',
            });
        });

        it('should support read-write access', () => {
            const entry = createStorageTextureLayoutEntry(1, 'read-write');
            expect(entry.storageTexture?.access).toBe('read-write');
        });
    });

    describe('createSampledTextureLayoutEntry', () => {
        it('should create a sampled texture layout entry', () => {
            const entry = createSampledTextureLayoutEntry(2);

            expect(entry.binding).toBe(2);
            expect(entry.visibility).toBe(GPUShaderStage.COMPUTE);
            expect(entry.texture).toEqual({
                sampleType: 'float',
            });
        });
    });

    describe('createUniformBufferLayoutEntry', () => {
        it('should create a uniform buffer layout entry', () => {
            const entry = createUniformBufferLayoutEntry(3);

            expect(entry.binding).toBe(3);
            expect(entry.visibility).toBe(GPUShaderStage.COMPUTE);
            expect(entry.buffer).toEqual({
                type: 'uniform',
            });
        });
    });

    describe('createUniformBuffer', () => {
        it('should create a uniform buffer from ArrayBufferView', () => {
            const device = createMockGPUDevice();
            const data = new Float32Array([1.0, 2.0, 3.0]);

            const buffer = createUniformBuffer(device, data);

            expect(device.createBuffer).toHaveBeenCalledWith({
                label: undefined,
                size: data.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            expect(device.queue.writeBuffer).toHaveBeenCalled();
            expect(buffer).toBeDefined();
        });

        it('should create a uniform buffer from number array', () => {
            const device = createMockGPUDevice();
            const data = [1.0, 2.0, 3.0];

            const buffer = createUniformBuffer(device, data);

            expect(device.createBuffer).toHaveBeenCalled();
            expect(device.queue.writeBuffer).toHaveBeenCalled();
            expect(buffer).toBeDefined();
        });

        it('should use label if provided', () => {
            const device = createMockGPUDevice();
            const data = new Float32Array([1.0]);

            createUniformBuffer(device, data, 'test-buffer');

            expect(device.createBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    label: 'test-buffer',
                })
            );
        });
    });

    describe('updateUniformBuffer', () => {
        it('should update a uniform buffer', () => {
            const device = createMockGPUDevice();
            const buffer = {} as GPUBuffer;
            const data = new Float32Array([4.0, 5.0]);

            updateUniformBuffer(device, buffer, data);

            expect(device.queue.writeBuffer).toHaveBeenCalledWith(
                buffer,
                0,
                expect.any(ArrayBuffer)
            );
        });

        it('should support offset', () => {
            const device = createMockGPUDevice();
            const buffer = {} as GPUBuffer;
            const data = new Float32Array([6.0]);

            updateUniformBuffer(device, buffer, data, 16);

            expect(device.queue.writeBuffer).toHaveBeenCalledWith(
                buffer,
                16,
                expect.any(ArrayBuffer)
            );
        });
    });

    describe('calculateWorkgroupCount2D', () => {
        it('should calculate workgroup count for 256x256 texture', () => {
            const [x, y] = calculateWorkgroupCount2D(256, 8);
            expect(x).toBe(32);
            expect(y).toBe(32);
        });

        it('should round up for non-divisible sizes', () => {
            const [x, y] = calculateWorkgroupCount2D(257, 8);
            expect(x).toBe(33);
            expect(y).toBe(33);
        });

        it('should use default workgroup size of 8', () => {
            const [x, y] = calculateWorkgroupCount2D(256);
            expect(x).toBe(32);
            expect(y).toBe(32);
        });
    });
});
