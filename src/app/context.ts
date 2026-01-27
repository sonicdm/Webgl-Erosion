import { SimulationStateHolder } from './state/SimulationStateHolder';
import { TerrainStateHolder } from './state/TerrainStateHolder';
import { ClientStateHolder } from './state/ClientStateHolder';

/**
 * Application context that holds all state holders and services.
 * This is the single source of truth for the application state.
 */
export interface AppContext {
    simulationState: SimulationStateHolder;
    terrainState: TerrainStateHolder;
    clientState: ClientStateHolder;
}
