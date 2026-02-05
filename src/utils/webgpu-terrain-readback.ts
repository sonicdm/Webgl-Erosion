/**
 * WebGPU terrain readback service.
 * Reads heightmap data from WebGPU textures to CPU buffers for raycasting and BVH updates.
 * Uses chunked readback when full staging buffer would exceed device.limits.maxBufferSize
 * (e.g. simres 4096 needs ~268MB; many adapters have 256MB limit).
 */

const BYTES_PER_PIXEL = 16; // RGBA32F: 4 floats * 4 bytes

/** 256-byte row alignment required by WebGPU for copyTextureToBuffer. */
const ROW_ALIGNMENT = 256;

/**
 * Compute bytes per row (aligned) and max staging size within device limit.
 */
function getReadbackLayout(
    textureSize: number,
    maxBufferSize: number
): { bytesPerRow: number; bytesPerRowAligned: number; rowsPerChunk: number; totalRows: number } {
    const bytesPerRow = textureSize * BYTES_PER_PIXEL;
    const bytesPerRowAligned = Math.ceil(bytesPerRow / ROW_ALIGNMENT) * ROW_ALIGNMENT;
    const totalRows = textureSize;
    const stagingBytesPerChunk = Math.min(
        textureSize * bytesPerRowAligned,
        Math.floor(maxBufferSize / ROW_ALIGNMENT) * ROW_ALIGNMENT
    );
    const rowsPerChunk = Math.max(1, Math.floor(stagingBytesPerChunk / bytesPerRowAligned));
    return { bytesPerRow, bytesPerRowAligned, rowsPerChunk, totalRows };
}

/**
 * Read heightmap data from a WebGPU texture to a CPU buffer.
 * Uses chunked copy when a single staging buffer would exceed device.limits.maxBufferSize,
 * so simres up to 4096 works on adapters with 256MB buffer limit.
 *
 * @param device - GPU device
 * @param texture - Source texture (rgba32float format)
 * @param buffer - Destination Float32Array buffer (must be pre-allocated: simres * simres * 4)
 */
export async function readHeightmapFromTexture(
    device: GPUDevice,
    texture: GPUTexture,
    buffer: Float32Array
): Promise<void> {
    const textureSize = texture.width;
    const maxBufferSize = device.limits.maxBufferSize;

    const { bytesPerRow, bytesPerRowAligned, rowsPerChunk, totalRows } = getReadbackLayout(
        textureSize,
        maxBufferSize
    );

    const chunks =
        rowsPerChunk >= totalRows
            ? [{ rowStart: 0, rowCount: totalRows }]
            : (() => {
                  const list: { rowStart: number; rowCount: number }[] = [];
                  for (let rowStart = 0; rowStart < totalRows; rowStart += rowsPerChunk) {
                      const rowCount = Math.min(rowsPerChunk, totalRows - rowStart);
                      list.push({ rowStart, rowCount });
                  }
                  return list;
              })();

    for (const { rowStart, rowCount } of chunks) {
        const stagingSize = rowCount * bytesPerRowAligned;
        const stagingBuffer = device.createBuffer({
            size: stagingSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            { texture, mipLevel: 0, origin: [0, rowStart, 0] },
            {
                buffer: stagingBuffer,
                bytesPerRow: bytesPerRowAligned,
                rowsPerImage: rowCount,
            },
            { width: textureSize, height: rowCount, depthOrArrayLayers: 1 }
        );
        device.queue.submit([commandEncoder.finish()]);

        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const mapped = stagingBuffer.getMappedRange();
        const sourceData = new Float32Array(mapped);

        const floatsPerRow = textureSize * 4;
        const srcFloatsPerRow = bytesPerRowAligned / 4;
        for (let r = 0; r < rowCount; r++) {
            const srcStart = r * srcFloatsPerRow;
            const dstStart = (rowStart + r) * floatsPerRow;
            buffer.set(sourceData.subarray(srcStart, srcStart + floatsPerRow), dstStart);
        }

        stagingBuffer.unmap();
        stagingBuffer.destroy();
    }
}

/**
 * Read heightmap data; same as readHeightmapFromTexture but fire-and-forget (no await).
 * Prefer readHeightmapFromTexture when you need to wait for completion.
 */
export function readHeightmapFromTextureSync(
    device: GPUDevice,
    texture: GPUTexture,
    buffer: Float32Array
): void {
    readHeightmapFromTexture(device, texture, buffer).catch((err) => {
        console.error('[webgpu-terrain-readback] Sync readback failed:', err);
    });
}
