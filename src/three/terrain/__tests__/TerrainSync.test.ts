import { TerrainSync } from '../TerrainSync';
import { ThreeJSRuntime } from '../../main';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Mock ThreeJSRuntime
jest.mock('../../main', () => {
  const THREE = require('three');
  return {
    ThreeJSRuntime: jest.fn().mockImplementation(() => ({
      getScene: jest.fn(() => new THREE.Scene()),
      getRenderer: jest.fn(() => ({
        getContext: jest.fn(() => ({} as WebGL2RenderingContext)),
      })),
    })),
  };
});

// Mock terrain geometry builder
jest.mock('../../../utils/terrain-geometry-builder', () => ({
  createTerrainGeometry: jest.fn((simres: number, heightData: Float32Array, scale: number) => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(simres * simres * 3);
    const indices = new Uint32Array((simres - 1) * (simres - 1) * 6);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    return geometry;
  }),
  updateTerrainGeometry: jest.fn((geometry: THREE.BufferGeometry, heightData: Float32Array, scale: number) => {
    // Mock update - just mark as updated
    geometry.attributes.position.needsUpdate = true;
  }),
}));

// Mock terrain procedural material
jest.mock('../../materials/terrain-procedural-material', () => ({
  createTerrainProceduralMaterial: jest.fn(() => {
    return new THREE.MeshStandardMaterial({ color: 0x888888 });
  }),
  updateTerrainProceduralMaterial: jest.fn(),
}));

// Mock BVH
jest.mock('three-mesh-bvh', () => ({
  MeshBVH: jest.fn().mockImplementation(() => ({})),
  SAH: 'SAH',
}));

// Mock simulation state
jest.mock('../../../simulation/simulation-state', () => ({
  setTerrainGeometry: jest.fn(),
  setTerrainBVH: jest.fn(),
  setTerrainBVHBuildInProgress: jest.fn(),
  terrainBVHBuildInProgress: false,
}));

describe('TerrainSync', () => {
  let mockRuntime: ThreeJSRuntime;
  let terrainSync: TerrainSync;
  let mockCanvas: HTMLCanvasElement;
  let mockGLContext: WebGL2RenderingContext;

  beforeEach(() => {
    mockCanvas = document.createElement('canvas');
    mockGLContext = {
      getExtension: jest.fn(),
    } as any;

    mockRuntime = new ThreeJSRuntime(mockCanvas, mockGLContext);
    terrainSync = new TerrainSync(mockRuntime, 1024, null, null);
  });

  describe('updateTerrainGeometry', () => {
    it('should create terrain geometry from height data', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      // Fill with some test data
      for (let i = 0; i < simres * simres; i++) {
        heightData[i * 4] = Math.random() * 100; // height
      }

      terrainSync.updateTerrainGeometry(heightData);

      const geometry = terrainSync.getTerrainGeometry();
      expect(geometry).not.toBeNull();
      expect(geometry).toHaveProperty('attributes');
      expect(geometry).toHaveProperty('index');
    });

    it('should return null geometry before updateTerrainGeometry is called', () => {
      expect(terrainSync.getTerrainGeometry()).toBeNull();
    });

    it('should create terrain mesh after geometry update', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      for (let i = 0; i < simres * simres; i++) {
        heightData[i * 4] = Math.random() * 100;
      }

      terrainSync.updateTerrainGeometry(heightData);

      const mesh = terrainSync.getTerrainMesh();
      expect(mesh).not.toBeNull();
      expect(mesh).toHaveProperty('geometry');
      expect(mesh).toHaveProperty('material');
    });
  });

  describe('getTerrainGeometry', () => {
    it('should return null initially', () => {
      expect(terrainSync.getTerrainGeometry()).toBeNull();
    });

    it('should return geometry after updateTerrainGeometry', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);

      const geometry = terrainSync.getTerrainGeometry();
      expect(geometry).not.toBeNull();
    });
  });

  describe('getTerrainMesh', () => {
    it('should return null initially', () => {
      expect(terrainSync.getTerrainMesh()).toBeNull();
    });

    it('should return mesh after updateTerrainGeometry', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);

      const mesh = terrainSync.getTerrainMesh();
      expect(mesh).not.toBeNull();
    });
  });

  describe('rebuildBVHIfNeeded', () => {
    it('should not throw if geometry is null', () => {
      expect(() => {
        terrainSync.rebuildBVHIfNeeded();
      }).not.toThrow();
    });

    it('should trigger BVH build when geometry exists', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);

      // Should not throw
      expect(() => {
        terrainSync.rebuildBVHIfNeeded();
      }).not.toThrow();
    });
  });

  describe('getCpuHeightmapTexture and setCpuHeightmapTexture', () => {
    it('should return null initially', () => {
      expect(terrainSync.getCpuHeightmapTexture()).toBeNull();
    });

    it('should set and get CPU heightmap texture', () => {
      const texture = new THREE.DataTexture(new Float32Array(4), 1, 1);
      terrainSync.setCpuHeightmapTexture(texture);
      expect(terrainSync.getCpuHeightmapTexture()).toBe(texture);
    });

    it('should allow setting texture to null', () => {
      const texture = new THREE.DataTexture(new Float32Array(4), 1, 1);
      terrainSync.setCpuHeightmapTexture(texture);
      terrainSync.setCpuHeightmapTexture(null);
      expect(terrainSync.getCpuHeightmapTexture()).toBeNull();
    });
  });

  describe('setPassManager', () => {
    it('should set the pass manager', () => {
      const mockPassManager = {
        getTerrainMesh: jest.fn(() => null),
      } as any;
      terrainSync.setPassManager(mockPassManager);
      // Verify by checking that updateTerrainGeometry can use it
      const heightData = new Float32Array(64 * 64 * 4);
      terrainSync.updateTerrainGeometry(heightData);
      // getTerrainMesh is called internally to check for THREE.Terrain mesh
      expect(mockPassManager.getTerrainMesh).toHaveBeenCalled();
    });
  });

  describe('setControls', () => {
    it('should set the controls', () => {
      const mockControls = { TerrainScale: 2.0 };
      terrainSync.setControls(mockControls);
      // Controls are used internally, so we can't directly verify
      // but we can ensure it doesn't throw
      expect(() => terrainSync.setControls(mockControls)).not.toThrow();
    });
  });

  describe('updateMaterialFromControls', () => {
    it('should not throw if no terrain mesh exists', () => {
      expect(() => {
        terrainSync.updateMaterialFromControls({});
      }).not.toThrow();
    });

    it('should not throw if controls is null', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);
      
      expect(() => {
        terrainSync.updateMaterialFromControls();
      }).not.toThrow();
    });

    it('should update material when terrain mesh exists', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);
      
      const controls = {
        SnowRange: 0.5,
        ForestRange: 0.3,
        TerrainPlatte: 2,
      };
      
      expect(() => {
        terrainSync.updateMaterialFromControls(controls);
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose resources without throwing', () => {
      const simres = 64;
      const heightData = new Float32Array(simres * simres * 4);
      terrainSync.updateTerrainGeometry(heightData);
      
      expect(() => {
        terrainSync.dispose();
      }).not.toThrow();
      
      expect(terrainSync.getTerrainMesh()).toBeNull();
      expect(terrainSync.getTerrainGeometry()).toBeNull();
    });

    it('should handle dispose when no resources exist', () => {
      expect(() => {
        terrainSync.dispose();
      }).not.toThrow();
    });
  });

  describe('updateTerrainGeometry error handling', () => {
    it('should handle null controls gracefully', () => {
      const terrainSyncWithNullControls = new TerrainSync(mockRuntime, 64, null, null);
      const heightData = new Float32Array(64 * 64 * 4);
      
      // Should not throw, but may log error
      expect(() => {
        terrainSyncWithNullControls.updateTerrainGeometry(heightData);
      }).not.toThrow();
    });
  });
});
