import * as DAT from 'dat-gui';
import { AppContext } from '../bootstrap';
import { setupGUI, GUIControllers, Controls } from '../../gui/gui-setup';
import { ThreeJSSimulationRuntime } from '../../three/integration';

/**
 * GUI setup result
 */
export interface GUISetupResult {
  gui: DAT.GUI;
  controllers: GUIControllers;
}

/**
 * Sets up the GUI with dependency injection from AppContext
 * Wraps the existing setupGUI() from gui/gui-setup.ts
 * 
 * @param appContext - Application context from bootstrap
 * @param controls - Controls object (temporary - will be replaced with SimulationParams in future)
 * @param threeRuntime - Optional Three.js runtime for dependency injection
 * @returns GUI instance and controllers
 */
export function setupAppGUI(
  appContext: AppContext,
  controls: Controls,
  threeRuntime?: ThreeJSSimulationRuntime
): GUISetupResult {
  // Use existing setupGUI with dependency injection
  // The threeRuntime is passed through for terrain regeneration callbacks
  const guiResult = setupGUI(controls, { threeRuntime });

  // Wire GUI controllers to update state holders (gradual migration)
  // For now, controllers update the controls object directly
  // In the future, we'll update SimulationParams and BrushInput DTOs instead

  // Example: Wire SimulationResolution changes to update simulationState
  // This is a placeholder for future migration - for now, controls object is still used
  // const resolutionController = guiResult.controllers.brushSizeController; // Example

  return guiResult;
}
