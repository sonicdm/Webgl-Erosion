import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { AppContext } from '../bootstrap';
import { BrushInput, createBrushInput } from '../dto/BrushInput';
import { ThreeJSSimulationRuntime } from '../../three/integration';
import { updateBrushState, BrushContext, BrushControls } from '../../brush-handler';
import { ControlsConfig } from '../../controls-config';
import Camera from '../../Camera';

/**
 * Normalizes mouse position from client coordinates to canvas-relative normalized coordinates [0, 1]
 */
export function normalizeMousePosition(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return { x, y };
}

/**
 * Calculates brush input from mouse position and controls
 * Handles both Three.js and legacy paths
 * 
 * @param appContext - Application context
 * @param controls - Controls object (will be converted to BrushInput)
 * @param mouseX - Mouse X position in client coordinates
 * @param mouseY - Mouse Y position in client coordinates
 * @param canvas - Canvas element
 * @param threeRuntime - Optional Three.js runtime (for Three.js path)
 * @returns BrushInput DTO with calculated brush state, or null if calculation fails
 */
export function calculateBrushInput(
  appContext: AppContext,
  controls: any,
  mouseX: number,
  mouseY: number,
  canvas: HTMLCanvasElement,
  threeRuntime?: ThreeJSSimulationRuntime
): BrushInput | null {
  // Create base BrushInput from controls
  const brushInput = createBrushInput(controls);

  // Check if brush is visible or pressed
  const brushVisible = Number(controls.brushType) !== 0;
  const brushPressed = controls.brushPressed === 1;
  const shouldCalculateBrush = brushVisible || brushPressed;

  if (!shouldCalculateBrush) {
    // Brush not active - return base BrushInput without world position
    return brushInput;
  }

  // Calculate brush state (mouse world pos/dir, brush UV position)
  let brushState: {
    mouseWorldPos?: [number, number, number, number];
    mouseWorldDir?: [number, number, number];
    brushPos?: [number, number];
  } | undefined = undefined;

  if (threeRuntime) {
    // Three.js path: use threeRuntime.calculateBrushState()
    const calculatedBrushState = threeRuntime.calculateBrushState(mouseX, mouseY, canvas);
    if (calculatedBrushState) {
      // Only use brushState if brushPos is valid (not [-10, -10])
      const [brushPosX, brushPosY] = calculatedBrushState.brushPos;
      if (brushPosX >= 0 && brushPosX <= 1 && brushPosY >= 0 && brushPosY <= 1) {
        brushState = calculatedBrushState;
        // Update controls.posTemp for brush system compatibility
        controls.posTemp = vec2.fromValues(brushPosX, brushPosY);
      } else {
        // Invalid brushPos - don't set brushState
        brushState = undefined;
      }
    }
  } else {
    // Legacy path: use raycaster from appContext
    const camera = appContext.cameraService.getCamera();
    if (!camera) {
      return brushInput; // No camera available
    }

    // Update camera before raycasting so matrices are in sync
    camera.update(appContext.controlsConfig.camera);

    // Normalize mouse position
    const normalizedMouse = normalizeMousePosition(canvas, mouseX, mouseY);
    const screenMouseX = normalizedMouse.x;
    const screenMouseY = normalizedMouse.y;

    // Calculate ray from mouse coordinates
    const reusableViewProj = mat4.create();
    const reusableInvViewProj = mat4.create();
    const reusableMousePoint = vec4.create();
    const reusableMousePointEnd = vec4.create();
    const reusableDir = vec3.create();
    const reusableRo = vec3.create();
    const reusablePos = vec2.create();

    mat4.multiply(reusableViewProj, camera.projectionMatrix, camera.viewMatrix);
    mat4.invert(reusableInvViewProj, reusableViewProj);
    reusableMousePoint[0] = 2.0 * screenMouseX - 1.0;
    reusableMousePoint[1] = 1.0 - 2.0 * screenMouseY;
    reusableMousePoint[2] = -1.0;
    reusableMousePoint[3] = 1.0;
    reusableMousePointEnd[0] = 2.0 * screenMouseX - 1.0;
    reusableMousePointEnd[1] = 1.0 - 2.0 * screenMouseY;
    reusableMousePointEnd[2] = -0.0;
    reusableMousePointEnd[3] = 1.0;

    vec4.transformMat4(reusableMousePoint, reusableMousePoint, reusableInvViewProj);
    vec4.transformMat4(reusableMousePointEnd, reusableMousePointEnd, reusableInvViewProj);
    reusableMousePoint[0] /= reusableMousePoint[3];
    reusableMousePoint[1] /= reusableMousePoint[3];
    reusableMousePoint[2] /= reusableMousePoint[3];
    reusableMousePoint[3] /= reusableMousePoint[3];
    reusableMousePointEnd[0] /= reusableMousePointEnd[3];
    reusableMousePointEnd[1] /= reusableMousePointEnd[3];
    reusableMousePointEnd[2] /= reusableMousePointEnd[3];
    reusableMousePointEnd[3] /= reusableMousePointEnd[3];
    reusableDir[0] = reusableMousePointEnd[0] - reusableMousePoint[0];
    reusableDir[1] = reusableMousePointEnd[1] - reusableMousePoint[1];
    reusableDir[2] = reusableMousePointEnd[2] - reusableMousePoint[2];
    vec3.normalize(reusableDir, reusableDir);
    reusableRo[0] = reusableMousePoint[0];
    reusableRo[1] = reusableMousePoint[1];
    reusableRo[2] = reusableMousePoint[2];

    // Initialize to invalid values so we can detect misses
    reusablePos[0] = -10.0;
    reusablePos[1] = -10.0;

    // Perform raycast using appContext.raycaster
    const raycastMethod = controls.raycastMethod || 'heightmap';
    const hit = appContext.raycaster.raycast(
      reusableRo,
      reusableDir,
      raycastMethod,
      reusablePos
    );

    if (hit && reusablePos[0] >= 0 && reusablePos[0] <= 1 && reusablePos[1] >= 0 && reusablePos[1] <= 1) {
      // Valid hit - create brush state
      brushState = {
        mouseWorldPos: [
          reusableMousePoint[0],
          reusableMousePoint[1],
          reusableMousePoint[2],
          reusableMousePoint[3],
        ] as [number, number, number, number],
        mouseWorldDir: [reusableDir[0], reusableDir[1], reusableDir[2]] as [number, number, number],
        brushPos: [reusablePos[0], reusablePos[1]] as [number, number],
      };
      controls.posTemp = reusablePos;
    }
  }

  // Update brush state (flatten target height, slope end points, etc.)
  if (brushState && brushState.brushPos) {
    const camera = threeRuntime?.getCamera() || appContext.cameraService.getCamera();
    if (camera) {
      const brushContext: BrushContext = {
        controls: controls as BrushControls,
        controlsConfig: appContext.controlsConfig,
        simres: appContext.simulationState.simres,
        heightMapCpuBuf: appContext.terrainStateHolder.heightMapCpuBuf,
        camera: camera,
        simulationState: appContext.simulationState,
        terrainState: appContext.terrainStateHolder,
      };
      if (brushState.brushPos) {
        const brushPosVec2 = vec2.fromValues(brushState.brushPos[0], brushState.brushPos[1]);
        updateBrushState(brushPosVec2, brushContext);
      }
    }
  }

  // Update BrushInput with calculated state
  if (brushState) {
    brushInput.mouseWorldPos = vec4.fromValues(
      brushState.mouseWorldPos![0],
      brushState.mouseWorldPos![1],
      brushState.mouseWorldPos![2],
      brushState.mouseWorldPos![3]
    );
    brushInput.mouseWorldDir = vec3.fromValues(
      brushState.mouseWorldDir![0],
      brushState.mouseWorldDir![1],
      brushState.mouseWorldDir![2]
    );
    brushInput.brushPos = vec2.fromValues(brushState.brushPos![0], brushState.brushPos![1]);
  }

  return brushInput;
}

/**
 * Updates BrushInput from controls object
 * Syncs controls object properties to BrushInput DTO
 */
export function updateBrushInputFromControls(controls: any, brushInput: BrushInput): void {
  brushInput.brushType = controls.brushType ?? brushInput.brushType;
  brushInput.brushSize = controls.brushSize ?? brushInput.brushSize;
  brushInput.brushStrength = controls.brushStrenth ?? controls.brushStrength ?? brushInput.brushStrength;
  brushInput.brushOperation = controls.brushOperation ?? brushInput.brushOperation;
  brushInput.brushPressed = controls.brushPressed ?? brushInput.brushPressed;
  brushInput.flattenTargetHeight = controls.flattenTargetHeight ?? brushInput.flattenTargetHeight;
  brushInput.slopeStartPos = controls.slopeStartPos
    ? vec2.clone(controls.slopeStartPos)
    : brushInput.slopeStartPos;
  brushInput.slopeEndPos = controls.slopeEndPos
    ? vec2.clone(controls.slopeEndPos)
    : brushInput.slopeEndPos;
  brushInput.slopeActive = controls.slopeActive ?? brushInput.slopeActive;
  brushInput.posTemp = controls.posTemp ? vec2.clone(controls.posTemp) : brushInput.posTemp;
}
