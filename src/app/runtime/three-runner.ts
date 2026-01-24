// @ts-ignore
import Stats from 'stats-js';
import { vec2 } from 'gl-matrix';
import { AppContext } from '../bootstrap';
import { ThreeJSSimulationRuntime } from '../../three/integration';
import { createTerrainIO } from '../../three/utils/terrain-io';
import { calculateBrushInput } from '../input/brush-controls';
import { createSimulationParams, SimulationParams } from '../dto/SimulationParams';
import { Controls } from '../../gui/gui-setup';

/**
 * Three.js runner result
 */
export interface ThreeRunnerResult {
  start(): void;
  stop(): void;
  dispose(): void;
}

/**
 * Creates a Three.js runtime runner
 * Extracts Three.js runtime initialization and animation loop from main.ts
 * 
 * @param appContext - Application context from bootstrap
 * @param threeRuntime - Three.js simulation runtime
 * @param controls - Controls object (temporary - will be replaced with SimulationParams in future)
 * @param canvas - Canvas element
 * @returns Runner with start, stop, and dispose methods
 */
export function createThreeRunner(
  appContext: AppContext,
  threeRuntime: ThreeJSSimulationRuntime,
  controls: Controls,
  canvas: HTMLCanvasElement
): ThreeRunnerResult {
  // Initialize stats for framerate display
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.top = 'auto';
  document.body.appendChild(stats.domElement);

  // Set up terrain IO
  const timer = 0;
  const terrainRandom = {
    seedOffset: [0, 0],
    duneDir: [1, 0],
    craterDensity: 1.0,
    canyonDepth: 1.0,
  };

  const { importHeightmap, clearHeightmap, exportHeightmap } = createTerrainIO({
    simres: appContext.simulationState.simres,
    controls: {
      ...controls,
      TerrainHeight: controls.TerrainHeight ?? 2.0, // Ensure TerrainHeight is set
    },
    getTerrainGeometry: () => threeRuntime.getTerrainGeometry(),
    onHeightmapChange: async (heightmap) => {
      await threeRuntime.initializeTextures(controls, timer, heightmap, terrainRandom);
      const heightData = threeRuntime.readCombinedHeight();
      threeRuntime.updateTerrainGeometry(heightData);
    },
  });

  controls['Import Height Map'] = importHeightmap;
  controls['Clear Height Map'] = clearHeightmap;
  controls['Export Height Map'] = exportHeightmap;

  let animationFrameId: number | null = null;
  let terrainInitialized = false;
  let frameCount = 0;
  let isRunning = false;
  let initializationPromise: Promise<void> | null = null;

  // Initialize terrain textures (async) - MUST complete before animate loop starts
  initializationPromise = (async () => {
    try {
      console.log('Starting texture initialization...');
      await threeRuntime.initializeTextures(controls, timer, null, terrainRandom);
      console.log('Texture initialization complete');

      // Wait a frame for GPU to finish processing
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Wait for terrain mesh to be available from initializeTextures
      // The terrain mesh is created by THREE.Terrain in initializeTextures
      // updateTerrainGeometry will set it up properly (replace with flat plane for VTF, add to scene)
      try {
        console.log('Waiting for terrain mesh to be available...');
        // Check if THREE.Terrain mesh is available from passManager
        const passManager = (threeRuntime as any).passManager;
        const terrainMesh = passManager?.getTerrainMesh?.();
        
        if (!terrainMesh) {
          console.warn('[Terrain Init] THREE.Terrain mesh not yet available, waiting...');
          // Wait a bit more for mesh to be created
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        
        // Now call updateTerrainGeometry - it should find the THREE.Terrain mesh
        const initialHeightData = threeRuntime.readCombinedHeight();
        console.log('Height data read, length:', initialHeightData.length);
        
        // updateTerrainGeometry will:
        // 1. Get terrain mesh from passManager (created by THREE.Terrain)
        // 2. Replace geometry with flat plane for VTF displacement
        // 3. Replace material with procedural material
        // 4. Add mesh to scene
        threeRuntime.updateTerrainGeometry(initialHeightData);
        terrainInitialized = true;
        console.log('Terrain geometry initialized successfully');
      } catch (error) {
        console.error('Failed to create initial terrain geometry:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        // Don't set terrainInitialized = true on error - let the animate loop retry
      }
    } catch (error) {
      console.error('Failed to initialize textures:', error);
    }
  })();

  const animate = () => {
    if (!isRunning) {
      return;
    }

    animationFrameId = requestAnimationFrame(animate);
    stats.begin();

    // Only run simulation and render if terrain is initialized
    // Wait for initialization promise to complete before trying to use terrain
    if (!terrainInitialized) {
      // Still initializing, skip this frame (initializationPromise will set terrainInitialized when done)
      stats.end();
      frameCount++;
      return;
      
      // Initialization failed or timed out - try fallback
      if (frameCount < 10) {
        try {
          // Check if terrain mesh is available (might have been created by initializeTextures)
          const passManager = (threeRuntime as any).passManager;
          const terrainMesh = passManager?.getTerrainMesh?.() || (threeRuntime as any).terrainMesh;
          
          if (terrainMesh) {
            // Terrain mesh exists, try to finalize it
            const heightData = threeRuntime.readCombinedHeight();
            threeRuntime.updateTerrainGeometry(heightData);
            terrainInitialized = true;
            console.log('Terrain mesh found and finalized');
          } else {
            // No mesh available yet, skip this frame
            stats.end();
            frameCount++;
            return;
          }
        } catch (error) {
          // Still initializing, skip this frame
          console.log(`Terrain initialization attempt ${frameCount + 1}/10 failed:`, error);
          stats.end();
          frameCount++;
          return;
        }
      } else {
        // Give up after 10 frames
        console.error('Failed to initialize terrain after 10 frames');
        stats.end();
        frameCount++;
        return;
      }
    }

    // Calculate brush input using brush-controls module
    const mouseX = appContext.clientState.lastX;
    const mouseY = appContext.clientState.lastY;
    const brushInput = calculateBrushInput(
      appContext,
      controls,
      mouseX,
      mouseY,
      canvas,
      threeRuntime
    );

    // Convert controls to SimulationParams
    const simParams: SimulationParams = createSimulationParams(
      controls,
      appContext.simulationState.simres
    );
    simParams.timer = frameCount;

    // Run simulation steps
    let timer = frameCount;
    for (let i = 0; i < controls.SimulationSpeed; i++) {
      appContext.simulationStepRunner.executeStep(simParams, timer, brushInput || undefined);
      timer++;
    }

    // Render the scene (only if terrain is initialized)
    if (terrainInitialized) {
      threeRuntime.render();
    }

    stats.end();
    frameCount++;
  };

  return {
    start() {
      if (!isRunning) {
        isRunning = true;
        // Start animation loop - it will wait for terrain initialization
        animate();
        console.log('Three.js runtime started successfully (terrain initialization in progress)');
      }
    },
    stop() {
      if (isRunning) {
        isRunning = false;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    },
    dispose() {
      this.stop();
      if (stats.domElement.parentNode) {
        stats.domElement.parentNode.removeChild(stats.domElement);
      }
      threeRuntime.dispose();
    },
  };
}
