import { vec2 } from 'gl-matrix';
import { 
    getKeyAction, 
    getMouseButtonAction, 
    isBrushActivate, 
    ControlsConfig, 
    isModifierPressed 
} from '../controls-config';
import { 
    handleBrushMouseDown, 
    handleBrushMouseUp, 
    BrushContext, 
    BrushControls,
    getOriginalBrushOperation,
    setOriginalBrushOperation
} from '../brush-handler';
import { 
    MAX_WATER_SOURCES,
    addWaterSource,
    removeNearestWaterSource,
    clearAllWaterSources,
    getWaterSourceCount
} from '../utils/water-sources';
import { simres, HightMapCpuBuf } from '../simulation/simulation-state';
import Camera from '../Camera';

export interface Controls {
    [key: string]: any;
    brushPressed: number;
    brushOperation: number;
    brushSize: number;
    brushStrenth: number;
    brushType: number;
    posTemp: vec2;
    sourceCount: number;
    flattenTargetHeight: number;
    slopeStartPos: vec2;
    slopeEndPos: vec2;
    slopeActive: number;
}

export interface EventHandlers {
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
    onMouseDown: (event: MouseEvent | PointerEvent) => void;
    onMouseUp: (event: MouseEvent | PointerEvent) => void;
}

export function createEventHandlers(
    controls: Controls,
    controlsConfig: ControlsConfig,
    camera: Camera
): EventHandlers {
    function onKeyDown(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        const action = getKeyAction(key, controlsConfig);
        
        // Track WASD movement keys (don't interfere with brush controls)
        if (controlsConfig.camera.movement.enableWASD) {
            if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
                camera.addMovementKey(key);
            }
            // Space for up movement
            if (key === ' ' && controlsConfig.camera.movement.enableVerticalMovement) {
                camera.addMovementKey(' ');
            }
            // Shift for down movement (only if not used as brush modifier)
            if (key === 'shift' && controlsConfig.camera.movement.enableVerticalMovement) {
                // Only add if Shift is not being used as a brush modifier
                if (controlsConfig.modifiers.brushInvert !== 'Shift' && 
                    controlsConfig.modifiers.brushSizeScroll !== 'Shift' &&
                    controlsConfig.modifiers.brushSecondary !== 'Shift') {
                    camera.addMovementKey('shift');
                }
            }
        }
        
        // Check if this key is brushActivate (could be keyboard key OR mouse button string)
        if (isBrushActivate(key, controlsConfig)) {
            controls.brushPressed = 1;
        } else if (action === 'brushActivate') {
            controls.brushPressed = 1;
        } else {
            // Only reset if another key is pressed (not if mouse button is the activator)
            if (controlsConfig.keys.brushActivate !== 'LEFT' && 
                controlsConfig.keys.brushActivate !== 'MIDDLE' && 
                controlsConfig.keys.brushActivate !== 'RIGHT') {
                controls.brushPressed = 0;
            }
        }
        
        // If brush is active, check if modifier is pressed to invert operation
        if (controls.brushPressed === 1) {
            const invertModifier = controlsConfig.modifiers.brushInvert;
            if (invertModifier) {
                const modifierPressed = isModifierPressed(invertModifier, event);
                
                // Check if this is the modifier key being pressed
                const isModifierKey = 
                    (invertModifier === 'Ctrl' && (key === 'control' || key === 'meta')) ||
                    (invertModifier === 'Shift' && key === 'shift') ||
                    (invertModifier === 'Alt' && key === 'alt');
                
                if (isModifierKey && modifierPressed && getOriginalBrushOperation() === null) {
                    // Modifier just pressed while brush is active - invert operation
                    setOriginalBrushOperation(controls.brushOperation);
                    controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
                }
            }
        }

        if (action === 'permanentWaterSource') {
            // Check if Shift is held for removal
            if (event.shiftKey) {
                // Remove nearest source to cursor
                if (removeNearestWaterSource(controls.posTemp)) {
                    controls.sourceCount = getWaterSourceCount();
                    console.log(`Removed water source. Remaining: ${getWaterSourceCount()}`);
                }
            } else {
                // Add new source at cursor position
                if (addWaterSource(controls.posTemp, controls.brushSize, controls.brushStrenth)) {
                    controls.sourceCount = getWaterSourceCount();
                    console.log(`Added water source at (${controls.posTemp[0].toFixed(3)}, ${controls.posTemp[1].toFixed(3)}). Total: ${getWaterSourceCount()}`);
                } else {
                    console.log(`Maximum ${MAX_WATER_SOURCES} water sources reached`);
                }
            }
        }
        
        if (action === 'removePermanentSource') {
            // Remove all sources
            clearAllWaterSources();
            controls.sourceCount = 0;
            console.log('Removed all water sources');
        }
    }

    function onKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        const action = getKeyAction(key, controlsConfig);
        
        // Remove WASD movement keys
        if (controlsConfig.camera.movement.enableWASD) {
            if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
                camera.removeMovementKey(key);
            }
            // Space for up movement
            if (key === ' ') {
                camera.removeMovementKey(' ');
            }
            // Shift for down movement
            if (key === 'shift') {
                camera.removeMovementKey('shift');
            }
        }
        
        // Only deactivate if this key was the brush activator (not if mouse button is the activator)
        if (isBrushActivate(key, controlsConfig) || action === 'brushActivate') {
            controls.brushPressed = 0;
        }
        
        // If brush is active and modifier is released, restore original operation
        if (controls.brushPressed === 1) {
            const invertModifier = controlsConfig.modifiers.brushInvert;
            if (invertModifier) {
                const isModifierKey = 
                    (invertModifier === 'Ctrl' && (key === 'control' || key === 'meta')) ||
                    (invertModifier === 'Shift' && key === 'shift') ||
                    (invertModifier === 'Alt' && key === 'alt');
                
                if (isModifierKey && getOriginalBrushOperation() !== null) {
                    const original = getOriginalBrushOperation();
                    if (original !== null) {
                        controls.brushOperation = original;
                        setOriginalBrushOperation(null);
                    }
                }
            }
        }
    }

    function onMouseDown(event: MouseEvent | PointerEvent) {
        const buttonName = ['LEFT', 'MIDDLE', 'RIGHT'][event.button];
        
        const action = getMouseButtonAction(event.button, controlsConfig);
        
        if (action === 'brushActivate') {
            const brushContext: BrushContext = {
                controls: controls as BrushControls,
                controlsConfig: controlsConfig,
                simres: Number(simres), // Ensure it's a number, not a string
                HightMapCpuBuf: HightMapCpuBuf,
                camera: camera
            };
            
            const result = handleBrushMouseDown(event, brushContext);
            
            if (result.shouldActivate) {
                controls.brushPressed = result.brushPressed;
                // Prevent OrbitControls from handling this event
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return; // Exit early to prevent other handlers
            } else {
                // Brush handler already prevented default and stopped propagation
                return;
            }
        }
    }

    function onMouseUp(event: MouseEvent | PointerEvent) {
        const action = getMouseButtonAction(event.button, controlsConfig);
        
        if (action === 'brushActivate') {
            controls.brushPressed = 0;
            
            const brushContext: BrushContext = {
                controls: controls as BrushControls,
                controlsConfig: controlsConfig,
                simres: Number(simres), // Ensure it's a number, not a string
                HightMapCpuBuf: HightMapCpuBuf,
                camera: camera
            };
            
            handleBrushMouseUp(event, brushContext);
            
            // Prevent OrbitControls from handling this event
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }

    return {
        onKeyDown,
        onKeyUp,
        onMouseDown,
        onMouseUp
    };
}

