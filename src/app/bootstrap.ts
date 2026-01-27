import { SimulationStateHolder } from './state/SimulationStateHolder';
import { TerrainStateHolder } from './state/TerrainStateHolder';
import { ClientStateHolder } from './state/ClientStateHolder';
import { AppContext } from './context';
import { simresolution } from '../simulation/simulation-state';

export type { AppContext };

/**
 * Creates and wires the application context with all state holders.
 * This is the composition root - all dependencies are created here.
 * 
 * @param initialSimres - Initial simulation resolution (defaults to 1024)
 * @returns Fully wired AppContext
 */
export function createApp(initialSimres: number = simresolution): AppContext {
    const simulationState = new SimulationStateHolder(initialSimres);
    const terrainState = new TerrainStateHolder();
    const clientState = new ClientStateHolder();
    
    return {
        simulationState,
        terrainState,
        clientState
    };
}
