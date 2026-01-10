import { vec2, vec3, vec4, mat4 } from "gl-matrix";
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from "./controls-config";
import { sampleHeightBilinear, rayCast } from "./utils/raycast";
import { rayCastBVH } from "./utils/bvh-raycast";
import Camera from "./Camera";
import { terrainGeometry, terrainBVH, simres, HightMapCpuBuf } from "./simulation/simulation-state";

// Store original brushOperation when modifier is held (for restoration on release)
// This is module-level state that persists across calls
let originalBrushOperation: number | null = null;

// Export a function to get/set this for external access if needed
export function getOriginalBrushOperation(): number | null {
    return originalBrushOperation;
}

export function setOriginalBrushOperation(value: number | null): void {
    originalBrushOperation = value;
}

export interface BrushControls {
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
    brushPressed: number;
    flattenTargetHeight: number;
    slopeStartPos: vec2;
    slopeEndPos: vec2;
    slopeActive: number;
    posTemp: vec2;
}

export interface BrushContext {
    controls: BrushControls;
    controlsConfig: ControlsConfig;
    simres: number;
    HightMapCpuBuf: Float32Array;
    camera: Camera;
}

/**
 * Handle brush activation on mouse down
 */
export function handleBrushMouseDown(
    event: MouseEvent | PointerEvent,
    context: BrushContext
): { shouldActivate: boolean; brushPressed: number } {
    const { controls, controlsConfig } = context;
    const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][event.button];
    
    const action = getMouseButtonAction(event.button, controlsConfig);
    
    if (action !== 'brushActivate') {
        return { shouldActivate: false, brushPressed: 0 };
    }
    
    let brushPressed = 1;
    
    // Convert brushType to number (it might be a string from UI control)
    const brushTypeNum = Number(controls.brushType);
    
    // Check if secondary brush modifier is pressed (configurable, default Alt)
    const secondaryModifier = controlsConfig.modifiers.brushSecondary;
    const isSecondaryPressed = isModifierPressed(secondaryModifier, event);
    
    if (isSecondaryPressed) {
        if (brushTypeNum === 5) {
            // Flatten: Secondary modifier+click should set target height and NOT activate brush
            // Store original operation if not already stored (for restoration on release)
            if (originalBrushOperation === null) {
                originalBrushOperation = controls.brushOperation;
            }
            controls.brushOperation = 1; // Secondary button (temporary override)
            
            // Perform a fresh raycast using the event's mouse coordinates
            // This ensures we get the correct position for the click, not stale data from tick()
            const canvas = document.getElementById('canvas') as HTMLCanvasElement;
            if (!canvas) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                brushPressed = 0;
                return { shouldActivate: false, brushPressed: 0 };
            }
            
            const rect = canvas.getBoundingClientRect();
            const normalizedX = (event.clientX - rect.left) / rect.width;
            const normalizedY = (event.clientY - rect.top) / rect.height;
            
            
            // Perform fresh raycast using event coordinates and current camera matrices
            // Update camera first to ensure matrices are current
            context.camera.update(context.controlsConfig.camera);
            
            // Calculate ray from mouse coordinates (same logic as tick())
            const viewProj = mat4.create();
            mat4.multiply(viewProj, context.camera.projectionMatrix, context.camera.viewMatrix);
            const invViewProj = mat4.create();
            mat4.invert(invViewProj, viewProj);
            
            const mousePoint = vec4.create();
            const mousePointEnd = vec4.create();
            mousePoint[0] = 2.0 * normalizedX - 1.0;
            mousePoint[1] = 1.0 - 2.0 * normalizedY;
            mousePoint[2] = -1.0;
            mousePoint[3] = 1.0;
            mousePointEnd[0] = 2.0 * normalizedX - 1.0;
            mousePointEnd[1] = 1.0 - 2.0 * normalizedY;
            mousePointEnd[2] = -0.0;
            mousePointEnd[3] = 1.0;
            
            
            vec4.transformMat4(mousePoint, mousePoint, invViewProj);
            vec4.transformMat4(mousePointEnd, mousePointEnd, invViewProj);
            mousePoint[0] /= mousePoint[3];
            mousePoint[1] /= mousePoint[3];
            mousePoint[2] /= mousePoint[3];
            mousePointEnd[0] /= mousePointEnd[3];
            mousePointEnd[1] /= mousePointEnd[3];
            mousePointEnd[2] /= mousePointEnd[3];
            
            const rayDir = vec3.create();
            rayDir[0] = mousePointEnd[0] - mousePoint[0];
            rayDir[1] = mousePointEnd[1] - mousePoint[1];
            rayDir[2] = mousePointEnd[2] - mousePoint[2];
            vec3.normalize(rayDir, rayDir);
            
            const rayOrigin = vec3.fromValues(mousePoint[0], mousePoint[1], mousePoint[2]);
            
            
            // Perform raycast
            const freshPos = vec2.create();
            freshPos[0] = -10.0;
            freshPos[1] = -10.0;
            
            if ((controls as any).raycastMethod === 'bvh' && terrainBVH && terrainGeometry) {
                const hit = rayCastBVH(rayOrigin, rayDir, terrainBVH, terrainGeometry, freshPos);
                if (!hit) {
                    const heightmapPos = vec2.create();
                    rayCast(rayOrigin, rayDir, context.simres, context.HightMapCpuBuf, heightmapPos);
                    freshPos[0] = heightmapPos[0];
                    freshPos[1] = heightmapPos[1];
                }
            } else {
                rayCast(rayOrigin, rayDir, context.simres, context.HightMapCpuBuf, freshPos);
            }
            
            
            // Validate fresh raycast result
            const isValidUV = freshPos[0] >= 0.0 && freshPos[0] <= 1.0 &&
                              freshPos[1] >= 0.0 && freshPos[1] <= 1.0 &&
                              freshPos[0] !== -10.0 && freshPos[1] !== -10.0;
            
            
            if (!isValidUV) {
                // Don't activate brush, just set target
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                brushPressed = 0;
                return { shouldActivate: false, brushPressed: 0 };
            }
            
            // Read height from fresh raycast position using bilinear interpolation
            const brushUV = vec2.fromValues(freshPos[0], freshPos[1]);
            
            
            const rawHeight = sampleHeightBilinear(brushUV, context.simres, context.HightMapCpuBuf);
            // The shader uses currentHeight = cur.x directly, so currentHeight is in the same range as the texture
            // The texture stores values in 0-simres range (based on terrain-vert.glsl dividing by u_SimRes)
            // But if the value is exactly half, maybe the texture stores in a different range?
            // Let's check: if rawHeight is in 0-simres (0-1024), and we want 0-500, we'd do rawHeight * 500 / simres
            // But if it's exactly half, maybe we need rawHeight * 1000 / simres? Or maybe rawHeight is already in 0-500 range?
            // Actually, the shader comparison is: (targetHeight - currentHeight) where both should be in the same range
            // If currentHeight is in 0-simres range, then targetHeight should also be in 0-simres range
            // But we're sending 0-500. So we need to convert rawHeight to 0-500 range to match what we're sending
            // If the value is exactly half, maybe we need to multiply by 2?
            const heightValue = (rawHeight * 1000.0) / context.simres; // Convert from 0-simres to 0-500, multiply by 2 to fix "exactly half" issue
            
            
            if (heightValue !== undefined && !isNaN(heightValue) && isFinite(heightValue)) {
                
                // Update the controls object (shader expects 0-500 range)
                controls.flattenTargetHeight = heightValue;
                
                
                // Update the brush palette slider (this is the main UI the user sees)
                const flattenContainer = document.querySelector('#flatten-controls') as HTMLElement;
                if (flattenContainer) {
                    const flattenInput = flattenContainer.querySelector('input[type="range"]') as HTMLInputElement;
                    const flattenLabel = flattenContainer.querySelector('label') as HTMLLabelElement;
                    
                    if (flattenInput) {
                        flattenInput.value = heightValue.toString();
                        flattenInput.setAttribute('value', heightValue.toString());
                        // Trigger input event to update the label
                        flattenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    if (flattenLabel) {
                        flattenLabel.textContent = `Target Height: ${heightValue.toFixed(1)}`;
                    }
                    
                } else {
                }
                
                // Also update DAT.GUI controller if it exists
                const flattenTargetHeightController = (window as any).flattenTargetHeightController;
                if (flattenTargetHeightController) {
                    // Call updateDisplay to refresh the controller display
                    flattenTargetHeightController.updateDisplay();
                }
            }
            
            // Don't activate brush, just set target
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            brushPressed = 0; // Don't activate brush
            return { shouldActivate: false, brushPressed: 0 };
            
        } else if (brushTypeNum === 6) {
            // Slope: Alt+click sets START point - DON'T change brushOperation for slope brush
            // Alt is only used to set the start point, not to change operation mode
            controls.slopeStartPos = vec2.clone(controls.posTemp);
            
            // Check if end point was already set
            if (controls.slopeActive >= 1 && !vec2.equals(controls.slopeEndPos, vec2.fromValues(0.0, 0.0))) {
                // End point was already set, now start is set - activate slope creation
                controls.slopeActive = 2;
                // Continue to activate brush (brushPressed = 1 is already set above)
                // Keep brushOperation as set by palette - don't override it
            } else {
                // No end point set yet, just set start point and wait
                controls.slopeActive = 1;
                // Just set the point, don't activate brush yet
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            }
        } else {
            // For other brushes, Alt modifier sets brushOperation to 1 (subtract)
            // Store original operation if not already stored (for restoration on release)
            if (originalBrushOperation === null) {
                originalBrushOperation = controls.brushOperation;
            }
            controls.brushOperation = 1; // Secondary button (temporary override)
        }
    } else {
        // Don't override brushOperation - preserve the value set by palette
        // The palette setting should be respected unless a modifier is used
        
        // Handle slope brush end point (primary click)
        if (brushTypeNum === 6) {
            controls.slopeEndPos = vec2.clone(controls.posTemp);
            
            // If both points were set and brush was active, just update the end point and deactivate
            // This allows setting a new end point without activating the brush
            if (controls.slopeActive === 2) {
                // Keep slopeActive at 2 so both points remain set, but don't activate brush
                // User can now Alt+click to set a new start point and drag
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            } else if (controls.slopeActive === 1 && !vec2.equals(controls.slopeStartPos, vec2.fromValues(0.0, 0.0))) {
                // Start point was already set, now end point is set - activate slope creation
                controls.slopeActive = 2;
                // Continue to activate brush (brushPressed = 1 is already set above)
            } else {
                // End point set first, waiting for Alt+click to set start point
                controls.slopeActive = 1;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            }
        }
        
        // Check for brush invert modifier - but not the secondary modifier (secondary modifier is for secondary operation)
        const invertModifier = controlsConfig.modifiers.brushInvert;
        if (invertModifier && invertModifier !== secondaryModifier) {
            const modifierPressed = isModifierPressed(invertModifier, event);
            
            if (modifierPressed) {
                originalBrushOperation = controls.brushOperation;
                controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
            }
        }
    }
    
    return { shouldActivate: true, brushPressed };
}

/**
 * Handle brush deactivation on mouse up
 */
export function handleBrushMouseUp(
    event: MouseEvent | PointerEvent,
    context: BrushContext
): void {
    const { controls } = context;
    const action = getMouseButtonAction(event.button, context.controlsConfig);
    
    if (action === 'brushActivate') {
        // For slope brush, keep both points set after releasing (slopeActive stays at 2)
        // This allows setting a new start point with Alt+click without needing to set end point again
        const brushTypeNum = Number(controls.brushType);
        if (brushTypeNum === 6 && controls.slopeActive === 2) {
            // slopeActive stays at 2, so both points remain available
        }
        
        // Restore original brushOperation if it was inverted
        if (originalBrushOperation !== null) {
            controls.brushOperation = originalBrushOperation;
            originalBrushOperation = null;
        }
    }
}

/**
 * Update brush state in tick loop
 */
export function updateBrushState(
    pos: vec2,
    context: BrushContext
): void {
    const { controls } = context;
    const brushTypeNum = Number(controls.brushType);
    
    // Handle flatten brush target height setting (secondary modifier+click sets target to center height)
    if (brushTypeNum === 5 && controls.brushPressed === 1 && controls.brushOperation === 1) {
        // Secondary modifier is pressed - read target height from CPU buffer at brush center using bilinear interpolation
        const brushUV = vec2.fromValues(pos[0], pos[1]);
        const rawHeight = sampleHeightBilinear(brushUV, context.simres, context.HightMapCpuBuf);
        const heightValue = rawHeight / context.simres; // Normalize height value
        
        if (heightValue !== undefined && !isNaN(heightValue)) {
            // Set the value on the controls object
            controls.flattenTargetHeight = heightValue;
            
            // Update the brush palette slider (this is the main UI the user sees)
            const flattenContainer = document.querySelector('#flatten-controls') as HTMLElement;
            if (flattenContainer) {
                const flattenInput = flattenContainer.querySelector('input[type="range"]') as HTMLInputElement;
                const flattenLabel = flattenContainer.querySelector('label') as HTMLLabelElement;
                
                if (flattenInput) {
                    flattenInput.value = heightValue.toString();
                    flattenInput.setAttribute('value', heightValue.toString());
                    // Trigger input event to update the label
                    flattenInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                if (flattenLabel) {
                    flattenLabel.textContent = `Target Height: ${heightValue.toFixed(1)}`;
                }
            }
            
            // Also update DAT.GUI controller if it exists
            const flattenTargetHeightController = (window as any).flattenTargetHeightController;
            if (flattenTargetHeightController) {
                flattenTargetHeightController.updateDisplay();
            }
        }
    }
    
    // Handle slope brush - once both points are set, continuously apply slope
    if (brushTypeNum === 6) {
        // When both points are set and brush is active, apply slope continuously
        if (controls.brushPressed === 1 && controls.slopeActive === 2) {
            // Both points are set, slope is being applied
            // The shader will handle the actual slope creation
            // No need to update positions here - they're already set
        }
    }
}

