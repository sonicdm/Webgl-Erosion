import { StepRunner } from '../StepRunner';
import { SimulationPassManager } from '../../simulation/SimulationPassManager';
import { SimulationParams, createSimulationParams } from '../../../app/dto/SimulationParams';
import { BrushInput, createBrushInput } from '../../../app/dto/BrushInput';
import { SourceArrays } from '../../../app/dto/SourceArrays';
import { vec2, vec3, vec4 } from 'gl-matrix';

// Mock SimulationPassManager
jest.mock('../../simulation/SimulationPassManager', () => ({
  SimulationPassManager: jest.fn(),
}));

// Don't mock SourceArrays - use the real implementation

describe('StepRunner', () => {
  let stepRunner: StepRunner;
  let mockPassManager: SimulationPassManager;
  let mockSimres: number;

  beforeEach(() => {
    mockSimres = 1024;
    mockPassManager = {
      executeStep: jest.fn(),
    } as any;
    stepRunner = new StepRunner(mockPassManager, mockSimres);
  });

  describe('executeStep', () => {
    it('should execute step with SimulationParams and BrushInput', () => {
      const mockControls = {
        simres: mockSimres,
        speed: 1.0,
        timer: 0,
      };
      const simParams = createSimulationParams(mockControls, mockSimres);
      const brushInput: BrushInput = {
        brushType: 2,
        brushSize: 4,
        brushStrength: 0.25,
        brushOperation: 0,
        brushPressed: 0,
        flattenTargetHeight: 0.0,
        slopeStartPos: vec2.fromValues(0.0, 0.0),
        slopeEndPos: vec2.fromValues(0.0, 0.0),
        slopeActive: 0,
        posTemp: vec2.fromValues(0.5, 0.5),
        brushPos: vec2.fromValues(0.5, 0.5),
      };
      stepRunner.executeStep(simParams, brushInput, 0);

      expect(mockPassManager.executeStep).toHaveBeenCalled();
    });

    it('should handle null BrushInput', () => {
      const mockControls = {
        simres: mockSimres,
        speed: 1.0,
        timer: 0,
      };
      const simParams = createSimulationParams(mockControls, mockSimres);
      const sourceArrays = new SourceArrays();

      stepRunner.executeStep(simParams, null, 0, sourceArrays);

      expect(mockPassManager.executeStep).toHaveBeenCalled();
    });

    it('should use SourceArrays DTO for source packing', () => {
      const mockControls = {
        simres: mockSimres,
        speed: 1.0,
        timer: 0,
      };
      const simParams = createSimulationParams(mockControls, mockSimres);
      const sourceArrays = new SourceArrays();
      
      // Mock the pack methods
      const mockWaterPack = {
        positions: new Float32Array(10 * 2),
        sizes: new Float32Array(10),
        strengths: new Float32Array(10),
        count: 0,
      };
      const mockLavaPack = {
        positions: new Float32Array(10 * 2),
        sizes: new Float32Array(10),
        strengths: new Float32Array(10),
        count: 0,
      };
      
      jest.spyOn(sourceArrays, 'packWaterSourcesForShader').mockReturnValue(mockWaterPack);
      jest.spyOn(sourceArrays, 'packLavaSourcesForShader').mockReturnValue(mockLavaPack);

      stepRunner.executeStep(simParams, null, 0, sourceArrays);

      expect(sourceArrays.packWaterSourcesForShader).toHaveBeenCalled();
      expect(sourceArrays.packLavaSourcesForShader).toHaveBeenCalled();
      expect(mockPassManager.executeStep).toHaveBeenCalled();
    });

    it('should convert BrushInput to brushState format', () => {
      const mockControls = {
        simres: mockSimres,
        speed: 1.0,
        timer: 0,
      };
      const simParams = createSimulationParams(mockControls, mockSimres);
      const brushInput: BrushInput = {
        brushType: 2,
        brushSize: 4,
        brushStrength: 0.25,
        brushOperation: 0,
        brushPressed: 1,
        flattenTargetHeight: 0.0,
        slopeStartPos: vec2.fromValues(0.0, 0.0),
        slopeEndPos: vec2.fromValues(0.0, 0.0),
        slopeActive: 0,
        posTemp: vec2.fromValues(0.5, 0.5),
        mouseWorldPos: vec4.fromValues(1.0, 2.0, 3.0, 1.0),
        mouseWorldDir: vec3.fromValues(0.0, -1.0, 0.0),
        brushPos: vec2.fromValues(0.5, 0.5),
      };
      stepRunner.executeStep(simParams, brushInput, 0);

      expect(mockPassManager.executeStep).toHaveBeenCalled();
      const callArgs = (mockPassManager.executeStep as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toBeDefined(); // brushState should be passed
    });
  });

  describe('setPassManager', () => {
    it('should set the pass manager', () => {
      const newPassManager = {
        executeStep: jest.fn(),
      } as any;
      
      stepRunner.setPassManager(newPassManager);
      
      const mockControls = {
        simres: mockSimres,
        speed: 1.0,
        timer: 0,
      };
      const simParams = createSimulationParams(mockControls, mockSimres);
      const sourceArrays = new SourceArrays();
      
      stepRunner.executeStep(simParams, null, 0, sourceArrays);
      
      expect(newPassManager.executeStep).toHaveBeenCalled();
    });
  });
});
