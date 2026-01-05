import { vec2 } from "gl-matrix";
import { ControlsConfig, getMouseButtonAction, isModifierPressed } from "./controls-config";

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
    
    console.log('[DEBUG] Activating brush - setting brushPressed = 1');
    let brushPressed = 1;
    
    // Convert brushType to number (it might be a string from UI control)
    const brushTypeNum = Number(controls.brushType);
    
    // Check if secondary brush modifier is pressed (configurable, default Alt)
    const secondaryModifier = controlsConfig.modifiers.brushSecondary;
    const isSecondaryPressed = isModifierPressed(secondaryModifier, event);
    
    console.log('[DEBUG] onMouseDown - modifiers:', {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
        secondaryModifier,
        isSecondaryPressed
    }, 'brushType:', controls.brushType);
    
    if (isSecondaryPressed) {
        console.log('[DEBUG] Secondary modifier detected! Setting brushOperation to 1 (secondary), brushType:', brushTypeNum);
        controls.brushOperation = 1; // Secondary button
        originalBrushOperation = null;
        
        // Special handling for specific brushes
        console.log('[DEBUG] Checking brush type, current:', controls.brushType, 'as number:', brushTypeNum);
        
        if (brushTypeNum === 5) {
            // Flatten: Secondary modifier+click should set target height and NOT activate brush
            console.log('[DEBUG] Flatten brush detected with secondary modifier! Entering flatten handler');
            // Read height from current brush position
            const brushX = Math.floor(controls.posTemp[0] * context.simres);
            const brushY = Math.floor(controls.posTemp[1] * context.simres);
            const pixelIndex = (brushY * context.simres + brushX) * 4;
            
            console.log('[DEBUG] Flatten secondary modifier+click - UV:', controls.posTemp[0], controls.posTemp[1], 'Pixel:', brushX, brushY, 'Index:', pixelIndex, 'Buffer length:', context.HightMapCpuBuf.length);
            
            if (pixelIndex >= 0 && pixelIndex < context.HightMapCpuBuf.length) {
                const heightValue = context.HightMapCpuBuf[pixelIndex]; // R channel = height
                controls.flattenTargetHeight = heightValue;
                console.log('[DEBUG] Flatten target height SET to:', heightValue, 'at UV:', controls.posTemp[0], controls.posTemp[1]);
            } else {
                console.log('[DEBUG] Flatten FAILED to read height - invalid pixel index');
            }
            
            // Don't activate brush, just set target
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            brushPressed = 0; // Don't activate brush
            return { shouldActivate: false, brushPressed: 0 };
            
        } else if (brushTypeNum === 6) {
            // Slope: Alt+click sets START point
            console.log('[DEBUG] Slope brush detected with Alt modifier - setting START point');
            
            // If both points were already set, clear the end point to start fresh
            if (controls.slopeActive === 2) {
                console.log('[DEBUG] Resetting slope - clearing old end point, setting new START point');
                controls.slopeEndPos = vec2.fromValues(0.0, 0.0);
                controls.slopeActive = 1; // Now waiting for end point
            }
            
            controls.slopeStartPos = vec2.clone(controls.posTemp);
            
            // Check if end point was already set (slopeActive == 1 means end was set first, but we just reset it)
            if (controls.slopeActive === 1 && !vec2.equals(controls.slopeEndPos, vec2.fromValues(0.0, 0.0))) {
                // End point was already set, now start is set - activate slope creation
                controls.slopeActive = 2;
                console.log('[DEBUG] Both points set - START at:', controls.slopeStartPos[0], controls.slopeStartPos[1], 'END at:', controls.slopeEndPos[0], controls.slopeEndPos[1]);
                // Continue to activate brush (brushPressed = 1 is already set above)
            } else {
                // Start point set, waiting for end point
                controls.slopeActive = 1;
                console.log('[DEBUG] Slope START point set at UV:', controls.slopeStartPos[0], controls.slopeStartPos[1], 'waiting for end point');
                // Just set the point, don't activate brush yet
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            }
        }
    } else {
        console.log('[DEBUG] No secondary modifier - setting brushOperation to 0 (primary), brushType:', brushTypeNum);
        controls.brushOperation = 0; // Primary button
        originalBrushOperation = null;
        
        // Handle slope brush end point (primary click)
        if (brushTypeNum === 6) {
            console.log('[DEBUG] Slope brush primary click handler - setting END point');
            controls.slopeEndPos = vec2.clone(controls.posTemp);
            
            // Check if start point was already set (slopeActive == 1 means start was set first)
            if (controls.slopeActive === 1 && !vec2.equals(controls.slopeStartPos, vec2.fromValues(0.0, 0.0))) {
                // Start point was already set, now end point is set - activate slope creation
                controls.slopeActive = 2;
                console.log('[DEBUG] Both points set - END at:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'START at:', controls.slopeStartPos[0], controls.slopeStartPos[1]);
                // Continue to activate brush (brushPressed = 1 is already set above)
            } else if (controls.slopeActive === 2) {
                // Both already set - user is setting a new end point, reset and wait for start point again
                console.log('[DEBUG] Resetting slope - new END point set at:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'waiting for Alt+click to set new start point');
                controls.slopeActive = 1; // Reset to waiting for start point
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            } else {
                // End point set first, waiting for Alt+click to set start point
                controls.slopeActive = 1;
                console.log('[DEBUG] End point set at:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'waiting for Alt+click to set start point');
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
                console.log('[DEBUG] Brush operation inverted to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
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
        // Restore original brushOperation if it was inverted
        if (originalBrushOperation !== null) {
            controls.brushOperation = originalBrushOperation;
            originalBrushOperation = null;
            console.log('[DEBUG] Brush operation restored to:', controls.brushOperation === 0 ? 'Add' : 'Subtract');
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
        // Secondary modifier is pressed - read target height from CPU buffer at brush center
        const brushX = Math.floor(pos[0] * context.simres);
        const brushY = Math.floor(pos[1] * context.simres);
        const pixelIndex = (brushY * context.simres + brushX) * 4;
        
        if (pixelIndex >= 0 && pixelIndex < context.HightMapCpuBuf.length) {
            const heightValue = context.HightMapCpuBuf[pixelIndex]; // R channel = height
            controls.flattenTargetHeight = heightValue;
            console.log('[DEBUG] Flatten (tick loop) - Target height updated to:', heightValue, 'at UV:', pos[0], pos[1]);
        } else {
            console.log('[DEBUG] Flatten (tick loop) - FAILED to read height, pixelIndex:', pixelIndex);
        }
    }
    
    // Debug flatten brush target height when active
    if (brushTypeNum === 5 && controls.brushPressed === 1) {
        console.log('[DEBUG] Flatten brush active - brushOperation:', controls.brushOperation, 'Target height:', controls.flattenTargetHeight);
        
        if (controls.brushOperation === 0) {
            console.log('[DEBUG] Flatten brush active - Primary button, flattening to target:', controls.flattenTargetHeight);
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

