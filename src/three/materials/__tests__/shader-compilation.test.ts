/**
 * Shader Compilation Tests for Three.js Materials
 * 
 * Tests that all Three.js RawShaderMaterial instances compile without errors.
 * This catches shader syntax errors, version directive issues, and other compilation problems.
 */

import * as THREE from 'three';
import { createTerrainProceduralMaterial } from '../terrain-procedural-material';
import { createWaterScene } from '../../scenes/water-scene';
import { GpgpuPass } from '../../gpgpu/GpgpuPass';
import { shaderManifest } from '../../../shaders/manifest';
import { createFullscreenQuadGeometry } from '../../main';

describe('Three.js Shader Compilation', () => {
  let canvas: HTMLCanvasElement;
  let gl: WebGL2RenderingContext | null;
  let renderer: THREE.WebGLRenderer | null;

  beforeAll(() => {
    // Create a real canvas and WebGL2 context for testing
    canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    
    // Try to get WebGL2 context
    gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      console.warn('WebGL2 not available in test environment - shader compilation tests will be skipped');
      return;
    }

    // Create Three.js renderer with the WebGL2 context
    renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGLRenderingContext,
      antialias: false,
    });
  });

  afterAll(() => {
    if (renderer) {
      renderer.dispose();
    }
  });

  /**
   * Checks for WebGL errors and throws if any are found
   */
  function checkGLErrors(gl: WebGL2RenderingContext, context: string): void {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      const errorNames: Record<number, string> = {
        [gl.INVALID_ENUM]: 'INVALID_ENUM',
        [gl.INVALID_VALUE]: 'INVALID_VALUE',
        [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
        [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
        [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
        [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL',
      };
      throw new Error(`WebGL error in ${context}: ${errorNames[error] || `0x${error.toString(16)}`}`);
    }
  }

  /**
   * Attempts to compile a RawShaderMaterial by creating a mesh and rendering it
   */
  function testMaterialCompilation(
    material: THREE.RawShaderMaterial,
    materialName: string,
    gl: WebGL2RenderingContext
  ): void {
    // Create a simple geometry
    const geometry = new THREE.PlaneGeometry(1, 1);
    
    // Create a mesh with the material
    const mesh = new THREE.Mesh(geometry, material);
    const scene = new THREE.Scene();
    scene.add(mesh);
    
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Try to render - this will trigger shader compilation
    renderer!.render(scene, camera);
    
    // Check for WebGL errors (shader compilation errors show up here)
    checkGLErrors(gl, `rendering ${materialName}`);
    
    // Check Three.js program info for compilation errors
    const program = (material as any).program;
    if (program) {
      const glProgram = program.program;
      if (glProgram) {
        const linkStatus = gl.getProgramParameter(glProgram, gl.LINK_STATUS);
        if (!linkStatus) {
          const infoLog = gl.getProgramInfoLog(glProgram);
          throw new Error(`${materialName} shader program failed to link: ${infoLog}`);
        }
        
        // Check vertex shader compilation
        const vertShader = gl.getAttachedShaders(glProgram)?.[0];
        if (vertShader) {
          const vertStatus = gl.getShaderParameter(vertShader, gl.COMPILE_STATUS);
          if (!vertStatus) {
            const infoLog = gl.getShaderInfoLog(vertShader);
            throw new Error(`${materialName} vertex shader failed to compile: ${infoLog}`);
          }
        }
        
        // Check fragment shader compilation
        const fragShader = gl.getAttachedShaders(glProgram)?.[1];
        if (fragShader) {
          const fragStatus = gl.getShaderParameter(fragShader, gl.COMPILE_STATUS);
          if (!fragStatus) {
            const infoLog = gl.getShaderInfoLog(fragShader);
            throw new Error(`${materialName} fragment shader failed to compile: ${infoLog}`);
          }
        }
      }
    }
    
    // Cleanup
    geometry.dispose();
    material.dispose();
  }

  describe('Terrain Procedural Material', () => {
    it('should compile terrain procedural material shaders without errors', () => {
      if (!gl || !renderer) {
        return; // Skip if WebGL2 not available
      }

      const material = createTerrainProceduralMaterial({
        minHeight: 0,
        maxHeight: 100,
      });

      expect(() => {
        testMaterialCompilation(material, 'terrain-procedural', gl);
      }).not.toThrow();
    });
  });

  describe('GPGPU Pass Materials', () => {
    it('should compile quad vertex shader without errors', () => {
      if (!gl || !renderer) {
        return; // Skip if WebGL2 not available
      }

      const quadVertShader = shaderManifest.getShaderSource('quadVert');
      const quadFragShader = shaderManifest.getShaderSource('cleanFrag');
      const fullscreenQuad = createFullscreenQuadGeometry();

      const pass = new GpgpuPass(
        quadVertShader.vert!,
        quadFragShader.frag!,
        fullscreenQuad
      );

      const material = pass.getMaterial();
      
      expect(() => {
        testMaterialCompilation(material, 'quad-vert + clean-frag', gl);
      }).not.toThrow();
    });

    it('should compile water pass shaders without errors', () => {
      if (!gl || !renderer) {
        return; // Skip if WebGL2 not available
      }

      const quadVertShader = shaderManifest.getShaderSource('quadVert');
      const rainFragShader = shaderManifest.getShaderSource('rainFrag');
      const fullscreenQuad = createFullscreenQuadGeometry();

      const pass = new GpgpuPass(
        quadVertShader.vert!,
        rainFragShader.frag!,
        fullscreenQuad
      );

      const material = pass.getMaterial();
      
      expect(() => {
        testMaterialCompilation(material, 'rain-frag', gl);
      }).not.toThrow();
    });

    it('should compile flow pass shaders without errors', () => {
      if (!gl || !renderer) {
        return; // Skip if WebGL2 not available
      }

      const quadVertShader = shaderManifest.getShaderSource('quadVert');
      const flowFragShader = shaderManifest.getShaderSource('flowFrag');
      const fullscreenQuad = createFullscreenQuadGeometry();

      const pass = new GpgpuPass(
        quadVertShader.vert!,
        flowFragShader.frag!,
        fullscreenQuad
      );

      const material = pass.getMaterial();
      
      expect(() => {
        testMaterialCompilation(material, 'flow-frag', gl);
      }).not.toThrow();
    });
  });

  describe('Water Scene Material', () => {
    it('should compile water scene shaders without errors', () => {
      if (!gl || !renderer) {
        return; // Skip if WebGL2 not available
      }

      // Create dummy textures for water scene
      const dummyTexture = new THREE.DataTexture(
        new Float32Array([0, 0, 0, 1]),
        1, 1,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      dummyTexture.needsUpdate = true;

      const { mesh } = createWaterScene(256, dummyTexture, dummyTexture, dummyTexture);
      const material = mesh.material as THREE.RawShaderMaterial;

      expect(() => {
        testMaterialCompilation(material, 'water-scene', gl);
      }).not.toThrow();

      dummyTexture.dispose();
    });
  });

  describe('All Shader Sources', () => {
    it('should have #version 300 es directive in all shader files', () => {
      // This is a static check that would have caught the version directive issue
      const shaderKeys = shaderManifest.getAllShaderKeys();
      
      for (const key of shaderKeys) {
        const shader = shaderManifest.getShaderSource(key);
        
        if (shader.vert) {
          if (!shader.vert.trim().startsWith('#version 300 es')) {
            throw new Error(`Vertex shader ${key} is missing #version 300 es directive at the start`);
          }
        }
        
        if (shader.frag) {
          if (!shader.frag.trim().startsWith('#version 300 es')) {
            throw new Error(`Fragment shader ${key} is missing #version 300 es directive at the start`);
          }
        }
      }
    });
  });
});
