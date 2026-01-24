/**
 * Utility to process imported heightmap images and convert them to the format expected by the terrain system
 */

import type { SimulationParams } from '../../app/dto/SimulationParams';

/**
 * Processes an imported heightmap image and extracts height data
 * @param img - The imported image
 * @param simres - Simulation resolution (target size)
 * @param controls - Controls object containing TerrainHeight and TerrainScale
 * @returns Float32Array containing height data in RGBA format (height in R channel, multiplied by simres)
 */
export function processHeightmapImage(
  img: HTMLImageElement | HTMLCanvasElement,
  simres: number,
  controls: SimulationParams | any
): Float32Array {
  // Get height scaling from controls (respects TerrainHeight and TerrainScale settings)
  const terrainHeight = controls.TerrainHeight || 2.0;
  const terrainScale = controls.TerrainScale || 3.2;
  const maxHeight = terrainHeight * 120.0;
  
  console.log('[Heightmap Import] Processing with TerrainHeight:', terrainHeight, 'TerrainScale:', terrainScale, 'maxHeight:', maxHeight);
  // Create a canvas to resize the image to simres x simres
  const canvas = document.createElement('canvas');
  canvas.width = simres;
  canvas.height = simres;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context for heightmap processing');
  }
  
  // Draw and resize the image to match simres
  ctx.drawImage(img, 0, 0, simres, simres);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, simres, simres);
  
  // Create height data array (RGBA format, height in R channel)
  const heightData = new Float32Array(simres * simres * 4);
  
    // Convert grayscale to height values
    // THREE.Terrain processes heightmaps by:
    // 1. Reading pixel values (0-255)
    // 2. Normalizing to 0-1 (gray value)
    // 3. Scaling by (maxHeight - minHeight) and adding minHeight
    // 4. Outputting world heights directly
    // 
    // We need to match this behavior and then convert to stored format (height * simres)
    const minHeight = 0.0; // THREE.Terrain default minHeight
    
    for (let i = 0; i < simres * simres; i++) {
      const r = imageData.data[i * 4];
      const g = imageData.data[i * 4 + 1];
      const b = imageData.data[i * 4 + 2];
      
      // Convert RGB to grayscale (standard luminance formula)
      const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
      
      // THREE.Terrain scaling: gray * (maxHeight - minHeight) + minHeight
      // This gives world height directly (same as THREE.Terrain outputs)
      const worldHeight = gray * (maxHeight - minHeight) + minHeight;
      
      // Convert to stored format: worldHeight * simres
      // Shader does: storedValue / simres = worldHeight
      const storedHeight = worldHeight * simres;
      
      heightData[i * 4 + 0] = storedHeight; // R: terrain height (in stored format)
      heightData[i * 4 + 1] = 0.0;          // G: water volume (start with no water)
      heightData[i * 4 + 2] = 0.0;          // B: rock material
      heightData[i * 4 + 3] = 1.0;          // A: alpha
    }
  
  return heightData;
}
