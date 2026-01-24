import { TerrainReadbackService } from '../TerrainReadbackService';
import { PingPongTarget } from '../../../gpgpu/PingPongTarget';
import * as THREE from 'three';

// Mock dependencies
jest.mock('../../../utils/terrain-heightmap-converter', () => ({
  extractHeightmapFromGeometry: jest.fn(),
  uploadHeightmap: jest.fn(),
}));

jest.mock('../../../terrain/THREE.Terrain', () => ({
  ensureTerrainLibrary: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../terrain/custom-terrain-algorithms', () => ({
  createCustomTerrainHeightmap: jest.fn(),
}));

describe('TerrainReadbackService', () => {
  let service: TerrainReadbackService;
  let mockRenderer: jest.Mocked<THREE.WebGLRenderer>;
  let mockTerrainPP: jest.Mocked<PingPongTarget>;
  const simres = 512;

  beforeEach(() => {
    // Create mock renderer
    mockRenderer = {
      capabilities: {
        isWebGL2: true,
      },
    } as any;

    // Create mock ping-pong target
    mockTerrainPP = {
      getWriteTarget: jest.fn().mockReturnValue({
        texture: {} as THREE.Texture,
      } as THREE.WebGLRenderTarget),
      swap: jest.fn(),
    } as any;

    service = new TerrainReadbackService(simres, mockRenderer, mockTerrainPP);
  });

  describe('constructor', () => {
    it('should initialize with simres, renderer, and terrainPP', () => {
      expect(service).toBeInstanceOf(TerrainReadbackService);
    });
  });

  describe('getTerrainMesh', () => {
    it('should return null when no terrain mesh has been generated', () => {
      expect(service.getTerrainMesh()).toBeNull();
    });
  });

  describe('getInitialHeightmap', () => {
    it('should return null when no heightmap has been generated', () => {
      expect(service.getInitialHeightmap()).toBeNull();
    });
  });

  describe('getHeightmapSource', () => {
    it('should return null when no heightmap source has been generated', () => {
      expect(service.getHeightmapSource()).toBeNull();
    });
  });

  describe('getStoredHeightRange', () => {
    it('should return zero range when no heightmap source exists', () => {
      const range = service.getStoredHeightRange();
      expect(range).toEqual({ min: 0, max: 0 });
    });
  });

  describe('setSimRes', () => {
    it('should update simulation resolution', () => {
      const newSimres = 1024;
      service.setSimRes(newSimres);
      // Note: We can't directly verify internal state, but we can check it doesn't throw
      expect(() => service.setSimRes(newSimres)).not.toThrow();
    });
  });

  describe('generateTerrain', () => {
    it('should throw error when THREE.Terrain is not available', async () => {
      // Mock window.THREE to be undefined
      const originalWindow = (global as any).window;
      (global as any).window = undefined;

      const controls = {
        TerrainBaseType: 'DiamondSquare',
        TerrainScale: 3.2,
        TerrainHeight: 2.0,
      };

      await expect(service.generateTerrain(controls, 0)).rejects.toThrow('THREE.Terrain not available');

      // Restore window
      (global as any).window = originalWindow;
    });

    // Note: Full integration test for generateTerrain would require mocking THREE.Terrain
    // which is complex. The method is primarily tested through integration tests.
  });
});
