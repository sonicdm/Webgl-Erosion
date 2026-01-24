import { HeightmapBridge } from '../HeightmapBridge';
import { SimulationPassManager } from '../../simulation/SimulationPassManager';
import * as THREE from 'three';

// Mock SimulationPassManager
jest.mock('../../simulation/SimulationPassManager', () => ({
  SimulationPassManager: jest.fn(),
}));

// No need to mock readCombinedHeight - HeightmapBridge uses passManager.getInitialHeightmap() directly

describe('HeightmapBridge', () => {
  let heightmapBridge: HeightmapBridge;
  let mockPassManager: SimulationPassManager;
  let mockSimres: number;

  beforeEach(() => {
    mockSimres = 1024;
    mockPassManager = {} as SimulationPassManager;
    heightmapBridge = new HeightmapBridge(mockSimres);
  });

  describe('readCombinedHeight', () => {
    it('should read combined height from pass manager initial heightmap', () => {
      const mockInitialHeightmap = new Float32Array(mockSimres * mockSimres * 4);
      // Fill with test data
      for (let i = 0; i < mockInitialHeightmap.length; i++) {
        mockInitialHeightmap[i] = Math.random() * 100;
      }
      
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => mockInitialHeightmap);
      heightmapBridge.setPassManager(mockPassManager);
      
      const heightData = heightmapBridge.readCombinedHeight();
      
      expect(heightData).toBeInstanceOf(Float32Array);
      expect(heightData.length).toBe(mockSimres * mockSimres * 4);
      expect(heightData).toEqual(mockInitialHeightmap);
    });

    it('should return zero buffer if pass manager is null', () => {
      const heightData = heightmapBridge.readCombinedHeight();
      
      expect(heightData).toBeInstanceOf(Float32Array);
      expect(heightData.length).toBe(mockSimres * mockSimres * 4);
      // Should be all zeros when pass manager is null
      expect(heightData.every(val => val === 0)).toBe(true);
    });

    it('should return zero buffer if initial heightmap is not available', () => {
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => null);
      heightmapBridge.setPassManager(mockPassManager);
      
      const heightData = heightmapBridge.readCombinedHeight();
      
      expect(heightData).toBeInstanceOf(Float32Array);
      expect(heightData.length).toBe(mockSimres * mockSimres * 4);
      expect(heightData.every(val => val === 0)).toBe(true);
    });
  });

  describe('getHeightMapCpuBuffer', () => {
    it('should return the CPU buffer', () => {
      const buffer = heightmapBridge.getHeightMapCpuBuffer();
      
      expect(buffer).toBeInstanceOf(Float32Array);
      expect(buffer.length).toBe(mockSimres * mockSimres * 4);
    });

    it('should return the same buffer instance', () => {
      const buffer1 = heightmapBridge.getHeightMapCpuBuffer();
      const buffer2 = heightmapBridge.getHeightMapCpuBuffer();
      
      expect(buffer1).toBe(buffer2);
    });
  });

  describe('initializeTextures', () => {
    it('should initialize textures with pass manager', async () => {
      const mockControls = {};
      const mockTimer = 0;
      const mockHeightmapSource = null;
      
      heightmapBridge.setPassManager(mockPassManager);
      
      // Mock passManager.initializeTextures and getInitialHeightmap
      (mockPassManager as any).initializeTextures = jest.fn().mockResolvedValue(undefined);
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => null);
      
      await heightmapBridge.initializeTextures(
        mockControls,
        mockTimer,
        mockHeightmapSource
      );
      
      expect((mockPassManager as any).initializeTextures).toHaveBeenCalledWith(
        mockControls,
        mockTimer,
        mockHeightmapSource,
        undefined
      );
    });

    it('should handle terrainRandom parameter', async () => {
      const mockControls = {};
      const mockTimer = 0;
      const mockHeightmapSource = null;
      const mockTerrainRandom = { seed: 123 };
      
      heightmapBridge.setPassManager(mockPassManager);
      
      // Mock passManager.initializeTextures and getInitialHeightmap
      (mockPassManager as any).initializeTextures = jest.fn().mockResolvedValue(undefined);
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => null);
      
      await heightmapBridge.initializeTextures(
        mockControls,
        mockTimer,
        mockHeightmapSource,
        mockTerrainRandom
      );
      
      expect((mockPassManager as any).initializeTextures).toHaveBeenCalledWith(
        mockControls,
        mockTimer,
        mockHeightmapSource,
        mockTerrainRandom
      );
    });

    it('should initialize CPU buffer from initial heightmap', async () => {
      const mockControls = {};
      const mockInitialHeightmap = new Float32Array(mockSimres * mockSimres * 4);
      for (let i = 0; i < mockInitialHeightmap.length; i++) {
        mockInitialHeightmap[i] = Math.random() * 100;
      }
      
      heightmapBridge.setPassManager(mockPassManager);
      
      // Mock passManager methods
      (mockPassManager as any).initializeTextures = jest.fn().mockResolvedValue(undefined);
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => mockInitialHeightmap);
      
      await heightmapBridge.initializeTextures(mockControls, 0, null);
      
      expect(heightmapBridge.isHeightMapInitialized()).toBe(true);
      const buffer = heightmapBridge.getHeightMapCpuBuffer();
      expect(buffer).toEqual(mockInitialHeightmap);
    });

    it('should throw error if pass manager is not set', async () => {
      const mockControls = {};
      
      await expect(
        heightmapBridge.initializeTextures(mockControls, 0, null)
      ).rejects.toThrow('Pass manager not set');
    });
  });

  describe('setPassManager', () => {
    it('should set the pass manager', () => {
      const newPassManager = {} as SimulationPassManager;
      (newPassManager as any).getInitialHeightmap = jest.fn(() => null);
      heightmapBridge.setPassManager(newPassManager);
      
      // Verify by checking that readCombinedHeight works
      const heightData = heightmapBridge.readCombinedHeight();
      expect(heightData).toBeDefined();
    });
  });

  describe('isHeightMapInitialized', () => {
    it('should return false initially', () => {
      expect(heightmapBridge.isHeightMapInitialized()).toBe(false);
    });

    it('should return true after initialization with heightmap', async () => {
      const mockControls = {};
      const mockInitialHeightmap = new Float32Array(mockSimres * mockSimres * 4);
      heightmapBridge.setPassManager(mockPassManager);
      
      // Mock passManager methods
      (mockPassManager as any).initializeTextures = jest.fn().mockResolvedValue(undefined);
      (mockPassManager as any).getInitialHeightmap = jest.fn(() => mockInitialHeightmap);
      
      await heightmapBridge.initializeTextures(mockControls, 0, null);
      
      expect(heightmapBridge.isHeightMapInitialized()).toBe(true);
    });
  });
});
