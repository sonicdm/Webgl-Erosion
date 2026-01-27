import { WebGPURenderer } from 'three/webgpu';
import { Scene, Camera as ThreeCamera } from 'three';
import { AppContext } from '../../app/context';
import { checkWebGPUSupport } from './capability-check';

/**
 * Wrapper for Three.js WebGPURenderer with DI-compatible interface.
 * Matches OpenGLRenderer interface for gradual migration.
 */
export class WebGPURendererWrapper {
    private renderer: WebGPURenderer | null = null;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private appContext: AppContext
    ) {
        // Constructor doesn't initialize - use initialize() method for async setup
    }

    /**
     * Initialize the WebGPU renderer asynchronously.
     * Must be called before using other methods.
     */
    async initialize(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            // Check WebGPU capability
            const capability = await checkWebGPUSupport();
            
            if (!capability.supported) {
                throw new Error(`WebGPU not supported: ${capability.fallbackReason || 'Unknown reason'}`);
            }

            // Create WebGPURenderer
            this.renderer = new WebGPURenderer({
                canvas: this.canvas,
                antialias: true
            });

            // Initialize the renderer (async operation)
            await this.renderer.init();
            
            this.initialized = true;
        })();

        return this.initPromise;
    }

    /**
     * Set the clear color for the renderer.
     * Matches OpenGLRenderer interface.
     */
    setClearColor(r: number, g: number, b: number, a: number): void {
        if (!this.initialized || !this.renderer) {
            throw new Error('WebGPURendererWrapper not initialized. Call initialize() first.');
        }
        this.renderer.setClearColor(r, g, b, a);
    }

    /**
     * Set the renderer size.
     * Matches OpenGLRenderer interface.
     */
    setSize(width: number, height: number): void {
        if (!this.initialized || !this.renderer) {
            throw new Error('WebGPURendererWrapper not initialized. Call initialize() first.');
        }
        this.renderer.setSize(width, height);
    }

    /**
     * Clear the render buffer.
     * Matches OpenGLRenderer interface.
     */
    clear(): void {
        if (!this.initialized || !this.renderer) {
            throw new Error('WebGPURendererWrapper not initialized. Call initialize() first.');
        }
        this.renderer.clear();
    }

    /**
     * Render a scene with a camera.
     * Note: This uses Three.js Scene and Camera, not the custom Camera class.
     * For migration, we'll need to adapt the custom Camera to Three.js Camera.
     */
    render(scene: Scene, camera: ThreeCamera): void {
        if (!this.initialized || !this.renderer) {
            throw new Error('WebGPURendererWrapper not initialized. Call initialize() first.');
        }
        this.renderer.render(scene, camera);
    }

    /**
     * Get the underlying Three.js WebGPURenderer instance.
     * For advanced usage.
     */
    getRenderer(): WebGPURenderer | null {
        return this.renderer;
    }

    /**
     * Dispose of the renderer and clean up resources.
     */
    dispose(): void {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
            this.initialized = false;
            this.initPromise = null;
        }
    }
}
