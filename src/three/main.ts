import * as THREE from 'three';
import { simres } from '../simulation/simulation-state'; // @deprecated - not used, will be removed

// Ensure THREE is available globally for THREE.Terrain and other UMD modules
if (typeof window !== 'undefined') {
  (window as any).THREE = THREE;
} else if (typeof global !== 'undefined') {
  (global as any).THREE = THREE;
}

/**
 * Three.js runtime entry point for the erosion simulation.
 * This provides an alternative to the WebGL pipeline for rendering and simulation.
 */

export interface ThreeJSRuntimeConfig {
  useThreeJS: boolean;
  canvas: HTMLCanvasElement;
  glContext: WebGL2RenderingContext;
}

/**
 * Validates required WebGL2 extensions for Three.js port
 */
export function validateWebGL2Extensions(gl: WebGL2RenderingContext): { valid: boolean; missing: string[] } {
  const requiredExtensions = [
    'EXT_color_buffer_float',
    'OES_texture_float_linear',
  ];

  const missing: string[] = [];
  
  for (const extName of requiredExtensions) {
    const ext = gl.getExtension(extName);
    if (!ext) {
      missing.push(extName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Creates a Three.js WebGL renderer with WebGL2 context
 */
export function createThreeJSRenderer(
  canvas: HTMLCanvasElement,
  glContext: WebGL2RenderingContext
): THREE.WebGLRenderer {
  // Validate extensions first
  const extensionCheck = validateWebGL2Extensions(glContext);
  if (!extensionCheck.valid) {
    const errorMsg = `Required WebGL2 extensions missing: ${extensionCheck.missing.join(', ')}\n` +
      `This port requires WebGL2 with float texture support. Please use a compatible browser.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Create Three.js renderer with existing WebGL2 context
  // Typescript typing issue: Three.js expects WebGLRenderingContext, but WebGL2RenderingContext extends it.
  // We can cast glContext to WebGLRenderingContext to satisfy the type checker.
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    context: glContext as unknown as WebGLRenderingContext,
    powerPreference: 'high-performance',
    antialias: false, // Disable for performance
    preserveDrawingBuffer: false,
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false; // We'll control clearing per pass

  console.log('Three.js renderer initialized with WebGL2 context');
  console.log('Extensions validated:', extensionCheck.missing.length === 0);

  return renderer;
}

/**
 * Creates a fullscreen quad geometry for GPGPU passes
 * Uses custom vs_Pos attribute to match quad-vert.glsl
 */
export function createFullscreenQuadGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Fullscreen quad in clip space: [-1, -1] to [1, 1]
  // Each vertex has 4 components (vec4) for vs_Pos
  const positions = new Float32Array([
    -1, -1, 0, 1,  // Bottom-left
     1, -1, 0, 1,  // Bottom-right
    -1,  1, 0, 1,  // Top-left
     1,  1, 0, 1,  // Top-right
  ]);

  const indices = new Uint16Array([
    0, 1, 2,
    2, 1, 3,
  ]);

  geometry.setAttribute('vs_Pos', new THREE.BufferAttribute(positions, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return geometry;
}

/**
 * Creates an orthographic camera for GPGPU passes
 */
export function createGPGPUCamera(): THREE.OrthographicCamera {
  // Orthographic camera for fullscreen quad rendering
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return camera;
}

/**
 * Creates a basic terrain scene for testing
 */
export function createBasicTerrainScene(): { scene: THREE.Scene; mesh: THREE.Mesh } {
  const scene = new THREE.Scene();
  
  // Create a simple plane mesh for terrain
  const geometry = new THREE.PlaneGeometry(2, 2, 100, 100);
  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    wireframe: false,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  scene.add(mesh);

  // Add basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  return { scene, mesh };
}

/**
 * Main Three.js runtime class
 */
export class ThreeJSRuntime {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private gpgpuCamera: THREE.OrthographicCamera;
  private fullscreenQuad: THREE.BufferGeometry;
  private animationId: number | null = null;
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement, glContext: WebGL2RenderingContext) {
    this.renderer = createThreeJSRenderer(canvas, glContext);
    this.gpgpuCamera = createGPGPUCamera();
    this.fullscreenQuad = createFullscreenQuadGeometry();

    // Create empty scene - terrain will be added by SimulationRuntime
    this.scene = new THREE.Scene();
    
    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Create perspective camera for scene rendering
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 2);
    this.camera.lookAt(0, 0, 0);

    // Handle window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Starts the animation loop
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick();
  }

  /**
   * Stops the animation loop
   */
  public stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Animation loop
   */
  private tick = (): void => {
    if (!this.isRunning) return;

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    this.animationId = requestAnimationFrame(this.tick);
  };

  /**
   * Handles window resize
   */
  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Gets the Three.js renderer
   */
  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Gets the GPGPU camera (orthographic)
   */
  public getGPGPUCamera(): THREE.OrthographicCamera {
    return this.gpgpuCamera;
  }

  /**
   * Gets the fullscreen quad geometry
   */
  public getFullscreenQuad(): THREE.BufferGeometry {
    return this.fullscreenQuad;
  }

  /**
   * Gets the main scene
   */
  public getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Gets the perspective camera
   */
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Replace the render camera (used by integration layer to supply its own).
   */
  public setCamera(cam: THREE.Camera): void {
    this.camera = cam as THREE.PerspectiveCamera;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stop();
    this.fullscreenQuad.dispose();
    this.renderer.dispose();
  }
}

