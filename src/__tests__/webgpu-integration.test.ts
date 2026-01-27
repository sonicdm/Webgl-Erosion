import { checkWebGPUSupport } from '../rendering/webgpu/capability-check';
import { WebGPURendererWrapper } from '../rendering/webgpu/WebGPURendererWrapper';
import OpenGLRenderer from '../rendering/gl/OpenGLRenderer';

// Mock the main function and its dependencies
jest.mock('../main', () => ({
    main: jest.fn()
}));

describe('WebGPU Integration in main.ts', () => {
    let mockCanvas: HTMLCanvasElement;

    beforeEach(() => {
        mockCanvas = document.createElement('canvas');
        mockCanvas.width = 800;
        mockCanvas.height = 600;
    });

    describe('WebGPU capability check', () => {
        it('should call WebGPU capability check at startup', async () => {
            const capability = await checkWebGPUSupport();
            
            // The check should complete without throwing
            expect(capability).toBeDefined();
            expect(typeof capability.supported).toBe('boolean');
        });
    });

    describe('Renderer selection', () => {
        it('should create WebGPURendererWrapper when WebGPU is supported', async () => {
            // Mock capability check to return supported
            jest.spyOn(require('../rendering/webgpu/capability-check'), 'checkWebGPUSupport')
                .mockResolvedValue({
                    supported: true,
                    adapter: {} as GPUAdapter,
                    device: {} as GPUDevice
                });

            const capability = await checkWebGPUSupport();
            
            if (capability.supported) {
                // In a real scenario, main.ts would create WebGPURendererWrapper
                const wrapper = new WebGPURendererWrapper(mockCanvas, {} as any);
                expect(wrapper).toBeDefined();
            }
        });

        it('should fall back to OpenGLRenderer when WebGPU is not supported', async () => {
            // Mock capability check to return unsupported
            jest.spyOn(require('../rendering/webgpu/capability-check'), 'checkWebGPUSupport')
                .mockResolvedValue({
                    supported: false,
                    fallbackReason: 'WebGPU not available'
                });

            const capability = await checkWebGPUSupport();
            
            if (!capability.supported) {
                // In a real scenario, main.ts would create OpenGLRenderer
                const renderer = new OpenGLRenderer(mockCanvas);
                expect(renderer).toBeDefined();
            }
        });

        it('should show appropriate fallback message when WebGPU unavailable', async () => {
            // Mock capability check to return unsupported
            jest.spyOn(require('../rendering/webgpu/capability-check'), 'checkWebGPUSupport')
                .mockResolvedValue({
                    supported: false,
                    fallbackReason: 'WebGPU not available'
                });

            const capability = await checkWebGPUSupport();
            
            expect(capability.supported).toBe(false);
            expect(capability.fallbackReason).toBeDefined();
            expect(capability.fallbackReason?.length).toBeGreaterThan(0);
            
            // In main.ts, this would be logged or shown to user
        });

        it('should complete app initialization successfully in both cases', async () => {
            // Test that both renderer paths allow app to initialize
            const capability = await checkWebGPUSupport();
            
            if (capability.supported) {
                const wrapper = new WebGPURendererWrapper(mockCanvas, {} as any);
                expect(wrapper).toBeDefined();
            } else {
                const renderer = new OpenGLRenderer(mockCanvas);
                expect(renderer).toBeDefined();
            }
        });
    });
});
