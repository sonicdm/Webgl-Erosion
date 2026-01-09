// Settings management - handles loading/saving control bindings
// 
// This system allows control bindings to be:
// 1. Loaded from localStorage on startup (persists across sessions)
// 2. Saved to localStorage when changed
// 3. Exported/imported as JSON files
// 4. Reset to defaults
//
// Future UI rebinding:
// - Call loadSettings() to get current config
// - Modify the config object
// - Call saveSettings(config) to persist changes
// - The app will automatically use the new settings on next load
//
// Example usage in UI:
//   import { loadSettings, saveSettings, resetSettings } from './settings';
//   const config = loadSettings();
//   config.keys.brushActivate = 'b'; // Change binding
//   saveSettings(config); // Save to localStorage

import { ControlsConfig, defaultControlsConfig } from './controls-config';

const SETTINGS_STORAGE_KEY = 'webgl-erosion-controls';

/**
 * Load settings from localStorage, falling back to defaults if not found or invalid
 */
export function loadSettings(): ControlsConfig {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate and merge with defaults to ensure all fields exist
            return mergeWithDefaults(parsed);
        }
    } catch (error) {
        console.warn('[Settings] Failed to load settings from localStorage:', error);
    }
    
    // Return defaults if nothing stored or error occurred
    return defaultControlsConfig;
}

/**
 * Save settings to localStorage
 */
export function saveSettings(config: ControlsConfig): void {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config, null, 2));
        console.log('[Settings] Settings saved successfully');
    } catch (error) {
        console.error('[Settings] Failed to save settings to localStorage:', error);
    }
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): ControlsConfig {
    try {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        console.log('[Settings] Settings reset to defaults');
    } catch (error) {
        console.error('[Settings] Failed to reset settings:', error);
    }
    return defaultControlsConfig;
}

/**
 * Merge loaded settings with defaults to ensure all fields are present
 * This handles cases where new fields are added to ControlsConfig
 */
function mergeWithDefaults(loaded: any): ControlsConfig {
    const merged: ControlsConfig = {
        keys: {
            brushActivate: loaded.keys?.brushActivate ?? defaultControlsConfig.keys.brushActivate,
            permanentWaterSource: loaded.keys?.permanentWaterSource ?? defaultControlsConfig.keys.permanentWaterSource,
            removePermanentSource: loaded.keys?.removePermanentSource ?? defaultControlsConfig.keys.removePermanentSource,
        },
        mouse: {
            brushActivate: loaded.mouse?.brushActivate ?? defaultControlsConfig.mouse.brushActivate,
        },
        modifiers: {
            brushSizeScroll: loaded.modifiers?.brushSizeScroll ?? defaultControlsConfig.modifiers.brushSizeScroll,
            brushInvert: loaded.modifiers?.brushInvert ?? defaultControlsConfig.modifiers.brushInvert,
            brushSecondary: loaded.modifiers?.brushSecondary ?? defaultControlsConfig.modifiers.brushSecondary,
        },
        camera: {
            rotateButton: loaded.camera?.rotateButton ?? defaultControlsConfig.camera.rotateButton,
            panButton: loaded.camera?.panButton ?? defaultControlsConfig.camera.panButton,
            rotateSpeed: loaded.camera?.rotateSpeed ?? defaultControlsConfig.camera.rotateSpeed,
            zoomSpeed: loaded.camera?.zoomSpeed ?? defaultControlsConfig.camera.zoomSpeed,
            panSpeed: loaded.camera?.panSpeed ?? defaultControlsConfig.camera.panSpeed,
            enableRotate: loaded.camera?.enableRotate ?? defaultControlsConfig.camera.enableRotate,
            enablePan: loaded.camera?.enablePan ?? defaultControlsConfig.camera.enablePan,
            enableZoom: loaded.camera?.enableZoom ?? defaultControlsConfig.camera.enableZoom,
            enableDamping: loaded.camera?.enableDamping ?? defaultControlsConfig.camera.enableDamping,
            dampingFactor: loaded.camera?.dampingFactor ?? defaultControlsConfig.camera.dampingFactor,
            movement: {
                enableWASD: loaded.camera?.movement?.enableWASD ?? defaultControlsConfig.camera.movement.enableWASD,
                moveSpeed: loaded.camera?.movement?.moveSpeed ?? defaultControlsConfig.camera.movement.moveSpeed,
                fastMoveMultiplier: loaded.camera?.movement?.fastMoveMultiplier ?? defaultControlsConfig.camera.movement.fastMoveMultiplier,
                enableVerticalMovement: loaded.camera?.movement?.enableVerticalMovement ?? defaultControlsConfig.camera.movement.enableVerticalMovement,
            },
        },
        raycast: {
            method: loaded.raycast?.method ?? defaultControlsConfig.raycast.method,
        },
    };
    
    return merged;
}

/**
 * Export settings to a JSON string (for file download)
 */
export function exportSettings(config: ControlsConfig): string {
    return JSON.stringify(config, null, 2);
}

/**
 * Import settings from a JSON string (for file upload)
 */
export function importSettings(jsonString: string): ControlsConfig {
    try {
        const parsed = JSON.parse(jsonString);
        const merged = mergeWithDefaults(parsed);
        saveSettings(merged);
        return merged;
    } catch (error) {
        console.error('[Settings] Failed to import settings:', error);
        throw new Error('Invalid settings format');
    }
}

