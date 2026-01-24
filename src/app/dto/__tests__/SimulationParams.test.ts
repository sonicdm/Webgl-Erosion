import { createSimulationParams } from '../SimulationParams';
import { vec2 } from 'gl-matrix';

describe('createSimulationParams', () => {
  test('should create SimulationParams with defaults when controls is empty', () => {
    const params = createSimulationParams({}, 1024);
    
    expect(params.simres).toBe(1024);
    expect(params.speed).toBe(3);
    expect(params.timer).toBe(0);
    expect(params.Kc).toBe(0.06);
    expect(params.Ks).toBe(0.036);
    expect(params.Kd).toBe(0.006);
    expect(params.ErosionMode).toBe(0);
    expect(params.EvaporationConstant).toBe(0.003);
    expect(params.VelocityMultiplier).toBe(1);
    expect(params.RainErosion).toBe(false);
    expect(params.raycastMethod).toBe('bvh');
  });

  test('should use provided control values', () => {
    const controls = {
      SimulationResolution: 512,
      SimulationSpeed: 5,
      Kc: 0.1,
      Ks: 0.05,
      Kd: 0.01,
      ErosionMode: 1,
      RainErosion: true,
      raycastMethod: 'heightmap' as const,
    };
    
    const params = createSimulationParams(controls, 1024);
    
    expect(params.simres).toBe(512);
    expect(params.speed).toBe(5);
    expect(params.Kc).toBe(0.1);
    expect(params.Ks).toBe(0.05);
    expect(params.Kd).toBe(0.01);
    expect(params.ErosionMode).toBe(1);
    expect(params.RainErosion).toBe(true);
    expect(params.raycastMethod).toBe('heightmap');
  });

  test('should clone posTemp vec2', () => {
    const originalPos = vec2.fromValues(0.5, 0.7);
    const controls = { posTemp: originalPos };
    
    const params = createSimulationParams(controls, 1024);
    
    expect(params.posTemp).not.toBe(originalPos);
    expect(params.posTemp[0]).toBeCloseTo(0.5, 5);
    expect(params.posTemp[1]).toBeCloseTo(0.7, 5);
  });

  test('should create default posTemp when not provided', () => {
    const params = createSimulationParams({}, 1024);
    
    expect(params.posTemp).toBeDefined();
    expect(params.posTemp[0]).toBe(0.0);
    expect(params.posTemp[1]).toBe(0.0);
  });

  test('should handle all lava parameters', () => {
    const controls = {
      LavaViscosityPreExp: 2e-5,
      LavaActivationEnergy: 250000.0,
      LavaDensity: 3000.0,
      LavaSpecificHeat: 1500.0,
      LavaAirHeatTransfer: 300.0,
      LavaWaterHeatTransfer: 3000.0,
      LavaAmbientTemp: 25.0,
      LavaWaterTemp: 15.0,
      LavaContactHeatTransfer: 300.0,
      LavaMeltThreshold: 1300.0,
      LavaLatentHeatFusion: 500000.0,
      LavaSolidificationTemp: 900.0,
      LavaInitialTemp: 1300.0,
      LavaGlowIntensity: 3.0,
      LavaPatternFrequency: 10.0,
    };
    
    const params = createSimulationParams(controls, 1024);
    
    expect(params.LavaViscosityPreExp).toBe(2e-5);
    expect(params.LavaActivationEnergy).toBe(250000.0);
    expect(params.LavaDensity).toBe(3000.0);
    expect(params.LavaSpecificHeat).toBe(1500.0);
    expect(params.LavaAirHeatTransfer).toBe(300.0);
    expect(params.LavaWaterHeatTransfer).toBe(3000.0);
    expect(params.LavaAmbientTemp).toBe(25.0);
    expect(params.LavaWaterTemp).toBe(15.0);
    expect(params.LavaContactHeatTransfer).toBe(300.0);
    expect(params.LavaMeltThreshold).toBe(1300.0);
    expect(params.LavaLatentHeatFusion).toBe(500000.0);
    expect(params.LavaSolidificationTemp).toBe(900.0);
    expect(params.LavaInitialTemp).toBe(1300.0);
    expect(params.LavaGlowIntensity).toBe(3.0);
    expect(params.LavaPatternFrequency).toBe(10.0);
  });

  test('should handle terrain parameters', () => {
    const controls = {
      TerrainBaseMap: 1,
      TerrainBaseType: 2,
      TerrainBiomeType: 2,
      TerrainScale: 5.0,
      TerrainHeight: 3.0,
      TerrainMask: 1,
      TerrainPlatte: 2,
      SnowRange: 0.5,
      ForestRange: 0.3,
    };
    
    const params = createSimulationParams(controls, 1024);
    
    expect(params.TerrainBaseMap).toBe(1);
    expect(params.TerrainBaseType).toBe(2);
    expect(params.TerrainBiomeType).toBe(2);
    expect(params.TerrainScale).toBe(5.0);
    expect(params.TerrainHeight).toBe(3.0);
    expect(params.TerrainMask).toBe(1);
    expect(params.TerrainPlatte).toBe(2);
    expect(params.SnowRange).toBe(0.5);
    expect(params.ForestRange).toBe(0.3);
  });
});
