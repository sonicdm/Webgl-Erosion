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
        console.log('[DEBUG] Secondary modifier detected! brushType:', brushTypeNum);
        
        // Special handling for specific brushes
        console.log('[DEBUG] Checking brush type, current:', controls.brushType, 'as number:', brushTypeNum);
        
        if (brushTypeNum === 5) {
            // Flatten: Secondary modifier+click should set target height and NOT activate brush
            console.log('[DEBUG] Flatten brush detected with secondary modifier! Entering flatten handler');
            // Store original operation if not already stored (for restoration on release)
            if (originalBrushOperation === null) {
                originalBrushOperation = controls.brushOperation;
            }
            controls.brushOperation = 1; // Secondary button (temporary override)
            
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
            // Slope: Alt+click sets START point - DON'T change brushOperation for slope brush
            // Alt is only used to set the start point, not to change operation mode
            console.log('[DEBUG] Slope brush detected with Alt modifier - setting START point');
            
            controls.slopeStartPos = vec2.clone(controls.posTemp);
            
            // Check if end point was already set
            if (controls.slopeActive >= 1 && !vec2.equals(controls.slopeEndPos, vec2.fromValues(0.0, 0.0))) {
                // End point was already set, now start is set - activate slope creation
                controls.slopeActive = 2;
                console.log('[DEBUG] Both points set - START at:', controls.slopeStartPos[0], controls.slopeStartPos[1], 'END at:', controls.slopeEndPos[0], controls.slopeEndPos[1]);
                // Continue to activate brush (brushPressed = 1 is already set above)
                // Keep brushOperation as set by palette - don't override it
            } else {
                // No end point set yet, just set start point and wait
                controls.slopeActive = 1;
                console.log('[DEBUG] Slope START point set at UV:', controls.slopeStartPos[0], controls.slopeStartPos[1], 'waiting for end point');
                // Just set the point, don't activate brush yet
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            }
        } else {
            // For other brushes, Alt modifier sets brushOperation to 1 (subtract)
            console.log('[DEBUG] Other brush with Alt modifier - setting brushOperation to 1 (secondary)');
            // Store original operation if not already stored (for restoration on release)
            if (originalBrushOperation === null) {
                originalBrushOperation = controls.brushOperation;
            }
            controls.brushOperation = 1; // Secondary button (temporary override)
        }
    } else {
        console.log('[DEBUG] No secondary modifier - preserving palette brushOperation setting:', controls.brushOperation, 'brushType:', brushTypeNum);
        // Don't override brushOperation - preserve the value set by palette
        // The palette setting should be respected unless a modifier is used
        
        // Handle slope brush end point (primary click)
        if (brushTypeNum === 6) {
            console.log('[DEBUG] Slope brush primary click handler - setting/updating END point');
            controls.slopeEndPos = vec2.clone(controls.posTemp);
            
            // If both points were set and brush was active, just update the end point and deactivate
            // This allows setting a new end point without activating the brush
            if (controls.slopeActive === 2) {
                console.log('[DEBUG] Updating END point to:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'keeping START point, waiting for Alt+click to activate');
                // Keep slopeActive at 2 so both points remain set, but don't activate brush
                // User can now Alt+click to set a new start point and drag
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            } else if (controls.slopeActive === 1 && !vec2.equals(controls.slopeStartPos, vec2.fromValues(0.0, 0.0))) {
                // Start point was already set, now end point is set - activate slope creation
                controls.slopeActive = 2;
                console.log('[DEBUG] Both points set - END at:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'START at:', controls.slopeStartPos[0], controls.slopeStartPos[1]);
                // Continue to activate brush (brushPressed = 1 is already set above)
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
        // For slope brush, keep both points set after releasing (slopeActive stays at 2)
        // This allows setting a new start point with Alt+click without needing to set end point again
        const brushTypeNum = Number(controls.brushType);
        if (brushTypeNum === 6 && controls.slopeActive === 2) {
            console.log('[DEBUG] Slope brush released - keeping both points set, ready for new Alt+click');
            // slopeActive stays at 2, so both points remain available
        }
        
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

