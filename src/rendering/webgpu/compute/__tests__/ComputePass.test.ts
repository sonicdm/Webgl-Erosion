import { ComputePass } from '../ComputePass';

// Mock GPUDevice for testing
function createMockGPUDevice(): GPUDevice {
    const mockShaderModule = {} as GPUShaderModule;
    const mockComputePipeline = {} as GPUComputePipeline;
    const mockBindGroup = {} as GPUBindGroup;
    const mockBindGroupLayout = {} as GPUBindGroupLayout;

    const mockPipelineLayout = {} as GPUPipelineLayout;

    const mockDevice = {
        createShaderModule: jest.fn(() => mockShaderModule),
        createComputePipeline: jest.fn(() => mockComputePipeline),
        createPipelineLayout: jest.fn(() => mockPipelineLayout),
        createBindGroup: jest.fn(() => mockBindGroup),
        createBindGroupLayout: jest.fn(() => mockBindGroupLayout),
    } as any;

    return mockDevice;
}

describe('ComputePass', () => {
    let mockDevice: GPUDevice;
    let computePass: ComputePass;

    beforeEach(() => {
        mockDevice = createMockGPUDevice();
        computePass = new ComputePass(mockDevice);
    });

    describe('construction', () => {
        it('should create a ComputePass instance', () => {
            expect(computePass).toBeDefined();
        });
    });

    describe('createComputePipeline', () => {
        it('should create a compute pipeline from shader code', () => {
            const shaderCode = `
                @compute @workgroup_size(8, 8)
                fn main() {
                }
            `;

            const pipeline = computePass['createComputePipeline'](shaderCode);

            expect(mockDevice.createShaderModule).toHaveBeenCalledWith({
                code: shaderCode,
            });
            expect(mockDevice.createComputePipeline).toHaveBeenCalledWith({
                layout: 'auto',
                compute: {
                    module: expect.any(Object),
                    entryPoint: 'main',
                },
            });
            expect(pipeline).toBeDefined();
        });

        it('should use explicit bind group layout when provided', () => {
            const shaderCode = `
                @compute @workgroup_size(8, 8)
                fn main() {
                }
            `;
            const mockLayout = {} as GPUBindGroupLayout;

            computePass['createComputePipeline'](shaderCode, 'main', mockLayout);

            expect(mockDevice.createPipelineLayout).toHaveBeenCalledWith({
                bindGroupLayouts: [mockLayout],
            });
            expect(mockDevice.createComputePipeline).toHaveBeenCalledWith(
                expect.objectContaining({
                    layout: expect.any(Object), // The pipeline layout object
                })
            );
        });

        it('should use custom entry point', () => {
            const shaderCode = `
                @compute @workgroup_size(8, 8)
                fn customEntry() {
                }
            `;

            computePass['createComputePipeline'](shaderCode, 'customEntry');

            expect(mockDevice.createComputePipeline).toHaveBeenCalledWith(
                expect.objectContaining({
                    compute: expect.objectContaining({
                        entryPoint: 'customEntry',
                    }),
                })
            );
        });
    });

    describe('createBindGroup', () => {
        it('should create a bind group', () => {
            const mockLayout = {} as GPUBindGroupLayout;
            const mockResources: GPUBindGroupEntry[] = [
                { binding: 0, resource: {} as any },
            ];

            const bindGroup = computePass['createBindGroup'](mockLayout, mockResources);

            expect(mockDevice.createBindGroup).toHaveBeenCalledWith({
                layout: mockLayout,
                entries: mockResources,
            });
            expect(bindGroup).toBeDefined();
        });
    });

    describe('createBindGroupLayout', () => {
        it('should create a bind group layout', () => {
            const entries: GPUBindGroupLayoutEntry[] = [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        format: 'rgba32float',
                        access: 'write-only',
                    },
                },
            ];

            const layout = computePass['createBindGroupLayout'](entries);

            expect(mockDevice.createBindGroupLayout).toHaveBeenCalledWith({
                entries: entries,
            });
            expect(layout).toBeDefined();
        });
    });

    describe('calculateWorkgroupCount2D', () => {
        it('should calculate workgroup count for 256x256 texture with 8x8 workgroups', () => {
            const [x, y] = computePass['calculateWorkgroupCount2D'](256, 8);
            expect(x).toBe(32); // 256 / 8 = 32
            expect(y).toBe(32);
        });

        it('should round up for non-divisible sizes', () => {
            const [x, y] = computePass['calculateWorkgroupCount2D'](257, 8);
            expect(x).toBe(33); // Math.ceil(257 / 8) = 33
            expect(y).toBe(33);
        });

        it('should use default workgroup size of 8', () => {
            const [x, y] = computePass['calculateWorkgroupCount2D'](256);
            expect(x).toBe(32);
            expect(y).toBe(32);
        });
    });

    describe('dispatch', () => {
        it('should throw error if pipeline not initialized', () => {
            const mockEncoder = {
                setPipeline: jest.fn(),
                setBindGroup: jest.fn(),
                dispatchWorkgroups: jest.fn(),
            } as any;

            expect(() => {
                computePass['dispatch'](mockEncoder, 1, 1);
            }).toThrow('Compute pipeline not initialized');
        });

        it('should dispatch workgroups with pipeline and bind group', () => {
            const mockPipeline = {} as GPUComputePipeline;
            const mockBindGroup = {} as GPUBindGroup;
            computePass['computePipeline'] = mockPipeline;
            computePass['bindGroup'] = mockBindGroup;

            const mockEncoder = {
                setPipeline: jest.fn(),
                setBindGroup: jest.fn(),
                dispatchWorkgroups: jest.fn(),
            } as any;

            computePass['dispatch'](mockEncoder, 32, 32, 1);

            expect(mockEncoder.setPipeline).toHaveBeenCalledWith(mockPipeline);
            expect(mockEncoder.setBindGroup).toHaveBeenCalledWith(0, mockBindGroup);
            expect(mockEncoder.dispatchWorkgroups).toHaveBeenCalledWith(32, 32, 1);
        });
    });

    describe('dispose', () => {
        it('should clear pipeline and bind group', () => {
            computePass['computePipeline'] = {} as GPUComputePipeline;
            computePass['bindGroup'] = {} as GPUBindGroup;

            computePass.dispose();

            expect(computePass['computePipeline']).toBeNull();
            expect(computePass['bindGroup']).toBeNull();
        });
    });
});
