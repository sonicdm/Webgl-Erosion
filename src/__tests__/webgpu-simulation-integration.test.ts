/**
 * Integration tests for WebGPU simulation pipeline.
 * Tests the complete simulation step execution with WebGPU compute shaders.
 */

import { ComputeNodePipeline } from '../rendering/webgpu/compute/ComputeNodePipeline';
import { WebGPUTexturePool } from '../simulation/WebGPUTexturePool';
import { SimulatePerStepWebGPU } from '../simulation/SimulatePerStepWebGPU';
import { AppContext } from '../app/context';
import { Controls } from '../settings';

// Mock GPUDevice for testing
function createMockGPUDevice(): GPUDevice {
    const mockTexture = {
        destroy: jest.fn(),
        createView: jest.fn(() => ({} as GPUTextureView)),
        width: 256,
        height: 256,
    } as any;

    const mockBuffer = {
        destroy: jest.fn(),
        size: 1024,
    } as any;

    const mockShaderModule = {} as GPUShaderModule;
    const mockComputePipeline = {} as GPUComputePipeline;
    const mockBindGroup = {} as GPUBindGroup;
    const mockBindGroupLayout = {} as GPUBindGroupLayout;
    const mockCommandEncoder = {
        beginComputePass: jest.fn(() => ({
            setPipeline: jest.fn(),
            setBindGroup: jest.fn(),
            dispatchWorkgroups: jest.fn(),
            end: jest.fn(),
        })),
        finish: jest.fn(() => ({} as GPUCommandBuffer)),
    };

    const mockDevice = {
        createTexture: jest.fn(() => mockTexture),
        createBuffer: jest.fn(() => mockBuffer),
        createShaderModule: jest.fn(() => mockShaderModule),
        createComputePipeline: jest.fn(() => mockComputePipeline),
        createBindGroup: jest.fn(() => mockBindGroup),
        createBindGroupLayout: jest.fn(() => mockBindGroupLayout),
        createCommandEncoder: jest.fn(() => mockCommandEncoder),
        queue: {
            writeBuffer: jest.fn(),
            submit: jest.fn(),
        },
    } as any;

    return mockDevice;
}

describe('WebGPU Simulation Integration', () => {
    let mockDevice: GPUDevice;
    let computePipeline: ComputeNodePipeline;
    let texturePool: WebGPUTexturePool;
    let appContext: AppContext;
    const simres = 256;

    beforeEach(() => {
        mockDevice = createMockGPUDevice();
        computePipeline = new ComputeNodePipeline(mockDevice);
        texturePool = new WebGPUTexturePool(mockDevice, simres, 1024);
        texturePool.setup();
        appContext = {
            simulationState: {
                simres: simres,
                pauseGeneration: false,
                heightMapCpuBuf: new Float32Array(simres * simres * 4),
                setHeightMapBufIsFresh: jest.fn(),
                incrementSimFrameCount: jest.fn(),
            } as any,
            terrainState: {} as any,
            clientState: {} as any,
        } as AppContext;
    });

    describe('SimulatePerStepWebGPU', () => {
        it('should execute rain and flow passes', () => {
            const controls: Controls = {
                RainDegree: 4.5,
                SimulationSpeed: 1,
                brushSize: 4,
                brushStrenth: 0.4,
                brushType: 0,
                brushPressed: 0,
                brushOperation: 0,
                RainErosion: false,
                RainErosionStrength: 1.0,
                RainErosionDropSize: 1.0,
                flattenTargetHeight: 0,
                slopeStartPos: [0, 0],
                slopeEndPos: [0, 0],
                slopeActive: 0,
                pipelen: 0.8,
                timestep: 0.05,
                pipeAra: 0.6,
                EvaporationConstant: 0.005,
            } as Controls;

            const brushState = {
                mouseWorldPos: [0, 0, 0, 0] as [number, number, number, number],
                mouseWorldDir: [0, 0, 0] as [number, number, number],
                brushPos: [0, 0] as [number, number],
            };

            // Should not throw
            expect(() => {
                SimulatePerStepWebGPU(computePipeline, texturePool, appContext, controls, 0, brushState);
            }).not.toThrow();
        });

        it('should handle pauseGeneration flag', () => {
            appContext.simulationState.pauseGeneration = true;
            const controls = {} as Controls;

            // Should return early without executing passes
            expect(() => {
                SimulatePerStepWebGPU(computePipeline, texturePool, appContext, controls, 0);
            }).not.toThrow();
        });
    });

    describe('texture pool integration', () => {
        it('should create all required textures', () => {
            expect(texturePool.readTerrainTexture).toBeDefined();
            expect(texturePool.writeTerrainTexture).toBeDefined();
            expect(texturePool.readFluxTexture).toBeDefined();
            expect(texturePool.writeFluxTexture).toBeDefined();
        });

        it('should swap textures correctly', () => {
            const readBefore = texturePool.readTerrainTexture;
            const writeBefore = texturePool.writeTerrainTexture;

            texturePool.swapTerrainTextures();

            expect(texturePool.readTerrainTexture).toBe(writeBefore);
            expect(texturePool.writeTerrainTexture).toBe(readBefore);
        });
    });
});
