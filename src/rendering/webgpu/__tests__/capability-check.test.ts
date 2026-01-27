import { checkWebGPUSupport, WebGPUCapability } from '../capability-check';

describe('WebGPU Capability Check', () => {
    describe('checkWebGPUSupport', () => {
        it('should return capability object with correct structure', async () => {
            const result = await checkWebGPUSupport();
            
            expect(result).toBeDefined();
            expect(typeof result.supported).toBe('boolean');
            if (result.supported) {
                expect(result.adapter).toBeDefined();
                expect(result.device).toBeDefined();
            } else {
                expect(result.fallbackReason).toBeDefined();
                expect(typeof result.fallbackReason).toBe('string');
            }
        });

        it('should return supported: false when navigator.gpu is undefined', async () => {
            // Mock navigator.gpu as undefined
            const originalGpu = (global as any).navigator?.gpu;
            if ((global as any).navigator) {
                delete (global as any).navigator.gpu;
            }

            const result = await checkWebGPUSupport();
            
            expect(result.supported).toBe(false);
            expect(result.fallbackReason).toBeDefined();
            expect(result.adapter).toBeUndefined();
            expect(result.device).toBeUndefined();

            // Restore original
            if ((global as any).navigator && originalGpu !== undefined) {
                (global as any).navigator.gpu = originalGpu;
            }
        });

        it('should handle adapter request failures gracefully', async () => {
            // Mock navigator.gpu.requestAdapter to reject
            const originalRequestAdapter = (global as any).navigator?.gpu?.requestAdapter;
            if ((global as any).navigator?.gpu) {
                (global as any).navigator.gpu.requestAdapter = jest.fn().mockRejectedValue(new Error('Adapter request failed'));
            }

            const result = await checkWebGPUSupport();
            
            expect(result.supported).toBe(false);
            expect(result.fallbackReason).toBeDefined();
            expect(result.fallbackReason).toContain('adapter');

            // Restore original
            if ((global as any).navigator?.gpu && originalRequestAdapter) {
                (global as any).navigator.gpu.requestAdapter = originalRequestAdapter;
            }
        });

        it('should handle device creation failures gracefully', async () => {
            // Mock adapter.requestDevice to reject
            const originalGpu = (global as any).navigator?.gpu;
            if ((global as any).navigator?.gpu) {
                const mockAdapter = {
                    requestDevice: jest.fn().mockRejectedValue(new Error('Device creation failed'))
                };
                (global as any).navigator.gpu.requestAdapter = jest.fn().mockResolvedValue(mockAdapter);
            }

            const result = await checkWebGPUSupport();
            
            expect(result.supported).toBe(false);
            expect(result.fallbackReason).toBeDefined();
            expect(result.fallbackReason).toContain('device');

            // Restore original
            if ((global as any).navigator && originalGpu) {
                (global as any).navigator.gpu = originalGpu;
            }
        });

        it('should provide meaningful fallbackReason when unsupported', async () => {
            // Mock navigator.gpu as undefined
            const originalGpu = (global as any).navigator?.gpu;
            if ((global as any).navigator) {
                delete (global as any).navigator.gpu;
            }

            const result = await checkWebGPUSupport();
            
            expect(result.supported).toBe(false);
            expect(result.fallbackReason).toBeDefined();
            expect(result.fallbackReason?.length).toBeGreaterThan(0);
            expect(result.fallbackReason).not.toBe('');

            // Restore original
            if ((global as any).navigator && originalGpu !== undefined) {
                (global as any).navigator.gpu = originalGpu;
            }
        });
    });
});
