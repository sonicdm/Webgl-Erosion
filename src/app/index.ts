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
