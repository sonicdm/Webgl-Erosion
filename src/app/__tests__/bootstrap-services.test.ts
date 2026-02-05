import { createApp } from '../bootstrap';
import { SimulationStateHolder } from '../state/SimulationStateHolder';
import { TerrainStateHolder } from '../state/TerrainStateHolder';
import { ClientStateHolder } from '../state/ClientStateHolder';

describe('Bootstrap Services (DI Smoke Test)', () => {
    it('should create app context with all state holders', () => {
        const appContext = createApp(1024);
        
        expect(appContext).toBeDefined();
        expect(appContext.simulationState).toBeInstanceOf(SimulationStateHolder);
        expect(appContext.terrainState).toBeInstanceOf(TerrainStateHolder);
        expect(appContext.clientState).toBeInstanceOf(ClientStateHolder);
    });
    
    it('should initialize simulation state with correct default values', () => {
        const appContext = createApp(512);
        
        expect(appContext.simulationState.simres).toBe(512);
        expect(appContext.simulationState.simFrameCount).toBe(0);
        expect(appContext.simulationState.pauseGeneration).toBe(false);
        expect(appContext.simulationState.terrainGeometryDirty).toBe(true);
        expect(appContext.simulationState.heightMapCpuBuf).toBeInstanceOf(Float32Array);
        expect(appContext.simulationState.heightMapCpuBuf.length).toBe(512 * 512 * 4);
    });
    
    it('should initialize terrain state with null values', () => {
        const appContext = createApp(1024);
        
        expect(appContext.terrainState.terrainGeometry).toBeNull();
        expect(appContext.terrainState.terrainBVH).toBeNull();
        expect(appContext.terrainState.terrainBVHBuildInProgress).toBe(false);
    });
    
    it('should initialize client state with zero values', () => {
        const appContext = createApp(1024);
        
        expect(appContext.clientState.clientWidth).toBe(0);
        expect(appContext.clientState.clientHeight).toBe(0);
        expect(appContext.clientState.lastX).toBe(0);
        expect(appContext.clientState.lastY).toBe(0);
    });
    
    it('should create independent holder instances (not singletons)', () => {
        const appContext1 = createApp(512);
        const appContext2 = createApp(1024);
        
        // Verify they are different instances
        expect(appContext1.simulationState).not.toBe(appContext2.simulationState);
        expect(appContext1.terrainState).not.toBe(appContext2.terrainState);
        expect(appContext1.clientState).not.toBe(appContext2.clientState);
        
        // Verify they have independent state
        appContext1.simulationState.setSimRes(256);
        expect(appContext1.simulationState.simres).toBe(256);
        expect(appContext2.simulationState.simres).toBe(1024);
    });
    
    it('should allow updating and reading back state', () => {
        const appContext = createApp(1024);
        
        // Update simulation state
        appContext.simulationState.setSimRes(2048);
        appContext.simulationState.setPauseGeneration(true);
        appContext.simulationState.incrementSimFrameCount();
        appContext.simulationState.setTerrainGeometryDirty(false);
        
        // Verify updates
        expect(appContext.simulationState.simres).toBe(2048);
        expect(appContext.simulationState.pauseGeneration).toBe(true);
        expect(appContext.simulationState.simFrameCount).toBe(1);
        expect(appContext.simulationState.terrainGeometryDirty).toBe(false);
        
        // Update terrain state
        const mockGeometry = {} as any;
        const mockBVH = {} as any;
        appContext.terrainState.setTerrainGeometry(mockGeometry);
        appContext.terrainState.setTerrainBVH(mockBVH);
        appContext.terrainState.setTerrainBVHBuildInProgress(true);
        
        // Verify updates
        expect(appContext.terrainState.terrainGeometry).toBe(mockGeometry);
        expect(appContext.terrainState.terrainBVH).toBe(mockBVH);
        expect(appContext.terrainState.terrainBVHBuildInProgress).toBe(true);
        
        // Update client state
        appContext.clientState.setClientDimensions(1920, 1080);
        appContext.clientState.setLastMousePosition(100, 200);
        
        // Verify updates
        expect(appContext.clientState.clientWidth).toBe(1920);
        expect(appContext.clientState.clientHeight).toBe(1080);
        expect(appContext.clientState.lastX).toBe(100);
        expect(appContext.clientState.lastY).toBe(200);
    });
});
