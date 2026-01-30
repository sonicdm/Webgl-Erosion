import { SimulationStateHolder } from '../app/state/SimulationStateHolder';
import { LegacyTexturePool } from '../simulation/LegacyTexturePool';
import { heightmapCache } from '../terrain/HeightmapCache';

export interface Controls {
    TerrainHeight: number;
    TerrainBaseType?: number;
}

export interface HeightmapLoaderCallbacks {
    /**
     * Update the active terrain base type (e.g., via GUI controller).
     * Implementations should also keep controls in sync if needed.
     */
    setTerrainBaseType?: (value: number) => void;
}

// Heightmap base type ID - matches GUI option
export const HEIGHTMAP_BASE_TYPE_ID = 100;

// Reusable buffer for heightmap conversion (reused across loads to avoid allocations)
let reusableHeightDataBuffer: Float32Array | null = null;
let reusableCanvas: HTMLCanvasElement | null = null;
let reusableCanvasContext: CanvasRenderingContext2D | null = null;

export function createHeightMapLoader(
    gl_context: WebGL2RenderingContext,
    simulationState: SimulationStateHolder,
    texturePool: LegacyTexturePool,
    controls: Controls,
    callbacks?: HeightmapLoaderCallbacks
) {
    function loadHeightMap() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const img = new Image();
                img.onload = () => {
                    let cachedOriginal = false;
                    // First, cache the original image at its native resolution for later re-use
                    const cacheCanvas = document.createElement('canvas');
                    cacheCanvas.width = img.width;
                    cacheCanvas.height = img.height;
                    const cacheCtx = cacheCanvas.getContext('2d');
                    if (cacheCtx) {
                        cacheCtx.drawImage(img, 0, 0);
                        try {
                            const cacheImageData = cacheCtx.getImageData(0, 0, img.width, img.height);
                            // Store in heightmap cache at original resolution
                            heightmapCache.storeFromImage(cacheImageData.data, img.width, img.height, file.name);
                            cachedOriginal = true;
                        } catch (error) {
                            console.warn('[Heightmap] Failed to cache original image data, will fallback to scaled data', error);
                        }
                    }

                    // Reuse canvas if available, create new one only if needed or size changed
                    if (!reusableCanvas || reusableCanvas.width !== simulationState.simres || reusableCanvas.height !== simulationState.simres) {
                        reusableCanvas = document.createElement('canvas');
                        reusableCanvas.width = simulationState.simres;
                        reusableCanvas.height = simulationState.simres;
                        reusableCanvasContext = reusableCanvas.getContext('2d');
                    }
                    const ctx = reusableCanvasContext;
                    if (!ctx) return;

                    // Draw and scale the image to match simulation resolution
                    ctx.drawImage(img, 0, 0, simulationState.simres, simulationState.simres);
                    const imageData = ctx.getImageData(0, 0, simulationState.simres, simulationState.simres);

                    // If we couldn't cache the original, cache the scaled data instead
                    if (!cachedOriginal) {
                        heightmapCache.storeFromImage(imageData.data, simulationState.simres, simulationState.simres, file.name);
                    }

                    // Reuse or create heightData buffer (only reallocate if size changed)
                    const bufferSize = simulationState.simres * simulationState.simres * 4;
                    if (!reusableHeightDataBuffer || reusableHeightDataBuffer.length !== bufferSize) {
                        reusableHeightDataBuffer = new Float32Array(bufferSize);
                    }
                    const heightData = reusableHeightDataBuffer;

                    // Convert image data to height map texture
                    // Use grayscale (red channel) as height, scale to terrain height range
                    const maxHeight = controls.TerrainHeight * 120.0;

                    for (let i = 0; i < simulationState.simres * simulationState.simres; i++) {
                        const r = imageData.data[i * 4];
                        const g = imageData.data[i * 4 + 1];
                        const b = imageData.data[i * 4 + 2];
                        // Convert RGB to grayscale and normalize to 0-1, then scale
                        const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
                        const height = gray * maxHeight;

                        heightData[i * 4] = height;      // R: terrain height
                        heightData[i * 4 + 1] = 0.0;   // G: water (start with no water)
                        heightData[i * 4 + 2] = 0.0;   // B: rock material
                        heightData[i * 4 + 3] = 1.0;   // A: alpha
                    }

                    // Create or update height map texture
                    let heightmap_tex = texturePool.getHeightMapTexture();
                    if (!heightmap_tex) {
                        heightmap_tex = gl_context.createTexture();
                    }

                    gl_context.bindTexture(gl_context.TEXTURE_2D, heightmap_tex);
                    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F,
                        simulationState.simres, simulationState.simres, 0, gl_context.RGBA, gl_context.FLOAT, heightData);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
                    gl_context.bindTexture(gl_context.TEXTURE_2D, null);

                    // Store the height map texture
                    texturePool.setHeightMapTexture(heightmap_tex);

                    // Auto-switch to imported heightmap mode if available
                    if (callbacks?.setTerrainBaseType) {
                        callbacks.setTerrainBaseType(HEIGHTMAP_BASE_TYPE_ID);
                        console.log('[Heightmap] Auto-switched to imported heightmap mode via callback');
                    } else if (controls.TerrainBaseType !== undefined) {
                        controls.TerrainBaseType = HEIGHTMAP_BASE_TYPE_ID;
                        console.log('[Heightmap] Auto-switched to imported heightmap mode');
                    }

                    // Mark terrain as dirty to regenerate
                    simulationState.setTerrainGeometryDirty(true);
                    console.log('Height map loaded and cached successfully');
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function clearHeightMap() {
        const heightmap_tex = texturePool.getHeightMapTexture();
        if (heightmap_tex) {
            gl_context.deleteTexture(heightmap_tex);
            texturePool.setHeightMapTexture(null);
        }
        // Also clear the heightmap cache
        heightmapCache.clear();
        simulationState.setTerrainGeometryDirty(true);
        console.log('Height map and cache cleared, using procedural generation');
    }

    function exportHeightMapPNG() {
        if (!texturePool.read_terrain_tex || !texturePool.frame_buffer) {
            console.error('Terrain texture or framebuffer not available for export');
            return;
        }

        // Get current resolution from simulation state
        const currentRes = simulationState.simres;

        // Create temporary buffer for reading heightmap data
        const bufferSize = currentRes * currentRes * 4;
        const heightData = new Float32Array(bufferSize);

        // Read terrain texture from GPU
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.read_terrain_tex, 0);
        gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
        gl_context.readPixels(0, 0, currentRes, currentRes, gl_context.RGBA, gl_context.FLOAT, heightData);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

        // Convert height data to grayscale image
        // Height is stored as: heightValue / simres in shader
        // For export, we need to reverse: convert back to 0-255 range
        // Import uses: gray * maxHeight where maxHeight = TerrainHeight * 120.0
        // So export: height / maxHeight * 255
        const maxHeight = controls.TerrainHeight * 120.0;

        // Reuse canvas if available, create new one only if needed or size changed
        if (!reusableCanvas || reusableCanvas.width !== currentRes || reusableCanvas.height !== currentRes) {
            reusableCanvas = document.createElement('canvas');
            reusableCanvas.width = currentRes;
            reusableCanvas.height = currentRes;
            reusableCanvasContext = reusableCanvas.getContext('2d');
        }
        const ctx = reusableCanvasContext;
        if (!ctx) {
            console.error('Failed to get canvas context for export');
            return;
        }

        // Create ImageData and fill with grayscale height values
        const imageData = ctx.createImageData(currentRes, currentRes);
        for (let i = 0; i < currentRes * currentRes; i++) {
            const height = heightData[i * 4]; // R channel contains height (raw value, not divided by simres)
            // Convert height back to grayscale (0-255)
            // Import: gray (0-1) = pixel / 255.0, then height = gray * maxHeight
            // Texture stores: height directly (gray * maxHeight)
            // Export: gray = height / maxHeight, then pixel = gray * 255
            const gray = Math.max(0, Math.min(255, Math.round((height / maxHeight) * 255)));
            
            imageData.data[i * 4] = gray;     // R
            imageData.data[i * 4 + 1] = gray; // G
            imageData.data[i * 4 + 2] = gray; // B
            imageData.data[i * 4 + 3] = 255;  // A
        }

        // Draw to canvas
        ctx.putImageData(imageData, 0, 0);

        // Convert canvas to blob and trigger download
        reusableCanvas.toBlob((blob) => {
            if (!blob) {
                console.error('Failed to create PNG blob');
                return;
            }

            // Generate filename with timestamp
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') + '_' +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0') +
                now.getSeconds().toString().padStart(2, '0');
            const filename = `heightmap_${timestamp}.png`;

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`Height map exported as ${filename}`);
        }, 'image/png');
    }

    function exportHeightMapRaw() {
        if (!texturePool.read_terrain_tex || !texturePool.frame_buffer) {
            console.error('Terrain texture or framebuffer not available for export');
            return;
        }

        // Get current resolution from simulation state
        const currentRes = simulationState.simres;

        // Create temporary buffer for reading heightmap data
        const bufferSize = currentRes * currentRes * 4;
        const heightData = new Float32Array(bufferSize);

        // Read terrain texture from GPU
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, texturePool.frame_buffer);
        gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, texturePool.read_terrain_tex, 0);
        gl_context.readBuffer(gl_context.COLOR_ATTACHMENT0);
        gl_context.readPixels(0, 0, currentRes, currentRes, gl_context.RGBA, gl_context.FLOAT, heightData);
        gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);

        // Create binary blob with Float32Array data
        const blob = new Blob([heightData.buffer], { type: 'application/octet-stream' });

        // Generate filename with timestamp
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') + '_' +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
        const filename = `heightmap_${timestamp}.raw`;

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`Height map exported as ${filename} (raw binary, ${currentRes}x${currentRes} RGBA Float32)`);
    }

    function exportHeightMap() {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100001;
            font-family: 'Segoe UI', Arial, sans-serif;
        `;

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: rgba(30, 30, 30, 0.95);
            border: 2px solid #555;
            border-radius: 8px;
            padding: 30px;
            min-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;

        // Title
        const title = document.createElement('div');
        title.textContent = 'Export Height Map';
        title.style.cssText = `
            color: #fff;
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 20px;
            text-align: center;
        `;
        modalContent.appendChild(title);

        // Description
        const description = document.createElement('div');
        description.textContent = 'Choose export format:';
        description.style.cssText = `
            color: #aaa;
            font-size: 14px;
            margin-bottom: 20px;
            text-align: center;
        `;
        modalContent.appendChild(description);

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // PNG button
        const pngButton = document.createElement('button');
        pngButton.textContent = 'PNG Image (Grayscale)';
        pngButton.style.cssText = `
            background: #4A90E2;
            border: none;
            color: #fff;
            padding: 12px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        `;
        pngButton.onmouseover = () => pngButton.style.background = '#5BA3F5';
        pngButton.onmouseout = () => pngButton.style.background = '#4A90E2';
        pngButton.onclick = () => {
            exportHeightMapPNG();
            document.body.removeChild(modal);
        };
        buttonContainer.appendChild(pngButton);

        // Raw button
        const rawButton = document.createElement('button');
        rawButton.textContent = 'Raw Binary (Float32)';
        rawButton.style.cssText = `
            background: #4A90E2;
            border: none;
            color: #fff;
            padding: 12px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        `;
        rawButton.onmouseover = () => rawButton.style.background = '#5BA3F5';
        rawButton.onmouseout = () => rawButton.style.background = '#4A90E2';
        rawButton.onclick = () => {
            exportHeightMapRaw();
            document.body.removeChild(modal);
        };
        buttonContainer.appendChild(rawButton);

        // Cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            background: transparent;
            border: 1px solid #555;
            color: #ccc;
            padding: 12px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 8px;
            transition: background 0.2s;
        `;
        cancelButton.onmouseover = () => cancelButton.style.background = 'rgba(255, 255, 255, 0.1)';
        cancelButton.onmouseout = () => cancelButton.style.background = 'transparent';
        cancelButton.onclick = () => {
            document.body.removeChild(modal);
        };
        buttonContainer.appendChild(cancelButton);

        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        // Close on Escape key
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        document.body.appendChild(modal);
    }

    return {
        loadHeightMap,
        clearHeightMap,
        exportHeightMapPNG,
        exportHeightMapRaw,
        exportHeightMap
    };
}

