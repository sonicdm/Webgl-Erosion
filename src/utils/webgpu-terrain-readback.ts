/**
 * WebGPU terrain readback service.
 * Reads heightmap data from WebGPU textures to CPU buffers for raycasting and BVH updates.
 */

/**
 * Read heightmap data from a WebGPU texture to a CPU buffer.
 * 
 * @param device - GPU device
 * @param texture - Source texture (rgba32float format)
 * @param buffer - Destination Float32Array buffer (must be pre-allocated: simres * simres * 4)
 * @returns Promise that resolves when readback is complete
 */
export async function readHeightmapFromTexture(
    device: GPUDevice,
    texture: GPUTexture,
    buffer: Float32Array
): Promise<void> {
    const textureSize = texture.width;
    const bytesPerPixel = 16; // 4 floats * 4 bytes each (RGBA32F)
    const bufferSize = textureSize * textureSize * bytesPerPixel;

    // Create a staging buffer to copy texture data
    const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Copy texture to staging buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        {
            texture: texture,
            mipLevel: 0,
            origin: [0, 0, 0],
        },
        {
            buffer: stagingBuffer,
            bytesPerRow: textureSize * bytesPerPixel,
            rowsPerImage: textureSize,
        },
        {
            width: textureSize,
            height: textureSize,
            depthOrArrayLayers: 1,
        }
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map and read the staging buffer
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const sourceData = new Float32Array(mappedRange);
    
    // Copy to destination buffer
    buffer.set(sourceData);
    
    stagingBuffer.unmap();
    stagingBuffer.destroy();
}

/**
 * Read heightmap data synchronously (for immediate use).
 * Note: This uses a blocking map, which may cause performance issues.
 * Prefer the async version when possible.
 */
export function readHeightmapFromTextureSync(
    device: GPUDevice,
    texture: GPUTexture,
    buffer: Float32Array
): void {
    const textureSize = texture.width;
    const bytesPerPixel = 16; // 4 floats * 4 bytes each (RGBA32F)
    const bufferSize = textureSize * textureSize * bytesPerPixel;

    // Create a staging buffer
    const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Copy texture to staging buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        {
            texture: texture,
            mipLevel: 0,
            origin: [0, 0, 0],
        },
        {
            buffer: stagingBuffer,
            bytesPerRow: textureSize * bytesPerPixel,
            rowsPerImage: textureSize,
        },
        {
            width: textureSize,
            height: textureSize,
            depthOrArrayLayers: 1,
        }
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map synchronously (blocking)
    stagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const mappedRange = stagingBuffer.getMappedRange();
        const sourceData = new Float32Array(mappedRange);
        buffer.set(sourceData);
        stagingBuffer.unmap();
        stagingBuffer.destroy();
    });
}
