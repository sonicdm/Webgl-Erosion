import { vec2 } from "gl-matrix";
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from "./controls-config";
import { sampleHeightBilinear } from "./utils/raycast";

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
            
            // Read height from current brush position using bilinear interpolation
            const brushUV = vec2.fromValues(controls.posTemp[0], controls.posTemp[1]);
            const rawHeight = sampleHeightBilinear(brushUV, context.simres, context.HightMapCpuBuf);
            const heightValue = rawHeight / context.simres; // Normalize height value
            
            if (heightValue !== undefined && !isNaN(heightValue)) {
                
                // Update the controls object
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

