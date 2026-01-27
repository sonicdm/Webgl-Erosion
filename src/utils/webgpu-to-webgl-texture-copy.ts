/**
 * Utility to copy data from WebGPU textures to WebGL textures.
 * Required when using WebGPU for simulation but WebGL2 for rendering.
 */

/**
 * Copy terrain texture data from WebGPU to WebGL.
 * Reads WebGPU texture to CPU, then uploads to WebGL texture.
 */
export async function copyWebGPUTerrainToWebGL(
    device: GPUDevice,
    webgpuTexture: GPUTexture,
    gl: WebGL2RenderingContext,
    webglTexture: WebGLTexture,
    simres: number
): Promise<void> {
    const bytesPerPixel = 16; // 4 floats * 4 bytes each (RGBA32F)
    const bufferSize = simres * simres * bytesPerPixel;

    // Create staging buffer
    const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Copy texture to staging buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        {
            texture: webgpuTexture,
            mipLevel: 0,
            origin: [0, 0, 0],
        },
        {
            buffer: stagingBuffer,
            bytesPerRow: simres * bytesPerPixel,
            rowsPerImage: simres,
        },
        {
            width: simres,
            height: simres,
            depthOrArrayLayers: 1,
        }
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map and read
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const data = new Float32Array(mappedRange);
    
    // Upload to WebGL texture
    gl.bindTexture(gl.TEXTURE_2D, webglTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, simres, simres, 0, gl.RGBA, gl.FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    stagingBuffer.unmap();
    stagingBuffer.destroy();
}
