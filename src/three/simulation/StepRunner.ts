import { SimulationPassManager } from './SimulationPassManager';
import { SimulationParams } from '../../app/dto/SimulationParams';
import { BrushInput } from '../../app/dto/BrushInput';
import { SourceArrays } from '../../app/dto/SourceArrays';
import { waterSources, getWaterSourceCount } from '../../utils/water-sources';
import { lavaSources, getLavaSourceCount } from '../../utils/lava-sources';

/**
 * Step runner service
 * Handles simulation step execution with typed DTOs
 */
export class StepRunner {
  constructor(
    private passManager: SimulationPassManager | null,
    private simres: number
  ) {}

  /**
   * Sets the pass manager reference
   */
  public setPassManager(passManager: SimulationPassManager | null): void {
    this.passManager = passManager;
  }

  /**
   * Executes one simulation step
   * @param simParams - Simulation parameters
   * @param brushInput - Brush input (optional)
   * @param timer - Time value for shaders
   * @param sourceArrays - Source arrays DTO (water and lava sources, optional - will create from globals if not provided)
   */
  public executeStep(
    simParams: SimulationParams,
    brushInput: BrushInput | null,
    timer: number,
    sourceArrays?: SourceArrays
  ): void {
    if (!this.passManager) {
      throw new Error('Pass manager not set. Call setPassManager() first.');
    }

    // Create SourceArrays from globals if not provided
    const finalSourceArrays = sourceArrays || new SourceArrays(waterSources, lavaSources);

    // Pack source arrays using DTO methods
    const waterPack = finalSourceArrays.packWaterSourcesForShader();
    const lavaPack = finalSourceArrays.packLavaSourcesForShader();

    // Convert BrushInput to brushState format for pass manager
    let brushState: {
      mouseWorldPos?: [number, number, number, number];
      mouseWorldDir?: [number, number, number];
      brushPos?: [number, number];
    } | undefined;

    if (brushInput) {
      // Only use brushPos if it's valid (not [-10, -10] or invalid)
      if (brushInput.brushPos) {
        const posX = brushInput.brushPos[0];
        const posY = brushInput.brushPos[1];
        if (posX >= 0 && posX <= 1 && posY >= 0 && posY <= 1) {
          brushState = {
            mouseWorldPos: brushInput.mouseWorldPos ? [
              brushInput.mouseWorldPos[0],
              brushInput.mouseWorldPos[1],
              brushInput.mouseWorldPos[2],
              brushInput.mouseWorldPos[3]
            ] as [number, number, number, number] : undefined,
            mouseWorldDir: brushInput.mouseWorldDir ? [
              brushInput.mouseWorldDir[0],
              brushInput.mouseWorldDir[1],
              brushInput.mouseWorldDir[2]
            ] as [number, number, number] : undefined,
            brushPos: [posX, posY] as [number, number],
          };
        }
      } else if (brushInput.posTemp) {
        // Fallback to posTemp if brushPos not available
        const posTempX = brushInput.posTemp[0];
        const posTempY = brushInput.posTemp[1];
        if (posTempX >= 0 && posTempX <= 1 && posTempY >= 0 && posTempY <= 1) {
          brushState = {
            mouseWorldPos: brushInput.mouseWorldPos ? [
              brushInput.mouseWorldPos[0],
              brushInput.mouseWorldPos[1],
              brushInput.mouseWorldPos[2],
              brushInput.mouseWorldPos[3]
            ] as [number, number, number, number] : undefined,
            mouseWorldDir: brushInput.mouseWorldDir ? [
              brushInput.mouseWorldDir[0],
              brushInput.mouseWorldDir[1],
              brushInput.mouseWorldDir[2]
            ] as [number, number, number] : undefined,
            brushPos: [posTempX, posTempY] as [number, number],
          };
        }
      }
    }

    // Execute step with pass manager
    // Note: passManager.executeStep still accepts `any` for controls (will be fixed in Phase 6)
    this.passManager.executeStep(
      simParams as any, // Will be fixed in Phase 6
      timer,
      brushState,
      {
        count: waterPack.count,
        positions: waterPack.positions,
        sizes: waterPack.sizes,
        strengths: waterPack.strengths,
      },
      {
        count: lavaPack.count,
        positions: lavaPack.positions,
        sizes: lavaPack.sizes,
        strengths: lavaPack.strengths,
      }
    );
  }
}
