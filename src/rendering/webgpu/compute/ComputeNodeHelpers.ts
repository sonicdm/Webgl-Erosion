/**
 * Helper utilities for creating WebGPU compute shader bindings and resources.
 */

/**
 * Create a storage texture binding entry for a compute shader.
 * Storage textures can be read from and written to in compute shaders.
 */
export function createStorageTextureBinding(
    texture: GPUTexture,
    binding: number,
    access: 'write-only' | 'read-write' = 'write-only'
): GPUBindGroupEntry {
    return {
        binding: binding,
        resource: texture.createView(),
    };
}

/**
 * Create a sampled texture binding entry for a compute shader.
 * Sampled textures are read-only in compute shaders.
 */
export function createSampledTextureBinding(
    texture: GPUTexture,
    binding: number
): GPUBindGroupEntry {
    return {
        binding: binding,
        resource: texture.createView(),
    };
}

/**
 * Create a uniform buffer binding entry.
 */
export function createUniformBufferBinding(
    buffer: GPUBuffer,
    binding: number
): GPUBindGroupEntry {
    return {
        binding: binding,
        resource: {
            buffer: buffer,
        },
    };
}

/**
 * Create a bind group layout entry for a storage texture.
 */
export function createStorageTextureLayoutEntry(
    binding: number,
    access: 'write-only' | 'read-write' = 'write-only'
): GPUBindGroupLayoutEntry {
    return {
        binding: binding,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
            format: 'rgba32float',
            access: access,
        },
    };
}

/**
 * Create a bind group layout entry for a sampled texture.
 * Uses 'unfilterable-float' since rgba32float textures cannot be filtered.
 */
export function createSampledTextureLayoutEntry(
    binding: number
): GPUBindGroupLayoutEntry {
    return {
        binding: binding,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
            sampleType: 'unfilterable-float',
        },
    };
}

/**
 * Create a bind group layout entry for a uniform buffer.
 */
export function createUniformBufferLayoutEntry(
    binding: number
): GPUBindGroupLayoutEntry {
    return {
        binding: binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'uniform',
        },
    };
}

/**
 * Create a uniform buffer with data.
 * @param device - GPU device
 * @param data - Data to store in the buffer (will be converted to ArrayBuffer)
 * @param label - Optional label for debugging
 */
export function createUniformBuffer(
    device: GPUDevice,
    data: ArrayBufferView | number[],
    label?: string
): GPUBuffer {
    // Check if data is an ArrayBufferView (TypedArray or DataView)
    // ArrayBufferView is a TypeScript type, not a runtime value, so we check for the properties
    const isArrayBufferView = data && typeof data === 'object' && 'buffer' in data && 'byteOffset' in data && 'byteLength' in data;
    let bufferData: ArrayBuffer;
    if (isArrayBufferView) {
        const view = data as ArrayBufferView;
        bufferData = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    } else {
        bufferData = new Float32Array(data as number[]).buffer;
    }

    // WebGPU uniform buffers must be padded to a multiple of 16 bytes
    const alignedSize = Math.ceil(bufferData.byteLength / 16) * 16;
    const buffer = device.createBuffer({
        label: label,
        size: alignedSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffer, 0, bufferData);
    return buffer;
}

/**
 * Update a uniform buffer with new data.
 */
export function updateUniformBuffer(
    device: GPUDevice,
    buffer: GPUBuffer,
    data: ArrayBufferView | number[],
    offset: number = 0
): void {
    const bufferData = ArrayBuffer.isView(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : new Float32Array(data).buffer;

    device.queue.writeBuffer(buffer, offset, bufferData);
}

/**
 * Calculate workgroup size for a 2D texture.
 * @param textureSize - Size of the texture (width/height, assumed square)
 * @param workgroupSize - Size of each workgroup (default: 8x8)
 * @returns [workgroupCountX, workgroupCountY]
 */
export function calculateWorkgroupCount2D(
    textureSize: number,
    workgroupSize: number = 8
): [number, number] {
    const workgroupCountX = Math.ceil(textureSize / workgroupSize);
    const workgroupCountY = Math.ceil(textureSize / workgroupSize);
    return [workgroupCountX, workgroupCountY];
}
