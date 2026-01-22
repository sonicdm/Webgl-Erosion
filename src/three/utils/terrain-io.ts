import * as THREE from 'three';
import { ensureTerrainLibrary, toHeightmap } from '../terrain/THREE.Terrain';

export interface TerrainIOControls {
  TerrainHeight: number;
  SimulationResolution?: number;
}

interface TerrainIOConfig {
  simres: number;
  controls: TerrainIOControls;
  getTerrainGeometry: () => THREE.BufferGeometry | null;
  onHeightmapChange: (heightmap: HTMLCanvasElement | HTMLImageElement | null) => Promise<void> | void;
}

export function createTerrainIO(config: TerrainIOConfig): {
  importHeightmap: () => void;
  clearHeightmap: () => void;
  exportHeightmap: () => void;
} {
  const { simres, controls, getTerrainGeometry, onHeightmapChange } = config;
  let reusableCanvas: HTMLCanvasElement | null = null;

  const getTimestamp = (): string => {
    const now = new Date();
    return now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') + '_' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
  };

  const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getGeometryInfo = (): { positions: Float32Array; gridSize: number } | null => {
    const geometry = getTerrainGeometry();
    if (!geometry) {
      console.warn('No terrain geometry available for heightmap export');
      return null;
    }

    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!positionAttribute) {
      console.warn('Terrain geometry missing position attribute');
      return null;
    }

    const vertexCount = positionAttribute.count;
    const gridSize = Math.round(Math.sqrt(vertexCount));
    if (gridSize * gridSize !== vertexCount) {
      console.warn('Terrain geometry is not a square grid, cannot export heightmap');
      return null;
    }

    return { positions: positionAttribute.array as Float32Array, gridSize };
  };

  const buildHeightmapPositions = (positions: Float32Array, heightScale: number): Float32Array => {
    const exportPositions = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      exportPositions[i] = positions[i];
      exportPositions[i + 1] = positions[i + 2];
      exportPositions[i + 2] = positions[i + 1] * heightScale;
    }
    return exportPositions;
  };

  const importHeightmap = (): void => {
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
          const applyHeightmap = async (): Promise<void> => {
            try {
              await ensureTerrainLibrary();
            } catch (error) {
              console.warn('THREE.Terrain failed to load, attempting fallback:', error);
            }
            await onHeightmapChange(img);
          };
          void applyHeightmap().catch((error) => {
            console.error('Failed to import heightmap:', error);
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const clearHeightmap = (): void => {
    const reset = async (): Promise<void> => {
      await onHeightmapChange(null);
    };
    void reset().catch((error) => {
      console.error('Failed to clear heightmap:', error);
    });
  };

  const exportHeightmapPNG = async (): Promise<void> => {
    try {
      await ensureTerrainLibrary();
      const info = getGeometryInfo();
      if (!info) return;

      const { positions, gridSize } = info;
      const heightScale = simres || gridSize;
      const exportPositions = buildHeightmapPositions(positions, heightScale);

      const options: {
        xSegments: number;
        ySegments: number;
        minHeight?: number;
        maxHeight?: number;
        heightmap?: HTMLCanvasElement;
      } = {
        xSegments: gridSize - 1,
        ySegments: gridSize - 1,
      };

      const maxHeight = typeof controls.TerrainHeight === 'number' ? controls.TerrainHeight * 120.0 : undefined;
      if (typeof maxHeight === 'number' && Number.isFinite(maxHeight)) {
        options.minHeight = 0;
        options.maxHeight = maxHeight;
      }
      if (reusableCanvas) {
        options.heightmap = reusableCanvas;
      }

      const canvas = toHeightmap(exportPositions, options);
      reusableCanvas = canvas;

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create PNG blob for heightmap export');
          return;
        }
        const filename = `heightmap_${getTimestamp()}.png`;
        downloadBlob(blob, filename);
        console.log(`Height map exported as ${filename}`);
      }, 'image/png');
    } catch (error) {
      console.error('Failed to export heightmap PNG:', error);
    }
  };

  const exportHeightmapRaw = (): void => {
    const info = getGeometryInfo();
    if (!info) return;

    const { positions, gridSize } = info;
    const heightScale = simres || gridSize;
    const heightData = new Float32Array(gridSize * gridSize * 4);

    for (let i = 0; i < gridSize * gridSize; i++) {
      const heightValue = positions[i * 3 + 1] * heightScale;
      heightData[i * 4] = heightValue;
      heightData[i * 4 + 1] = 0.0;
      heightData[i * 4 + 2] = 0.0;
      heightData[i * 4 + 3] = 1.0;
    }

    const blob = new Blob([heightData.buffer], { type: 'application/octet-stream' });
    const filename = `heightmap_${getTimestamp()}.raw`;
    downloadBlob(blob, filename);
    console.log(`Height map exported as ${filename} (raw binary, ${gridSize}x${gridSize} RGBA Float32)`);
  };

  const exportHeightmap = (): void => {
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

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid #555;
      border-radius: 8px;
      padding: 30px;
      min-width: 300px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;

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

    const description = document.createElement('div');
    description.textContent = 'Choose export format:';
    description.style.cssText = `
      color: #aaa;
      font-size: 14px;
      margin-bottom: 20px;
      text-align: center;
    `;
    modalContent.appendChild(description);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

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
      void exportHeightmapPNG();
      document.body.removeChild(modal);
    };
    buttonContainer.appendChild(pngButton);

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
      exportHeightmapRaw();
      document.body.removeChild(modal);
    };
    buttonContainer.appendChild(rawButton);

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

    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(modal);
  };

  return { importHeightmap, clearHeightmap, exportHeightmap };
}
