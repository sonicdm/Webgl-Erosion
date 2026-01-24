import { CameraService } from '../CameraService';
import { ThreeJSRuntime } from '../../main';
import { ControlsConfig, defaultControlsConfig } from '../../../controls-config';
import Camera from '../../../Camera';
import * as THREE from 'three';
import { vec3 } from 'gl-matrix';

// Mock Camera first (before it's used in mocks)
jest.mock('../../../Camera', () => {
  // Import THREE inside the mock factory
  const THREE = require('three');
  const mockThreeCamera = new THREE.PerspectiveCamera();
  const mockControls = {
    target: new THREE.Vector3(0, 0, 0),
  };

  return jest.fn().mockImplementation(() => ({
    threeCamera: mockThreeCamera,
    threeControls: mockControls,
    update: jest.fn(),
  }));
});

// Mock ThreeJSRuntime
jest.mock('../../main', () => {
  const THREE = require('three');
  return {
    ThreeJSRuntime: jest.fn().mockImplementation(() => ({
      setCamera: jest.fn(),
      getCamera: jest.fn(() => new THREE.PerspectiveCamera()),
    })),
  };
});

describe('CameraService', () => {
  let mockRuntime: ThreeJSRuntime;
  let cameraService: CameraService;
  let mockCanvas: HTMLCanvasElement;
  let mockGLContext: WebGL2RenderingContext;

  beforeEach(() => {
    // Create mock canvas and GL context
    mockCanvas = document.createElement('canvas');
    mockGLContext = {
      getExtension: jest.fn(),
    } as any;

    mockRuntime = new ThreeJSRuntime(mockCanvas, mockGLContext);
    cameraService = new CameraService(mockRuntime);
  });

  describe('setControlsConfig', () => {
    it('should create camera with correct initial position and target', () => {
      const config: ControlsConfig = defaultControlsConfig;
      const brushUsesLeftClick = false;

      cameraService.setControlsConfig(config, brushUsesLeftClick);

      expect(Camera).toHaveBeenCalled();
      const callArgs = (Camera as jest.Mock).mock.calls[0];
      expect(callArgs).toHaveLength(4);
      expect(callArgs[2]).toBe(config.camera);
      expect(callArgs[3]).toBe(brushUsesLeftClick);
      // Check that first two args are arrays (vec3)
      expect(Array.isArray(callArgs[0]) || callArgs[0] instanceof Float32Array).toBe(true);
      expect(Array.isArray(callArgs[1]) || callArgs[1] instanceof Float32Array).toBe(true);
    });

    it('should set camera on runtime', () => {
      const config: ControlsConfig = defaultControlsConfig;
      cameraService.setControlsConfig(config, false);

      expect(mockRuntime.setCamera).toHaveBeenCalled();
    });

    it('should handle brushUsesLeftClick flag correctly', () => {
      const config: ControlsConfig = defaultControlsConfig;
      
      // Clear previous calls
      (Camera as jest.Mock).mockClear();
      
      cameraService.setControlsConfig(config, true);
      expect(Camera).toHaveBeenCalled();
      const callArgs = (Camera as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toBe(config.camera);
      expect(callArgs[3]).toBe(true);
    });
  });

  describe('getCamera', () => {
    it('should return null before setControlsConfig is called', () => {
      expect(cameraService.getCamera()).toBeNull();
    });

    it('should return Camera instance after setControlsConfig', () => {
      const config: ControlsConfig = defaultControlsConfig;
      cameraService.setControlsConfig(config, false);

      const camera = cameraService.getCamera();
      expect(camera).not.toBeNull();
      expect(camera).toHaveProperty('threeCamera');
      expect(camera).toHaveProperty('threeControls');
    });
  });

  describe('getThreeJSCamera', () => {
    it('should return runtime camera before setControlsConfig', () => {
      const threeCamera = cameraService.getThreeJSCamera();
      expect(threeCamera).toBeDefined();
    });

    it('should return Camera wrapper threeCamera after setControlsConfig', () => {
      const config: ControlsConfig = defaultControlsConfig;
      cameraService.setControlsConfig(config, false);

      const threeCamera = cameraService.getThreeJSCamera();
      expect(threeCamera).toBeDefined();
      expect(threeCamera).toHaveProperty('position');
      expect(threeCamera).toHaveProperty('matrix');
    });
  });

  describe('update', () => {
    it('should call camera update with config', () => {
      const config: ControlsConfig = defaultControlsConfig;
      cameraService.setControlsConfig(config, false);

      const camera = cameraService.getCamera();
      const updateSpy = jest.spyOn(camera!, 'update');

      cameraService.update(config.camera);

      expect(updateSpy).toHaveBeenCalledWith(config.camera);
    });

    it('should not throw if camera is null', () => {
      expect(() => {
        cameraService.update(defaultControlsConfig.camera);
      }).not.toThrow();
    });
  });

  describe('setControlsConfig edge cases', () => {
    it('should handle null threeControls gracefully', () => {
      // Mock Camera to return null threeControls
      const mockCameraInstance = {
        threeCamera: new THREE.PerspectiveCamera(),
        threeControls: null, // Null controls
        update: jest.fn(),
      };
      (Camera as jest.Mock).mockImplementation(() => mockCameraInstance);

      const config: ControlsConfig = defaultControlsConfig;
      
      expect(() => {
        cameraService.setControlsConfig(config, false);
      }).not.toThrow();
      
      expect(mockRuntime.setCamera).toHaveBeenCalled();
    });
  });
});
