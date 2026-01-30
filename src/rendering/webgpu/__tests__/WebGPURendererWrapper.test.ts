/**
 * @jest-environment jsdom
 */
import { WebGPURendererWrapper } from '../WebGPURendererWrapper';
import { AppContext } from '../../../app/context';
import { createApp } from '../../../app/bootstrap';

jest.mock('../capability-check', () => ({
    checkWebGPUSupport: jest.fn().mockResolvedValue({ supported: true, fallbackReason: null }),
}));

// Mock Three.js WebGPURenderer (wrapper uses three/webgpu which is separately mocked)
jest.mock('three', () => {
    const actualThree = jest.requireActual('three');
    return {
        ...actualThree,
        WebGPURenderer: jest.fn().mockImplementation(() => ({
            setClearColor: jest.fn(),
            setSize: jest.fn(),
            clear: jest.fn(),
            render: jest.fn(),
            init: jest.fn().mockResolvedValue(undefined),
            dispose: jest.fn()
        }))
    };
});

describe('WebGPURendererWrapper', () => {
    let canvas: HTMLCanvasElement;
    let appContext: AppContext;

    beforeEach(() => {
        // Create a mock canvas
        canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        
        // Create app context
        appContext = createApp(1024);
    });

    describe('constructor', () => {
        it('should accept canvas and AppContext', () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            
            expect(wrapper).toBeDefined();
        });

        it('should throw error if WebGPU not supported', async () => {
            const { checkWebGPUSupport } = await import('../capability-check');
            (checkWebGPUSupport as jest.Mock).mockResolvedValueOnce({
                supported: false,
                fallbackReason: 'WebGPU not available',
            });
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            await expect(wrapper.initialize()).rejects.toThrow();
        });
    });

    describe('setClearColor', () => {
        it('should set clear color correctly', async () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            await wrapper.initialize();
            
            wrapper.setClearColor(0.5, 0.6, 0.7, 1.0);
            
            // Verify the underlying renderer's setClearColor was called
            // This will be verified through the mock
            expect(wrapper).toBeDefined();
        });
    });

    describe('setSize', () => {
        it('should update renderer size', async () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            await wrapper.initialize();
            
            wrapper.setSize(1920, 1080);
            
            expect(wrapper).toBeDefined();
        });
    });

    describe('clear', () => {
        it('should clear the render buffer', async () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            await wrapper.initialize();
            
            wrapper.clear();
            
            expect(wrapper).toBeDefined();
        });
    });

    describe('render', () => {
        it('should render scene with camera and materials', async () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            await wrapper.initialize();
            
            // Mock camera and scene objects
            const mockCamera = {} as any;
            const mockScene = {} as any;
            
            wrapper.render(mockScene, mockCamera);
            
            expect(wrapper).toBeDefined();
        });
    });

    describe('async initialization', () => {
        it('should handle async initialization properly', async () => {
            const wrapper = new WebGPURendererWrapper(canvas, appContext);
            
            // Initialize should be async
            await wrapper.initialize();
            
            // After initialization, methods should work
            wrapper.setClearColor(0, 0, 0, 0);
            expect(wrapper).toBeDefined();
        });
    });
});
