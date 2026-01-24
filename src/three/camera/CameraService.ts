import { ThreeJSRuntime } from '../main';
import { ControlsConfig } from '../../controls-config';
import Camera from '../../Camera';
import * as THREE from 'three';
import { vec3 } from 'gl-matrix';

/**
 * Camera service for Three.js runtime
 * Manages camera setup, configuration, and updates
 */
export class CameraService {
  private camera: Camera | null = null;
  private controlsConfig: ControlsConfig | null = null;

  constructor(private runtime: ThreeJSRuntime) {}

  /**
   * Sets the camera configuration
   * Creates a Camera instance with the specified configuration
   */
  public setControlsConfig(controlsConfig: ControlsConfig, brushUsesLeftClick: boolean): void {
    this.controlsConfig = controlsConfig;
    
    // Create Camera instance - it creates its own Three.js camera internally
    // Use initial position that provides a good view of the terrain
    // Terrain will be scaled to ~300 units, so camera should be positioned accordingly
    // Position camera at a reasonable distance to see the terrain clearly
    // Camera constructor expects vec3 from gl-matrix, so create proper vec3 arrays
    const initialPos = vec3.fromValues(150, 200, 150); // Closer position for scaled terrain
    const initialTarget = vec3.fromValues(0, 0, 0); // Look at terrain center
    
    this.camera = new Camera(
      initialPos,
      initialTarget,
      controlsConfig.camera,
      brushUsesLeftClick
    );
    
    // Ensure OrbitControls target is set to look at terrain center
    if (this.camera.threeControls) {
      this.camera.threeControls.target.set(initialTarget[0], initialTarget[1], initialTarget[2]);
    }
    
    // Replace the runtime's camera with the Camera's Three.js camera
    // This way the Camera class owns the camera and controls it properly
    this.runtime.setCamera(this.camera.threeCamera);
    
    console.log('Custom Camera initialized with WASD movement support');
    console.log('Camera position:', this.camera.threeCamera.position);
    console.log('Camera target:', this.camera.threeControls?.target);
  }

  /**
   * Gets the Three.js camera for rendering (from Camera wrapper)
   */
  public getThreeJSCamera(): THREE.Camera {
    if (this.camera) {
      return this.camera.threeCamera;
    }
    return this.runtime.getCamera();
  }

  /**
   * Gets the custom Camera instance (for event handlers)
   */
  public getCamera(): Camera | null {
    return this.camera;
  }

  /**
   * Updates the camera with new configuration
   */
  public update(config: ControlsConfig['camera']): void {
    if (this.camera) {
      this.camera.update(config);
    }
  }
}
