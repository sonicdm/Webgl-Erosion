import { SimulationStateHolder } from './state/SimulationStateHolder';
import { TerrainStateHolder } from './state/TerrainStateHolder';
import { ClientStateHolder } from './state/ClientStateHolder';
import { ConfigHolder } from './state/ConfigHolder';
import { AppContext } from './context';

export type { AppContext };

/**
 * Creates and wires the application context with all state holders.
 * This is the composition root - all dependencies are created here.
 * No simulation-state imports; config comes from ConfigHolder.
 *
 * @param initialSimres - Initial simulation resolution (when null/undefined, uses configHolder.defaultSimres)
 * @returns Fully wired AppContext
 */
export function createApp(initialSimres?: number): AppContext {
    const configHolder = new ConfigHolder();
    const resolvedSimres = initialSimres ?? configHolder.defaultSimres;
    const simulationState = new SimulationStateHolder(resolvedSimres);
    const terrainState = new TerrainStateHolder();
    const clientState = new ClientStateHolder();

    return {
        simulationState,
        terrainState,
        clientState,
        configHolder
    };
}
