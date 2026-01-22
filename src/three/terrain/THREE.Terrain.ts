import * as THREE_NS from 'three';

// Minimal loader to seed globalThis.THREE and import the UMD build once.
let terrainLoaded = false;
let terrainLoadPromise: Promise<void> | null = null;

function seedGlobalThree(): any {
  const g: any = globalThis as any;
  const seeded: any = {
    ...THREE_NS,
    Math: {
      ...(THREE_NS as any).MathUtils,
      noise: () => 0,
    },
  };

  // Shim computeFaceNormals for BufferGeometry (THREE.Terrain calls it)
  if (seeded.BufferGeometry && !seeded.BufferGeometry.prototype.computeFaceNormals) {
    seeded.BufferGeometry.prototype.computeFaceNormals = function () {
      // BufferGeometry has no faces; use vertex normals instead
      this.computeVertexNormals();
      return this;
    };
  }

  g.THREE = seeded;
  return g.THREE;
}

function loadTerrainUMD(): Promise<void> {
  if (terrainLoaded) return Promise.resolve();
  if (typeof document === 'undefined') {
    throw new Error('THREE.Terrain requires a browser environment');
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-three-terrain-umd]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('THREE.Terrain failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = new URL('three.terrain.js/build/THREE.Terrain.js', import.meta.url).href;
    script.async = false; // ensure it runs immediately to patch global THREE
    script.dataset.threeTerrainUmd = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('THREE.Terrain failed to load'));
    document.head.appendChild(script);
  });
}

export async function ensureTerrainLibrary(): Promise<void> {
  if (terrainLoaded) return;
  if (!terrainLoadPromise) {
    terrainLoadPromise = (async () => {
      seedGlobalThree();
      await loadTerrainUMD();
      terrainLoaded = true;
    })();
  }
  await terrainLoadPromise;
}

// Utility helpers to access the patched THREE
function getTerrainThree(): any {
  const g: any = globalThis as any;
  if (!g.THREE) seedGlobalThree();
  return g.THREE;
}

export interface TerrainOptions {
  after?: (vertices: import('three').Vector3[], options: TerrainOptions) => void;
  easing?: (t: number) => number;
  frequency?: number;
  heightmap?: CanvasImageSource | HTMLImageElement | HTMLCanvasElement | ((x: number, y: number) => number) | any;
  material?: import('three').Material;
  maxHeight?: number;
  minHeight?: number;
  steps?: number;
  stretch?: boolean;
  turbulent?: boolean;
  xSegments?: number;
  xSize?: number;
  ySegments?: number;
  ySize?: number;
}

export function generateTerrain(options: TerrainOptions): import('three').Scene {
  const THREEGlobal = getTerrainThree();
  if (!THREEGlobal.Terrain) {
    throw new Error('THREE.Terrain is not available. Call ensureTerrainLibrary() first.');
  }
  return THREEGlobal.Terrain(options);
}

export function toHeightmap(
  positionArray: Float32Array | number[],
  options: { xSegments: number; ySegments: number }
): HTMLCanvasElement {
  const THREEGlobal = getTerrainThree();
  if (!THREEGlobal.Terrain || !THREEGlobal.Terrain.toHeightmap) {
    throw new Error('THREE.Terrain.toHeightmap is not available. Call ensureTerrainLibrary() first.');
  }
  return THREEGlobal.Terrain.toHeightmap(positionArray, options);
}

export function generateBlendedMaterial(textures: Array<{
  texture: import('three').Texture;
  levels?: number[];
  glsl?: string;
}>): import('three').Material {
  const THREEGlobal = getTerrainThree();
  if (!THREEGlobal.Terrain || !THREEGlobal.Terrain.generateBlendedMaterial) {
    throw new Error('THREE.Terrain.generateBlendedMaterial is not available. Call ensureTerrainLibrary() first.');
  }
  return THREEGlobal.Terrain.generateBlendedMaterial(textures);
}

export const TerrainMethods = {
  DiamondSquare: 'DiamondSquare',
  Perlin: 'Perlin',
  Simplex: 'Simplex',
  Worley: 'Worley',
  Cosine: 'Cosine',
  Fault: 'Fault',
  Feature: 'Feature',
  ParticleDeposition: 'ParticleDeposition',
  Value: 'Value',
  Weierstrass: 'Weierstrass',
  Brownian: 'Brownian',
} as const;

export function getTerrainMethod(methodName: string): any {
  const THREEGlobal = getTerrainThree();
  if (!THREEGlobal.Terrain) {
    throw new Error('THREE.Terrain is not available. Call ensureTerrainLibrary() first.');
  }
  return THREEGlobal.Terrain[methodName] || THREEGlobal.Terrain.DiamondSquare;
}

export const Easing = {
  Linear: 'Linear',
  EaseIn: 'EaseIn',
  EaseOut: 'EaseOut',
  EaseInOut: 'EaseInOut',
  InEaseOut: 'InEaseOut',
} as const;

export function getEasing(easingName: string): (t: number) => number {
  const THREEGlobal = getTerrainThree();
  if (!THREEGlobal.Terrain) {
    throw new Error('THREE.Terrain is not available. Call ensureTerrainLibrary() first.');
  }
  return THREEGlobal.Terrain[easingName] || THREEGlobal.Terrain.Linear;
}

