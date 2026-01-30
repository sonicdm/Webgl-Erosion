/**
 * WebGPU capability check service.
 * Checks for WebGPU support and provides fallback messaging.
 * Result is cached so main and WebGPURendererWrapper can both call without double adapter/device request.
 */

export interface WebGPUCapability {
    supported: boolean;
    adapter?: GPUAdapter;
    device?: GPUDevice;
    fallbackReason?: string;
}

let capabilityPromise: Promise<WebGPUCapability> | null = null;

/**
 * Clears the cached capability result. For testing only; allows tests to re-run the check with different mocks.
 */
export function clearWebGPUCapabilityCache(): void {
    capabilityPromise = null;
}

/**
 * Checks if WebGPU is supported in the current environment.
 * Cached: repeated calls return the same promise (avoids double requestAdapter/requestDevice).
 *
 * @returns Promise resolving to WebGPUCapability object with support status
 */
export function checkWebGPUSupport(): Promise<WebGPUCapability> {
    if (capabilityPromise !== null) {
        return capabilityPromise;
    }

    capabilityPromise = runWebGPUCapabilityCheck();
    return capabilityPromise;
}

async function runWebGPUCapabilityCheck(): Promise<WebGPUCapability> {
    if (!navigator.gpu) {
        return {
            supported: false,
            fallbackReason: 'WebGPU is not available. navigator.gpu is undefined. Your browser may not support WebGPU, or it may be disabled.'
        };
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return {
                supported: false,
                fallbackReason: 'WebGPU adapter could not be requested. No compatible GPU adapter found.'
            };
        }

        try {
            // Use default limits so device creation succeeds on more adapters.
            // Large readback (e.g. simres 4096) is handled by chunked staging in webgpu-terrain-readback.
            const device = await adapter.requestDevice({
                requiredFeatures: ['float32-filterable'],
            });

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
