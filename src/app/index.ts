/**
 * Barrel export for app module
 * Provides convenient access to bootstrap, DTOs, and state holders
 */

// Bootstrap
export { createApp, type AppContext, type BootstrapConfig } from './bootstrap';
export type {
  IGLContext,
  IRendererFactory,
  IBrushState,
  ITerrainState,
  IHeightmapIO,
  IRaycaster,
  ISimulationStepRunner,
  ICameraService,
} from './bootstrap';

// DTOs
export { createSimulationParams, type SimulationParams } from './dto/SimulationParams';
export { createBrushInput, type BrushInput } from './dto/BrushInput';
export { SourceArrays } from './dto/SourceArrays';
export type { RenderTargetsSnapshot } from './dto/RenderTargetsSnapshot';

// State Holders
export { SimulationStateHolder } from './state/SimulationStateHolder';
export { TerrainStateHolder } from './state/TerrainStateHolder';
export { ClientStateHolder } from './state/ClientStateHolder';

// Context
export { createAppContextSetup, type AppContextSetup } from './context';

// UI
export { setupAppGUI, type GUISetupResult } from './ui/gui';

// Input
export { calculateBrushInput, normalizeMousePosition, updateBrushInputFromControls } from './input/brush-controls';

// Runtime
export { createThreeRunner, type ThreeRunnerResult } from './runtime/three-runner';
export { createLegacyRunner, type LegacyRunnerResult, type LegacyRunnerConfig } from './runtime/legacy-runner';
export { initializeLegacyPipeline, type LegacyInitializationResult } from './runtime/legacy-initialization';

// Controls
export { createControls, type CreateControlsOptions } from './controls/controls-factory';
