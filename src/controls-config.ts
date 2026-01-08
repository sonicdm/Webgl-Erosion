// Controls configuration file - easily rebind keys here
export interface ControlsConfig {
    keys: {
        brushActivate: string;      // Key OR mouse button ('LEFT', 'MIDDLE', 'RIGHT') to hold for brush painting
        permanentWaterSource: string; // Key to toggle permanent water source
        removePermanentSource: string; // Key to remove all permanent sources
    };
    mouse: {
        brushActivate: string | null; // Optional: Mouse button ('LEFT', 'MIDDLE', 'RIGHT') for brush - overrides keys.brushActivate if set
    };
    modifiers: {
        brushSizeScroll: 'Ctrl' | 'Shift' | 'Alt' | null; // Modifier key for brush size adjustment via scroll wheel (null = disabled)
        brushInvert: 'Ctrl' | 'Shift' | 'Alt' | null; // Modifier key to invert brush operation (Add/Subtract) when held with brush activate
        brushSecondary: 'Ctrl' | 'Shift' | 'Alt' | null; // Modifier key for secondary brush operation (e.g., Alt+click for flatten target height, slope end point)
    };
    camera: {
        // Mouse button mappings: 'LEFT', 'MIDDLE', 'RIGHT', or null to disable
        rotateButton: 'LEFT' | 'MIDDLE' | 'RIGHT' | null;
        panButton: 'LEFT' | 'MIDDLE' | 'RIGHT' | null;
        // Speed settings (0.0 to 10.0)
        rotateSpeed: number;
        zoomSpeed: number;
        panSpeed: number;
        // Enable/disable features
        enableRotate: boolean;
        enablePan: boolean;
        enableZoom: boolean;
        // Damping settings
        enableDamping: boolean;
        dampingFactor: number;
        // WASD movement settings
        movement: {
            enableWASD: boolean;           // Enable WASD movement
            moveSpeed: number;              // Base movement speed (units per second)
            fastMoveMultiplier: number;     // Speed multiplier when Shift is held
            enableVerticalMovement: boolean; // Enable Space/Shift for up/down movement
        };
    };
}

// Default key bindings - modify these to rebind controls
export const defaultControlsConfig: ControlsConfig = {
    keys: {
        brushActivate: 'LEFT',              // Keyboard key OR mouse button ('LEFT', 'MIDDLE', 'RIGHT') for brush
        permanentWaterSource: 'r',       // Toggle permanent water source at cursor
        removePermanentSource: 'p',      // Remove all permanent sources
    },
    mouse: {
        // Optional: Set to 'LEFT', 'MIDDLE', or 'RIGHT' to bind mouse button for brush
        // If set, mouse button takes priority. You can also set keys.brushActivate to a keyboard key
        // to have BOTH keyboard and mouse work simultaneously
        brushActivate: null, 
    },
    modifiers: {
        brushSizeScroll: 'Ctrl',      // Hold this modifier + scroll to adjust brush size (Ctrl, Shift, Alt, or null to disable)
        brushInvert: 'Shift',          // Hold this modifier + brush activate to invert operation (Add ↔ Subtract)
        brushSecondary: 'Alt',        // Hold this modifier + brush activate for secondary operation (e.g., flatten target height, slope end point)
    },
    camera: {
        // Default OrbitControls bindings: LEFT = rotate, MIDDLE = pan, RIGHT = rotate (with shift = pan)
        rotateButton: 'RIGHT',            // Mouse button for rotation
        panButton: 'MIDDLE',              // Mouse button for panning
        rotateSpeed: 1.0,                 // Rotation speed multiplier
        zoomSpeed: 1.0,                   // Zoom speed multiplier
        panSpeed: 1.0,                    // Pan speed multiplier
        enableRotate: true,               // Enable rotation
        enablePan: true,                  // Enable panning
        enableZoom: true,                 // Enable zoom (scroll wheel)
        enableDamping: true,              // Enable smooth damping
        dampingFactor: 0.08,             // Damping factor (0.0 to 1.0)
        movement: {
            enableWASD: true,             // Enable WASD movement
            moveSpeed: 0.3,                // Base speed: 0.3 units/second (reduced from 2.0)
            fastMoveMultiplier: 3.0,       // 3x speed with Shift
            enableVerticalMovement: true,   // Space = up, Shift = down
        },
    },
};

// Helper function to check if a key matches any action
export function getKeyAction(key: string, config: ControlsConfig): string | null {
    // Check keyboard keys (not mouse buttons)
    if (key !== 'LEFT' && key !== 'MIDDLE' && key !== 'RIGHT') {
        if (key === config.keys.brushActivate) return 'brushActivate';
        if (key === config.keys.permanentWaterSource) return 'permanentWaterSource';
        if (key === config.keys.removePermanentSource) return 'removePermanentSource';
    }
    return null;
}

// Helper function to check if a mouse button OR keyboard key matches brushActivate
export function isBrushActivate(input: string | number, config: ControlsConfig): boolean {
    if (typeof input === 'number') {
        // Mouse button number: 0 = LEFT, 1 = MIDDLE, 2 = RIGHT
        const buttonMap: { [key: number]: string } = {
            0: 'LEFT',
            1: 'MIDDLE',
            2: 'RIGHT'
        };
        const buttonName = buttonMap[input];
        // Check mouse binding first, then fall back to keys.brushActivate if it's a mouse button
        if (config.mouse.brushActivate) {
            return buttonName === config.mouse.brushActivate;
        }
        // Fall back: if keys.brushActivate is a mouse button string, check that
        return buttonName === config.keys.brushActivate;
    } else {
        // Keyboard key string - check keys.brushActivate (only if it's not a mouse button)
        const key = input.toLowerCase();
        if (config.keys.brushActivate !== 'LEFT' && 
            config.keys.brushActivate !== 'MIDDLE' && 
            config.keys.brushActivate !== 'RIGHT') {
            return key === config.keys.brushActivate;
        }
        return false;
    }
}

// Helper function to check if a mouse button matches any action
export function getMouseButtonAction(button: number, config: ControlsConfig): string | null {
    // Convert button number to string: 0 = LEFT, 1 = MIDDLE, 2 = RIGHT
    const buttonMap: { [key: number]: string } = {
        0: 'LEFT',
        1: 'MIDDLE',
        2: 'RIGHT'
    };
    const buttonName = buttonMap[button];
    console.log('[DEBUG] getMouseButtonAction - button:', button, '-> buttonName:', buttonName, 'mouse.brushActivate:', config.mouse.brushActivate, 'keys.brushActivate:', config.keys.brushActivate);
    
    // Check mouse binding first (takes priority)
    if (config.mouse.brushActivate && buttonName === config.mouse.brushActivate) {
        console.log('[DEBUG] getMouseButtonAction - MATCH (mouse binding)!');
        return 'brushActivate';
    }
    // Fall back to keys.brushActivate if it's a mouse button string
    if (buttonName && config.keys.brushActivate === buttonName) {
        console.log('[DEBUG] getMouseButtonAction - MATCH (key binding)!');
        return 'brushActivate';
    }
    console.log('[DEBUG] getMouseButtonAction - NO MATCH');
    return null;
}

/**
 * Helper function to check if a modifier key is pressed based on the config
 */
export function isModifierPressed(modifier: 'Ctrl' | 'Shift' | 'Alt' | null, event: MouseEvent | PointerEvent | KeyboardEvent): boolean {
    if (modifier === null) return false;
    
    switch (modifier) {
        case 'Ctrl':
            return event.ctrlKey || event.metaKey; // metaKey for Mac Cmd key
        case 'Shift':
            return event.shiftKey;
        case 'Alt':
            return event.altKey;
        default:
            return false;
    }
}

