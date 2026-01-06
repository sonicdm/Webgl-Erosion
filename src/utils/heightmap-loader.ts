import { getHeightMapTexture, setHeightMapTexture } from '../simulation/texture-management';
import { setTerrainGeometryDirty } from '../simulation/simulation-state';

export interface Controls {
    TerrainHeight: number;
}

export function createHeightMapLoader(
    gl_context: any,
    simres: number,
    controls: Controls
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
                    // Create a canvas to process the image
                    const canvas = document.createElement('canvas');
                    canvas.width = simres;
                    canvas.height = simres;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    // Draw and scale the image to match simulation resolution
                    ctx.drawImage(img, 0, 0, simres, simres);
                    const imageData = ctx.getImageData(0, 0, simres, simres);
                    
                    // Convert image data to height map texture
                    // Use grayscale (red channel) as height, scale to terrain height range
                    const heightData = new Float32Array(simres * simres * 4);
                    const maxHeight = controls.TerrainHeight * 120.0;
                    
                    for (let i = 0; i < simres * simres; i++) {
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
                    let heightmap_tex = getHeightMapTexture();
                    if (!heightmap_tex) {
                        heightmap_tex = gl_context.createTexture();
                    }
                    
                    gl_context.bindTexture(gl_context.TEXTURE_2D, heightmap_tex);
                    gl_context.texImage2D(gl_context.TEXTURE_2D, 0, gl_context.RGBA32F, 
                        simres, simres, 0, gl_context.RGBA, gl_context.FLOAT, heightData);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MIN_FILTER, gl_context.LINEAR);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_MAG_FILTER, gl_context.LINEAR);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_S, gl_context.CLAMP_TO_EDGE);
                    gl_context.texParameteri(gl_context.TEXTURE_2D, gl_context.TEXTURE_WRAP_T, gl_context.CLAMP_TO_EDGE);
                    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
                    
                    // Store the height map texture
                    setHeightMapTexture(heightmap_tex);
                    
                    // Mark terrain as dirty to regenerate
                    setTerrainGeometryDirty(true);
                    console.log('Height map loaded successfully');
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function clearHeightMap() {
        const heightmap_tex = getHeightMapTexture();
        if (heightmap_tex) {
            gl_context.deleteTexture(heightmap_tex);
            setHeightMapTexture(null);
            setTerrainGeometryDirty(true);
            console.log('Height map cleared, using procedural generation');
        }
    }

    return {
        loadHeightMap,
        clearHeightMap
    };
}

