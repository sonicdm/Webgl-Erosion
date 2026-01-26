/**
 * Integration layer between Three.js runtime and existing WebGL pipeline.
 * This allows switching between runtimes and sharing state.
 */

import { ThreeJSRuntime } from './main';
import { SimulationPassManager } from './simulation/SimulationPassManager';
import * as THREE from 'three';
import { vec2, vec3, vec4 } from 'gl-matrix';
import Camera from '../Camera';
import { ControlsConfig } from '../controls-config';
import { CameraService } from './camera/CameraService';
import { TerrainSync } from './terrain/TerrainSync';
import { HeightmapBridge } from './io/HeightmapBridge';
import { StepRunner } from './simulation/StepRunner';
import { SimulationParams, createSimulationParams } from '../app/dto/SimulationParams';
import { BrushInput, createBrushInput } from '../app/dto/BrushInput';
import { SourceArrays } from '../app/dto/SourceArrays';
import { resolveTerrainRenderMode } from './utils/TerrainRenderMode';
import { HeightmapFreshness } from './utils/HeightmapFreshness';
import { rayCastBVH } from '../utils/bvh-raycast';
import { rayCast } from '../utils/raycast';
import type { TerrainStateHolder } from '../app/state/TerrainStateHolder';

export interface ThreeRuntimeDeps {
  runtime: ThreeJSRuntime;
  cameraService: CameraService;
  terrainSync: TerrainSync;
  heightmapBridge: HeightmapBridge;
  stepRunner: StepRunner;
  sourceArrays: SourceArrays;
  simres: number;
  terrainStateHolder: TerrainStateHolder;
}

/**
 * Main Three.js simulation runtime that integrates with the existing system.
 * All dependencies are injected via ThreeRuntimeDeps (no construction of services inside).
 */
export class ThreeJSSimulationRuntime {
  private runtime: ThreeJSRuntime;
  private passManager: SimulationPassManager | null = null;
  private simres: number;
  private renderDebugCounter = 0;
  private controls: SimulationParams | any = null;
  private cameraService: CameraService;
  private terrainSync: TerrainSync;
  private heightmapBridge: HeightmapBridge;
  private stepRunner: StepRunner;
  private sourceArrays: SourceArrays;
  private terrainStateHolder: TerrainStateHolder;
  private controlsConfig: ControlsConfig | null = null;
  private terrainRenderMode: 'cpu' | 'gpu_vtf' = 'gpu_vtf';
  private heightmapFreshness: HeightmapFreshness;

  constructor(deps: ThreeRuntimeDeps) {
    this.runtime = deps.runtime;
    this.simres = deps.simres;
    this.cameraService = deps.cameraService;
    this.terrainSync = deps.terrainSync;
    this.heightmapBridge = deps.heightmapBridge;
    this.stepRunner = deps.stepRunner;
    this.sourceArrays = deps.sourceArrays;
    this.terrainStateHolder = deps.terrainStateHolder;
    const gl = deps.runtime.getRenderer().getContext() as WebGL2RenderingContext;
    this.terrainRenderMode = resolveTerrainRenderMode(gl);
    this.heightmapFreshness = new HeightmapFreshness({ cadenceFrames: 1 });
    deps.terrainSync.setTerrainRenderMode(this.terrainRenderMode);
    deps.terrainSync.setHeightmapFreshness(this.heightmapFreshness);
  }
  
  /**
   * Sets the camera configuration (called from main.ts after controlsConfig is loaded)
   */
  public setControlsConfig(controlsConfig: ControlsConfig, brushUsesLeftClick: boolean): void {
    this.controlsConfig = controlsConfig;
    this.cameraService.setControlsConfig(controlsConfig, brushUsesLeftClick);
  }
  
  /**
   * Gets the Three.js camera for rendering (from Camera wrapper)
   */
  public getThreeJSCamera(): THREE.Camera {
    return this.cameraService.getThreeJSCamera();
  }
  
  /**
   * Gets the custom Camera instance (for event handlers)
   */
  public getCamera(): Camera | null {
    return this.cameraService.getCamera();
  }

  /**
   * Initializes the simulation pass manager
   */
  public initializeSimulation(): void {
    if (this.passManager) {
      this.passManager.dispose();
    }

    const renderer = this.runtime.getRenderer();
    const camera = this.runtime.getGPGPUCamera();
    const quad = this.runtime.getFullscreenQuad();

    this.passManager = new SimulationPassManager(
      renderer,
      camera,
      quad,
      this.simres
    );
    
    // Update services with pass manager
    this.terrainSync.setPassManager(this.passManager);
    this.heightmapBridge.setPassManager(this.passManager);
    this.stepRunner.setPassManager(this.passManager);
  }

  /**
   * Initializes terrain textures with procedural generation or heightmap
   */
  public async initializeTextures(
    controls: SimulationParams | any,
    timer: number,
    heightmapSource: CanvasImageSource | ((heightmap: Float32Array, options: any) => void) | null = null,
    terrainRandom?: any
  ): Promise<void> {
    if (!this.passManager) {
      this.initializeSimulation();
    }
    this.controls = controls; // Store controls for material updates
    this.terrainSync.setControls(controls); // Update terrain sync with controls
    await this.heightmapBridge.initializeTextures(controls, timer, heightmapSource, terrainRandom);
  }

  /**
   * Executes one simulation step
   * @param controls - Simulation controls/parameters (can be SimulationParams or legacy controls object)
   * @param timer - Time value for shaders (optional, defaults to 0)
   * @param brushState - Brush state (mouse world pos/dir, brush pos) (optional)
   */
  public executeSimulationStep(
    controls: SimulationParams | any,
    timer: number = 0,
    brushState?: {
      mouseWorldPos?: [number, number, number, number];
      mouseWorldDir?: [number, number, number];
      brushPos?: [number, number];
    }
  ): void {
    if (!this.passManager) {
      this.initializeSimulation();
    }
    
    // Convert controls to SimulationParams if needed (backward compatibility)
    const simParams: SimulationParams = controls.simres !== undefined 
      ? controls as SimulationParams 
      : createSimulationParams(controls, this.simres);
    
    // Convert brushState to BrushInput if provided
    let brushInput: BrushInput | null = null;
    if (brushState) {
      brushInput = {
        brushType: (controls as any).brushType ?? 2,
        brushSize: (controls as any).brushSize ?? 4,
        brushStrength: (controls as any).brushStrenth ?? (controls as any).brushStrength ?? 0.25,
        brushOperation: (controls as any).brushOperation ?? 0,
        brushPressed: (controls as any).brushPressed ?? 0,
        flattenTargetHeight: (controls as any).flattenTargetHeight ?? 0.0,
        slopeStartPos: (controls as any).slopeStartPos ? vec2.clone((controls as any).slopeStartPos) : vec2.fromValues(0.0, 0.0),
        slopeEndPos: (controls as any).slopeEndPos ? vec2.clone((controls as any).slopeEndPos) : vec2.fromValues(0.0, 0.0),
        slopeActive: (controls as any).slopeActive ?? 0,
        posTemp: brushState.brushPos ? vec2.fromValues(brushState.brushPos[0], brushState.brushPos[1]) : vec2.fromValues(0.0, 0.0),
        mouseWorldPos: brushState.mouseWorldPos ? vec4.fromValues(brushState.mouseWorldPos[0], brushState.mouseWorldPos[1], brushState.mouseWorldPos[2], brushState.mouseWorldPos[3]) : undefined,
        mouseWorldDir: brushState.mouseWorldDir ? vec3.fromValues(brushState.mouseWorldDir[0], brushState.mouseWorldDir[1], brushState.mouseWorldDir[2]) : undefined,
        brushPos: brushState.brushPos ? vec2.fromValues(brushState.brushPos[0], brushState.brushPos[1]) : undefined,
      };
    } else if ((controls as any).posTemp) {
      // Fallback: create BrushInput from controls.posTemp
      const posTemp = (controls as any).posTemp;
      if (Array.isArray(posTemp) && posTemp.length >= 2) {
        const [posTempX, posTempY] = posTemp;
        if (posTempX >= 0 && posTempX <= 1 && posTempY >= 0 && posTempY <= 1) {
          brushInput = createBrushInput(controls);
          brushInput.brushPos = vec2.fromValues(posTempX, posTempY);
        }
      }
    }
    
    // Delegate to StepRunner (sourceArrays injected via ctor)
    this.stepRunner.executeStep(simParams, brushInput, timer, this.sourceArrays);
  }

  /**
   * Gets the heightmap CPU buffer for brush system access
   * This buffer is kept in sync with GPU state via readCombinedHeight()
   */
  public getHeightMapCpuBuffer(): Float32Array {
    return this.heightmapBridge.getHeightMapCpuBuffer();
  }

  /**
   * Gets combined height for raycasting/geometry updates
   * Uses stored initial heightmap if available to avoid GPU readback issues
   * Updates heightMapCpuBuffer to keep it synchronized
   */
  public readCombinedHeight(): Float32Array {
    const out = this.heightmapBridge.readCombinedHeight();
    this.heightmapFreshness.recordReadback();
    return out;
  }

  /**
   * Refreshes HeightmapSource on TerrainSync from the single call site (passManager).
   */
  private refreshHeightmapSourceForTerrainSync(): void {
    this.terrainSync.setHeightmapSource(this.passManager?.getHeightmapSource() ?? null);
  }

  /**
   * Updates terrain geometry from height data
   * Uses THREE.Terrain mesh if available, otherwise creates geometry from heightmap
   */
  public updateTerrainGeometry(heightData: Float32Array): void {
    this.refreshHeightmapSourceForTerrainSync();
    this.terrainSync.updateTerrainGeometry(heightData);
  }
  /**
   * Updates material parameters from controls
   * Can be called with controls parameter or use stored this.controls
   */
  public updateMaterialFromControls(controls?: SimulationParams | any): void {
    if (controls) {
      this.controls = controls;
      this.terrainSync.setControls(controls);
    }
    this.terrainSync.updateMaterialFromControls(controls || this.controls);
  }

  /**
   * Calculates brush state (mouse world position, direction, and brush UV position) from mouse coordinates
   * Similar to the WebGL tick() function's raycasting logic
   * @param mouseX - Mouse X in client coordinates
   * @param mouseY - Mouse Y in client coordinates
   * @param canvas - Canvas element for coordinate conversion
   * @returns Brush state with mouse world pos/dir and brush UV position, or null if calculation fails
   */
  public calculateBrushState(mouseX: number, mouseY: number, canvas: HTMLCanvasElement): {
    mouseWorldPos: [number, number, number, number];
    mouseWorldDir: [number, number, number];
    brushPos: [number, number];
  } | null {
    if (!this.cameraService.getCamera()) {
      return null;
    }
    
    // Ensure heightmap buffer is initialized before raycasting
    if (!this.heightmapBridge.isHeightMapInitialized() && this.passManager) {
      const initialHeightmap = this.passManager.getInitialHeightmap();
      if (initialHeightmap) {
        this.heightmapBridge.setHeightMapInitialized(true);
        const buffer = this.heightmapBridge.getHeightMapCpuBuffer();
        const size = this.simres * this.simres;
        const tempBuffer = new Float32Array(size * 4);
        tempBuffer.set(initialHeightmap);
        buffer.set(tempBuffer);
        console.log('[Raycast] Heightmap buffer initialized, size:', size * 4);
      } else {
        console.warn('[Raycast] No initial heightmap available for raycasting');
      }
    }
    
    // Verify buffer has data (not all zeros)
    if (this.heightmapBridge.isHeightMapInitialized()) {
      const buffer = this.heightmapBridge.getHeightMapCpuBuffer();
      const hasData = buffer.some(val => val !== 0);
      if (!hasData) {
        console.warn('[Raycast] Heightmap buffer appears to be all zeros');
      }
    }
    
    // Update camera to ensure matrices are current
    if (this.controlsConfig) {
      this.cameraService.update(this.controlsConfig.camera);
    }
    
    // Use Three.js Raycaster for proper mouse-to-world unprojection
    const raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    
    // Convert mouse coordinates to normalized device coordinates (NDC) [-1, 1]
    const mouseNDC = new THREE.Vector2();
    mouseNDC.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((mouseY - rect.top) / rect.height) * 2 + 1; // Flip Y axis
    
    // Set raycaster to use the camera and mouse position
    const threeCamera = this.cameraService.getThreeJSCamera();
    raycaster.setFromCamera(mouseNDC, threeCamera);
    
    // Get ray origin and direction from raycaster
    const rayOrigin = new THREE.Vector3();
    rayOrigin.copy(raycaster.ray.origin);
    const rayDir = new THREE.Vector3();
    rayDir.copy(raycaster.ray.direction);
    
    // Convert to gl-matrix vec2 for raycast output
    const brushPos = vec2.fromValues(-10.0, -10.0); // Invalid default
    
    // Convert to gl-matrix vec3 for raycast functions
    const rayOriginVec3 = vec3.fromValues(rayOrigin.x, rayOrigin.y, rayOrigin.z);
    const rayDirVec3 = vec3.fromValues(rayDir.x, rayDir.y, rayDir.z);
    
    // Try BVH raycast first if available and enabled, otherwise use heightmap raycast
    const terrainBVH = this.terrainStateHolder.terrainBVH;
    const terrainGeometry = this.terrainStateHolder.terrainGeometry;
    if (this.controlsConfig?.raycast?.method === 'bvh' && terrainBVH && terrainGeometry) {
      const hit = rayCastBVH(
        rayOriginVec3,
        rayDirVec3,
        terrainBVH,
        terrainGeometry,
        brushPos
      );
      
      if (!hit) {
        // Fallback to heightmap raycast if BVH misses
        const heightmapPos = vec2.fromValues(-10.0, -10.0);
        rayCast(
          rayOriginVec3,
          rayDirVec3,
          this.simres,
          this.heightmapBridge.getHeightMapCpuBuffer(),
          heightmapPos
        );
        brushPos[0] = heightmapPos[0];
        brushPos[1] = heightmapPos[1];
      }
    } else {
      // Use heightmap raycast (fast, works with initial terrain data)
      // Note: heightMapCpuBuffer contains initial terrain data (GPU readback disabled for performance)
      // For terraforming to work with raycasting, we'd need CPU-side tracking or a copy pass
      rayCast(
        rayOriginVec3,
        rayDirVec3,
        this.simres,
        this.heightmapBridge.getHeightMapCpuBuffer(),
        brushPos
      );
    }
    
    // Return brush state (convert vec2 back to tuple)
    return {
      mouseWorldPos: [rayOrigin.x, rayOrigin.y, rayOrigin.z, 1.0],
      mouseWorldDir: [rayDir.x, rayDir.y, rayDir.z],
      brushPos: [brushPos[0], brushPos[1]] as [number, number]
    };
  }


  /**
   * Renders the scene
   */
  public render(): void {
    const renderer = this.runtime.getRenderer();
    const scene = this.runtime.getScene();
    const camera = this.runtime.getCamera();
    
    const terrainMesh = this.terrainSync.getTerrainMesh();
    if (!terrainMesh) {
      return;
    }
    
    // Update material uniforms with current simulation state (for real-time terraforming)
    // Delegate to TerrainSync
    this.terrainSync.updateMaterialUniforms(this.controls, this.passManager);
    
    // Throttled debug log for live sim heightmap path
    this.renderDebugCounter++;
    if (this.renderDebugCounter % 240 === 0 && (this.controls as any)?.UseSimHeightmap) {
      const material = terrainMesh.material as THREE.RawShaderMaterial | THREE.ShaderMaterial;
      if (material && material.uniforms) {
        const hm = material.uniforms.u_Heightmap?.value as THREE.Texture;
        console.log('[Render] Live sim heightmap stats:', {
          frame: this.renderDebugCounter,
          hmWidth: (hm as any)?.image?.width || (hm as any)?.source?.data?.width || 'N/A',
          hmHeight: (hm as any)?.image?.height || (hm as any)?.source?.data?.height || 'N/A',
          decodeScale: material.uniforms.u_HeightDecodeScale?.value,
          simres: this.simres
        });
      }
    }
    
    // Reset render state (GPGPU passes may have modified viewport/render target)
    renderer.setRenderTarget(null);
    renderer.state.reset();
    const rendererSize = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, rendererSize.x, rendererSize.y);
    
    // Clear and render
    renderer.setClearColor(0x87CEEB, 1.0);
    renderer.clear(true, true, true);
    
    try {
      // Update camera (handles OrbitControls + WASD movement)
      const cameraInstance = this.cameraService.getCamera();
      if (cameraInstance && this.controlsConfig) {
        const threeCamera = this.cameraService.getThreeJSCamera();
        const aspect = rendererSize.x / rendererSize.y;
        if (threeCamera instanceof THREE.PerspectiveCamera && threeCamera.aspect !== aspect) {
          threeCamera.aspect = aspect;
          threeCamera.updateProjectionMatrix();
        }
        this.cameraService.update(this.controlsConfig.camera);
        renderer.render(scene, threeCamera);
      } else {
        renderer.render(scene, camera);
      }
    } catch (error) {
      console.error('Error during render:', error);
    }
  }

  /**
   * Regenerates terrain with new parameters
   */
  public async regenerateTerrain(controls: SimulationParams | any, terrainRandom?: any): Promise<void> {
    console.log('[RegenerateTerrain] ===== START REGENERATE ====');
    console.log('[RegenerateTerrain] Parameters:', {
      terrainBaseType: controls.TerrainBaseType,
      terrainScale: controls.TerrainScale,
      terrainHeight: controls.TerrainHeight,
      terrainMask: controls.TerrainMask,
      terrainRandom: terrainRandom ? 'provided' : 'default'
    });
    
    if (!this.passManager) {
      console.error('[RegenerateTerrain] ERROR: Simulation not initialized');
      return;
    }

    try {
      // Store controls for use in material updates
      this.controls = controls;

      // Reinitialize textures with new parameters (this regenerates THREE.Terrain geometry)
      await this.passManager.initializeTextures(controls, 0, null, terrainRandom);
      console.log('[RegenerateTerrain] initializeTextures completed');

      // Wait a frame for GPU to finish processing
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Update terrain sync with new controls
      this.terrainSync.setControls(controls);
      
      // Refresh HeightmapSource from pass manager (single call site) then update geometry
      this.refreshHeightmapSourceForTerrainSync();
      const heightData = this.readCombinedHeight();
      this.terrainSync.updateTerrainGeometry(heightData);

      console.log('[RegenerateTerrain] Terrain regenerated successfully');
      console.log('[RegenerateTerrain] VTF setup complete - mesh ready for GPU displacement');
    } catch (error) {
      console.error('[RegenerateTerrain] ERROR: Failed to regenerate terrain:', error);
      throw error;
    }
  }

  /**
   * Updates simulation resolution
   */
  public setSimRes(simres: number): void {
    this.simres = simres;
    if (this.passManager) {
      this.passManager.setSimRes(simres);
    }
  }


  /**
   * Gets the Three.js renderer
   */
  public getRenderer(): THREE.WebGLRenderer {
    return this.runtime.getRenderer();
  }

  /**
   * Gets the main scene
   */
  public getScene(): THREE.Scene {
    return this.runtime.getScene();
  }


  /**
   * Gets the current terrain geometry for export utilities
   */
  public getTerrainGeometry(): THREE.BufferGeometry | null {
    return this.terrainSync.getTerrainGeometry();
  }

  /**
   * Gets the pass manager for debugging (e.g., checking render targets)
   */
  public getPassManager(): SimulationPassManager | null {
    return this.passManager;
  }

  /**
   * Builds BVH from terrain geometry for raycasting (async, non-blocking)
   * Stores the BVH in simulation-state for brush system access
   */
  /**
   * Rebuilds BVH when terrain geometry changes (for periodic updates during erosion)
   * Only rebuilds if geometry actually changed and BVH is not already building
   */
  public rebuildBVHIfNeeded(): void {
    this.terrainSync.rebuildBVHIfNeeded();
  }

  /**
   * Starts the animation loop
   */
  public start(): void {
    this.runtime.start();
  }

  /**
   * Stops the animation loop
   */
  public stop(): void {
    this.runtime.stop();
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    // Camera service will be disposed with the service
    if (this.passManager) {
      this.passManager.dispose();
    }
    this.runtime.dispose();
    this.terrainSync.dispose();
  }
}
