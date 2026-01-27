/**
 * WebGPU capability check service.
 * Checks for WebGPU support and provides fallback messaging.
 */

export interface WebGPUCapability {
    supported: boolean;
    adapter?: GPUAdapter;
    device?: GPUDevice;
    fallbackReason?: string;
}

/**
 * Checks if WebGPU is supported in the current environment.
 * 
 * @returns Promise resolving to WebGPUCapability object with support status
 */
export async function checkWebGPUSupport(): Promise<WebGPUCapability> {
    // Check if navigator.gpu exists
    if (!navigator.gpu) {
        return {
            supported: false,
            fallbackReason: 'WebGPU is not available. navigator.gpu is undefined. Your browser may not support WebGPU, or it may be disabled.'
        };
    }

    try {
        // Request adapter
        const adapter = await navigator.gpu.requestAdapter();
        
        if (!adapter) {
            return {
                supported: false,
                fallbackReason: 'WebGPU adapter could not be requested. No compatible GPU adapter found.'
            };
        }

        try {
            // Request device
            const device = await adapter.requestDevice();
            
            return {
                supported: true,
                adapter: adapter,
                device: device
            };
        } catch (deviceError) {
            return {
                supported: false,
                adapter: adapter,
                fallbackReason: `WebGPU device creation failed: ${deviceError instanceof Error ? deviceError.message : 'Unknown error'}.`
            };
        }
    } catch (adapterError) {
        return {
            supported: false,
            fallbackReason: `WebGPU adapter request failed: ${adapterError instanceof Error ? adapterError.message : 'Unknown error'}.`
        };
    }
}
