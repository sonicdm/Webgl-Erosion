// Brush Palette UI - Quick access to brush types without going to terrain editor

import { ControlsConfig } from './controls-config';

export interface BrushPaletteControls {
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
    flattenTargetHeight?: number;
    slopeActive?: number;
    slopeStartPos?: { x: number; y: number };
    slopeEndPos?: { x: number; y: number };
}

// Type for objects that have at least the brush palette controls
export type BrushPaletteControlsLike = {
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
    flattenTargetHeight?: number;
    slopeActive?: number;
    slopeStartPos?: any; // Can be vec2 or { x: number; y: number }
    slopeEndPos?: any; // Can be vec2 or { x: number; y: number }
    [key: string]: any; // Allow additional properties
}

export interface BrushType {
    id: number;
    name: string;
    icon?: string; // Optional icon/emoji for visual representation
    color?: string; // Optional color for the button
    shortcut?: string; // Keyboard shortcut key
    description?: string; // Tooltip description
}

// Brush type definitions
export const BRUSH_TYPES: BrushType[] = [
    { id: 0, name: 'None', icon: '🚫', color: '#666', shortcut: '0', description: 'Disable brush' },
    { id: 1, name: 'Terrain', icon: '⛰️', color: '#8B4513', shortcut: '1', description: 'Modify terrain height' },
    { id: 2, name: 'Water', icon: '💧', color: '#4A90E2', shortcut: '2', description: 'Add/remove water' },
    { id: 3, name: 'Rock', icon: '🪨', color: '#555', shortcut: '3', description: 'Place erosion-resistant rock' },
    { id: 4, name: 'Smooth', icon: '✨', color: '#9B59B6', shortcut: '4', description: 'Smooth terrain surface' },
    { id: 5, name: 'Flatten', icon: '📐', color: '#F39C12', shortcut: '5', description: 'Flatten to target height' },
    { id: 6, name: 'Slope', icon: '📉', color: '#27AE60', shortcut: '6', description: 'Create slope between two points' },
];

// Brush size presets
export const BRUSH_SIZE_PRESETS = [
    { name: 'Tiny', value: 0.5 },
    { name: 'Small', value: 1.0 },
    { name: 'Medium', value: 4.0 },
    { name: 'Large', value: 8.0 },
    { name: 'Huge', value: 15.0 },
];

// Brush strength presets
export const BRUSH_STRENGTH_PRESETS = [
    { name: 'Weak', value: 0.1 },
    { name: 'Normal', value: 0.25 },
    { name: 'Strong', value: 0.5 },
    { name: 'Very Strong', value: 1.0 },
];

/**
 * Create and return the brush palette HTML element
 */
export function createBrushPalette(
    controls: BrushPaletteControlsLike,
    onBrushChange: (brushType: number) => void,
    onSizeChange: (size: number) => void,
    onStrengthChange: (strength: number) => void,
    onOperationChange: (operation: number) => void
): HTMLElement {
    const palette = document.createElement('div');
    palette.id = 'brush-palette';
    let isMinimized = false;
    
    // Main container styles
    palette.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(30, 30, 30, 0.95);
        border: 2px solid #555;
        border-radius: 8px;
        padding: 15px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        font-family: 'Segoe UI', Arial, sans-serif;
        min-width: 200px;
        max-width: 220px;
        user-select: none;
        transition: all 0.3s ease;
    `;

    // Make palette draggable
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    const handleMouseDown = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, select, label')) {
            return; // Don't drag if clicking on controls
        }
        isDragging = true;
        const rect = palette.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        palette.style.cursor = 'grabbing';
    };
    
    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            palette.style.left = `${e.clientX - dragOffset.x}px`;
            palette.style.top = `${e.clientY - dragOffset.y}px`;
        }
    };
    
    const handleMouseUp = () => {
        isDragging = false;
        palette.style.cursor = 'default';
    };
    
    palette.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Header with title and minimize button
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
        cursor: move;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Brush Palette';
    title.style.cssText = `
        color: #fff;
        font-weight: bold;
        font-size: 16px;
        flex: 1;
    `;
    header.appendChild(title);
    
    // Minimize/Maximize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.textContent = '−';
    minimizeBtn.style.cssText = `
        background: transparent;
        border: 1px solid #555;
        color: #ccc;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        const content = palette.querySelector('.palette-content') as HTMLElement;
        if (content) {
            content.style.display = isMinimized ? 'none' : 'flex';
            minimizeBtn.textContent = isMinimized ? '+' : '−';
        }
    });
    header.appendChild(minimizeBtn);
    palette.appendChild(header);

    // Content container (can be hidden when minimized)
    const content = document.createElement('div');
    content.className = 'palette-content';
    content.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    // Brush type buttons section
    const brushSection = document.createElement('div');
    brushSection.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
    `;
    
    const brushLabel = document.createElement('div');
    brushLabel.textContent = 'Brush Type:';
    brushLabel.style.cssText = `
        color: #aaa;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
    `;
    brushSection.appendChild(brushLabel);

    // Create buttons for each brush type
    BRUSH_TYPES.forEach(brush => {
        const button = document.createElement('button');
        button.className = 'brush-type-button';
        button.setAttribute('data-brush-id', brush.id.toString());
        const shortcutText = brush.shortcut ? ` [${brush.shortcut}]` : '';
        button.textContent = `${brush.icon || ''} ${brush.name}${shortcutText}`;
        button.title = brush.description || brush.name; // Tooltip
        button.style.cssText = `
            padding: 8px 12px;
            border: 2px solid ${brush.color || '#666'};
            background: ${controls.brushType === brush.id ? brush.color || '#666' : 'transparent'};
            color: ${controls.brushType === brush.id ? '#fff' : brush.color || '#ccc'};
            cursor: pointer;
            border-radius: 4px;
            font-size: 12px;
            transition: all 0.2s;
            text-align: left;
            position: relative;
        `;

        // Update button style on hover
        button.addEventListener('mouseenter', () => {
            if (controls.brushType !== brush.id) {
                button.style.background = `${brush.color || '#666'}33`;
                button.style.transform = 'translateX(2px)';
            }
        });
        button.addEventListener('mouseleave', () => {
            if (controls.brushType !== brush.id) {
                button.style.background = 'transparent';
                button.style.transform = 'translateX(0)';
            }
        });

        // Handle click
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onBrushChange(brush.id);
            updatePaletteSelection(palette, controls);
        });

        brushSection.appendChild(button);
    });
    content.appendChild(brushSection);

    // Add separator
    const separator = document.createElement('div');
    separator.style.cssText = `
        border-top: 1px solid #555;
        margin: 5px 0;
    `;
    content.appendChild(separator);

    // Brush Size control with presets
    const sizeContainer = document.createElement('div');
    sizeContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 5px;
    `;
    
    const sizeHeader = document.createElement('div');
    sizeHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
    `;
    
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = `Size: ${controls.brushSize.toFixed(1)}`;
    sizeLabel.style.cssText = `
        color: #ccc;
        font-size: 12px;
        font-weight: 500;
    `;
    sizeHeader.appendChild(sizeLabel);
    
    // Size preset buttons
    const sizePresets = document.createElement('div');
    sizePresets.style.cssText = `
        display: flex;
        gap: 2px;
    `;
    BRUSH_SIZE_PRESETS.forEach(preset => {
        const presetBtn = document.createElement('button');
        presetBtn.textContent = preset.name[0];
        presetBtn.title = `${preset.name}: ${preset.value}`;
        presetBtn.style.cssText = `
            width: 20px;
            height: 20px;
            padding: 0;
            font-size: 9px;
            background: ${Math.abs(controls.brushSize - preset.value) < 0.1 ? '#4A90E2' : '#333'};
            border: 1px solid #555;
            color: #ccc;
            border-radius: 3px;
            cursor: pointer;
        `;
        presetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onSizeChange(preset.value);
            updatePaletteSelection(palette, controls);
        });
        sizePresets.appendChild(presetBtn);
    });
    sizeHeader.appendChild(sizePresets);
    sizeContainer.appendChild(sizeHeader);
    
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = '0.1';
    sizeInput.max = '20.0';
    sizeInput.step = '0.1';
    sizeInput.value = controls.brushSize.toString();
    sizeInput.style.cssText = `
        width: 100%;
        cursor: pointer;
    `;
    sizeInput.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        sizeLabel.textContent = `Size: ${value.toFixed(1)}`;
        onSizeChange(value);
    });
    sizeContainer.appendChild(sizeInput);
    content.appendChild(sizeContainer);

    // Brush Strength control with presets
    const strengthContainer = document.createElement('div');
    strengthContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 5px;
    `;
    
    const strengthHeader = document.createElement('div');
    strengthHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
    `;
    
    const strengthLabel = document.createElement('label');
    strengthLabel.textContent = `Strength: ${controls.brushStrenth.toFixed(2)}`;
    strengthLabel.style.cssText = `
        color: #ccc;
        font-size: 12px;
        font-weight: 500;
    `;
    strengthHeader.appendChild(strengthLabel);
    
    // Strength preset buttons
    const strengthPresets = document.createElement('div');
    strengthPresets.style.cssText = `
        display: flex;
        gap: 2px;
    `;
    BRUSH_STRENGTH_PRESETS.forEach(preset => {
        const presetBtn = document.createElement('button');
        presetBtn.textContent = preset.name[0];
        presetBtn.title = `${preset.name}: ${preset.value}`;
        presetBtn.style.cssText = `
            width: 20px;
            height: 20px;
            padding: 0;
            font-size: 9px;
            background: ${Math.abs(controls.brushStrenth - preset.value) < 0.01 ? '#4A90E2' : '#333'};
            border: 1px solid #555;
            color: #ccc;
            border-radius: 3px;
            cursor: pointer;
        `;
        presetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onStrengthChange(preset.value);
            updatePaletteSelection(palette, controls);
        });
        strengthPresets.appendChild(presetBtn);
    });
    strengthHeader.appendChild(strengthPresets);
    strengthContainer.appendChild(strengthHeader);
    
    const strengthInput = document.createElement('input');
    strengthInput.type = 'range';
    strengthInput.min = '0.1';
    strengthInput.max = '2.0';
    strengthInput.step = '0.01';
    strengthInput.value = controls.brushStrenth.toString();
    strengthInput.style.cssText = `
        width: 100%;
        cursor: pointer;
    `;
    strengthInput.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        strengthLabel.textContent = `Strength: ${value.toFixed(2)}`;
        onStrengthChange(value);
    });
    strengthContainer.appendChild(strengthInput);
    content.appendChild(strengthContainer);

    // Add/Subtract toggle with better styling
    const operationContainer = document.createElement('div');
    operationContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 5px;
    `;
    
    const operationLabel = document.createElement('label');
    operationLabel.textContent = 'Operation:';
    operationLabel.style.cssText = `
        color: #ccc;
        font-size: 12px;
        font-weight: 500;
    `;
    operationContainer.appendChild(operationLabel);
    
    // Toggle buttons instead of dropdown
    const operationToggle = document.createElement('div');
    operationToggle.style.cssText = `
        display: flex;
        gap: 4px;
    `;
    
    const addBtn = document.createElement('button');
    addBtn.className = 'operation-add-btn';
    addBtn.textContent = '➕ Add';
    addBtn.style.cssText = `
        flex: 1;
        padding: 6px;
        background: ${controls.brushOperation === 0 ? '#27AE60' : '#333'};
        border: 1px solid ${controls.brushOperation === 0 ? '#27AE60' : '#555'};
        color: #fff;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
    `;
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Update controls object first
        controls.brushOperation = 0;
        // Then call the callback to update dat-gui
        onOperationChange(0);
        // Refresh palette visual state
        updatePaletteSelection(palette, controls);
    });
    
    const subtractBtn = document.createElement('button');
    subtractBtn.className = 'operation-subtract-btn';
    subtractBtn.textContent = '➖ Subtract';
    subtractBtn.style.cssText = `
        flex: 1;
        padding: 6px;
        background: ${controls.brushOperation === 1 ? '#E74C3C' : '#333'};
        border: 1px solid ${controls.brushOperation === 1 ? '#E74C3C' : '#555'};
        color: #fff;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
    `;
    subtractBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Update controls object first
        controls.brushOperation = 1;
        // Then call the callback to update dat-gui
        onOperationChange(1);
        // Refresh palette visual state
        updatePaletteSelection(palette, controls);
    });
    
    operationToggle.appendChild(addBtn);
    operationToggle.appendChild(subtractBtn);
    operationContainer.appendChild(operationToggle);
    content.appendChild(operationContainer);

    // Special controls for Flatten brush
    if (controls.flattenTargetHeight !== undefined) {
        const flattenContainer = document.createElement('div');
        flattenContainer.id = 'flatten-controls';
        flattenContainer.style.cssText = `
            display: ${controls.brushType === 5 ? 'flex' : 'none'};
            flex-direction: column;
            gap: 5px;
            padding-top: 8px;
            border-top: 1px solid #555;
        `;
        
        const flattenLabel = document.createElement('label');
        flattenLabel.textContent = `Target Height: ${controls.flattenTargetHeight.toFixed(1)}`;
        flattenLabel.style.cssText = `
            color: #ccc;
            font-size: 11px;
        `;
        flattenContainer.appendChild(flattenLabel);
        
        const flattenInput = document.createElement('input');
        flattenInput.type = 'range';
        flattenInput.min = '0';
        flattenInput.max = '500';
        flattenInput.step = '1';
        flattenInput.value = controls.flattenTargetHeight.toString();
        flattenInput.style.cssText = `width: 100%;`;
        flattenInput.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            flattenLabel.textContent = `Target Height: ${value.toFixed(1)}`;
            if (controls.flattenTargetHeight !== undefined) {
                controls.flattenTargetHeight = value;
            }
        });
        flattenContainer.appendChild(flattenInput);
        content.appendChild(flattenContainer);
    }

    palette.appendChild(content);

    // Add keyboard shortcuts
    const handleKeyPress = (e: KeyboardEvent) => {
        // Only handle if not typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
            return;
        }
        
        const brush = BRUSH_TYPES.find(b => b.shortcut === e.key);
        if (brush) {
            e.preventDefault();
            onBrushChange(brush.id);
            updatePaletteSelection(palette, controls);
        }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    // Store cleanup function
    (palette as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeyPress);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    return palette;
}

/**
 * Update the visual selection state of the palette
 */
export function updatePaletteSelection(
    palette: HTMLElement,
    controls: BrushPaletteControlsLike
): void {
    // Update brush type buttons - only select buttons with the brush-type-button class
    const brushButtons = palette.querySelectorAll('.brush-type-button');
    brushButtons.forEach((button) => {
        const brushId = parseInt((button as HTMLElement).getAttribute('data-brush-id') || '-1');
        const brush = BRUSH_TYPES.find(b => b.id === brushId);
        if (brush) {
            const isSelected = controls.brushType === brush.id;
            (button as HTMLElement).style.background = isSelected ? (brush.color || '#666') : 'transparent';
            (button as HTMLElement).style.color = isSelected ? '#fff' : (brush.color || '#ccc');
        }
    });

    // Update brush size slider and label
    const sizeInput = palette.querySelector('input[type="range"]') as HTMLInputElement;
    const sizeLabel = palette.querySelector('label') as HTMLLabelElement;
    if (sizeInput && sizeLabel && sizeLabel.textContent?.includes('Size:')) {
        sizeInput.value = controls.brushSize.toString();
        sizeLabel.textContent = `Size: ${controls.brushSize.toFixed(1)}`;
        
        // Update size preset buttons
        const sizePresets = Array.from(sizeLabel.parentElement?.querySelectorAll('button') || []) as HTMLButtonElement[];
        sizePresets.forEach((btn, i) => {
            const preset = BRUSH_SIZE_PRESETS[i];
            if (preset) {
                btn.style.background = Math.abs(controls.brushSize - preset.value) < 0.1 ? '#4A90E2' : '#333';
            }
        });
    }

    // Update brush strength slider and label
    const strengthInputs = palette.querySelectorAll('input[type="range"]');
    if (strengthInputs.length >= 2) {
        const strengthInput = strengthInputs[1] as HTMLInputElement;
        strengthInput.value = controls.brushStrenth.toString();
        const strengthLabel = strengthInput.parentElement?.querySelector('label') as HTMLLabelElement;
        if (strengthLabel && strengthLabel.textContent?.includes('Strength:')) {
            strengthLabel.textContent = `Strength: ${controls.brushStrenth.toFixed(2)}`;
            
            // Update strength preset buttons
            const strengthPresets = Array.from(strengthLabel.parentElement?.querySelectorAll('button') || []) as HTMLButtonElement[];
            strengthPresets.forEach((btn, i) => {
                const preset = BRUSH_STRENGTH_PRESETS[i];
                if (preset) {
                    btn.style.background = Math.abs(controls.brushStrenth - preset.value) < 0.01 ? '#4A90E2' : '#333';
                }
            });
        }
    }

    // Update operation buttons - use class selectors for more reliable finding
    const addBtn = palette.querySelector('.operation-add-btn') as HTMLButtonElement;
    const subtractBtn = palette.querySelector('.operation-subtract-btn') as HTMLButtonElement;
    if (addBtn && subtractBtn) {
        addBtn.style.background = controls.brushOperation === 0 ? '#27AE60' : '#333';
        addBtn.style.borderColor = controls.brushOperation === 0 ? '#27AE60' : '#555';
        subtractBtn.style.background = controls.brushOperation === 1 ? '#E74C3C' : '#333';
        subtractBtn.style.borderColor = controls.brushOperation === 1 ? '#E74C3C' : '#555';
    }
    
    // Show/hide flatten controls
    const flattenContainer = palette.querySelector('#flatten-controls') as HTMLElement;
    if (flattenContainer) {
        flattenContainer.style.display = controls.brushType === 5 ? 'flex' : 'none';
    }
}

/**
 * Initialize the brush palette and add it to the document
 */
export function initBrushPalette(
    controls: BrushPaletteControlsLike,
    onBrushChange: (brushType: number) => void,
    onSizeChange: (size: number) => void,
    onStrengthChange: (strength: number) => void,
    onOperationChange: (operation: number) => void
): HTMLElement {
    // Remove existing palette if it exists
    const existing = document.getElementById('brush-palette');
    if (existing) {
        const cleanup = (existing as any).cleanup;
        if (cleanup) cleanup();
        existing.remove();
    }

    const palette = createBrushPalette(controls, onBrushChange, onSizeChange, onStrengthChange, onOperationChange);
    document.body.appendChild(palette);
    return palette;
}
