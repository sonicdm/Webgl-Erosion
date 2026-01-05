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
            // Slope: Secondary modifier+click and drag sets end point
            console.log('[DEBUG] Slope brush detected with secondary modifier');
            if (controls.slopeActive === 0) {
                // Start point should be set by primary click first
                // If secondary modifier is pressed first, don't activate brush
                console.log('[DEBUG] Slope secondary modifier+click - start point not set yet, ignoring');
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            } else if (controls.slopeActive === 1) {
                // Start is set, secondary modifier+click means we're dragging from end
                // Activate brush for slope creation
                controls.slopeActive = 2;
                controls.slopeEndPos = vec2.clone(controls.posTemp);
                console.log('[DEBUG] Slope secondary modifier+click - End point SET at UV:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'Start was at:', controls.slopeStartPos[0], controls.slopeStartPos[1]);
                // Continue to activate brush (brushPressed = 1 is already set above)
            }
        }
    } else {
        console.log('[DEBUG] No secondary modifier - setting brushOperation to 0 (primary), brushType:', brushTypeNum);
        controls.brushOperation = 0; // Primary button
        originalBrushOperation = null;
        
        // Handle slope brush start point (primary click)
        if (brushTypeNum === 6) {
            console.log('[DEBUG] Slope brush primary click handler');
            if (controls.slopeActive === 0) {
                // Set start point on first primary click
                controls.slopeStartPos = vec2.clone(controls.posTemp);
                controls.slopeActive = 1;
                console.log('[DEBUG] Slope start point set at:', controls.slopeStartPos[0], controls.slopeStartPos[1]);
                // Don't activate brush for slope start point - just set the point
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return { shouldActivate: false, brushPressed: 0 };
            }
            // If start is already set, primary click doesn't do anything for slope
            // (Secondary modifier+click is needed to drag from end)
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return { shouldActivate: false, brushPressed: 0 };
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
    
    // Handle slope brush start/end points
    if (brushTypeNum === 6) {
        // Update end point continuously when secondary modifier is held (secondary button drag)
        if (controls.brushPressed === 1 && controls.brushOperation === 1 && controls.slopeActive >= 1) {
            controls.slopeEndPos = vec2.clone(pos); // Update end to current brush position
            if (controls.slopeActive === 1) {
                controls.slopeActive = 2; // Mark as active when dragging
                console.log('[DEBUG] Slope - End point updated to UV:', controls.slopeEndPos[0], controls.slopeEndPos[1], 'Start at:', controls.slopeStartPos[0], controls.slopeStartPos[1]);
            }
            
            // Read heights at start and end for debugging
            const startX = Math.floor(controls.slopeStartPos[0] * context.simres);
            const startY = Math.floor(controls.slopeStartPos[1] * context.simres);
            const endX = Math.floor(controls.slopeEndPos[0] * context.simres);
            const endY = Math.floor(controls.slopeEndPos[1] * context.simres);
            const startIndex = (startY * context.simres + startX) * 4;
            const endIndex = (endY * context.simres + endX) * 4;
            
            if (startIndex >= 0 && startIndex < context.HightMapCpuBuf.length && endIndex >= 0 && endIndex < context.HightMapCpuBuf.length) {
                const startHeight = context.HightMapCpuBuf[startIndex];
                const endHeight = context.HightMapCpuBuf[endIndex];
                console.log('[DEBUG] Slope heights - Start:', startHeight, 'at UV', controls.slopeStartPos[0], controls.slopeStartPos[1], 'End:', endHeight, 'at UV', controls.slopeEndPos[0], controls.slopeEndPos[1]);
            }
        }
    }
}

