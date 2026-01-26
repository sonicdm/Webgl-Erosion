/**
 * Factory for ThreeJSSimulationRuntime.
 * Builds ThreeJSRuntime, CameraService, TerrainSync, HeightmapBridge, StepRunner
 * and wires them into ThreeJSSimulationRuntime (all deps injected, no globals for construction).
 */
import { ThreeJSRuntime } from '../../three/main';
import { ThreeJSSimulationRuntime } from '../../three/integration';
import { CameraService } from '../../three/camera/CameraService';
import { TerrainSync } from '../../three/terrain/TerrainSync';
import { HeightmapBridge } from '../../three/io/HeightmapBridge';
import { StepRunner } from '../../three/simulation/StepRunner';
import type { AppContext } from '../bootstrap';

export function createThreeRuntime(
  appContext: AppContext,
  canvas: HTMLCanvasElement,
  glContext: WebGL2RenderingContext
): ThreeJSSimulationRuntime {
  const runtime = new ThreeJSRuntime(canvas, glContext);
  const simres = appContext.simulationState.simres;
  const cameraService = new CameraService(runtime);
  const terrainSync = new TerrainSync(runtime, simres, null, null, appContext.terrainStateHolder);
  const heightmapBridge = new HeightmapBridge(simres);
  const stepRunner = new StepRunner(null, simres);

  return new ThreeJSSimulationRuntime({
    runtime,
    cameraService,
    terrainSync,
    heightmapBridge,
    stepRunner,
    sourceArrays: appContext.sourceArrays,
    simres,
    terrainStateHolder: appContext.terrainStateHolder,
  });
}
