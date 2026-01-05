// Brush Palette UI - Quick access to brush types without going to terrain editor

import { ControlsConfig } from './controls-config';

export interface BrushPaletteControls {
    brushType: number;
    brushSize: number;
    brushStrenth: number;
    brushOperation: number;
}

export interface BrushType {
    id: number;
    name: string;
    icon?: string; // Optional icon/emoji for visual representation
    color?: string; // Optional color for the button
}

// Brush type definitions
export const BRUSH_TYPES: BrushType[] = [
    { id: 0, name: 'None', icon: '🚫', color: '#666' },
    { id: 1, name: 'Terrain', icon: '⛰️', color: '#8B4513' },
    { id: 2, name: 'Water', icon: '💧', color: '#4A90E2' },
    { id: 3, name: 'Rock', icon: '🪨', color: '#555' },
    { id: 4, name: 'Smooth', icon: '✨', color: '#9B59B6' },
    { id: 5, name: 'Flatten', icon: '📐', color: '#F39C12' },
    { id: 6, name: 'Slope', icon: '📉', color: '#27AE60' },
];

/**
 * Create and return the brush palette HTML element
 */
export function createBrushPalette(
    controls: BrushPaletteControls,
    onBrushChange: (brushType: number) => void,
    onSizeChange: (size: number) => void,
    onStrengthChange: (strength: number) => void,
    onOperationChange: (operation: number) => void
): HTMLElement {
    const palette = document.createElement('div');
    palette.id = 'brush-palette';
    palette.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(30, 30, 30, 0.9);
        border: 2px solid #555;
        border-radius: 8px;
        padding: 15px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        font-family: Arial, sans-serif;
        min-width: 180px;
    `;

    // Add title
    const title = document.createElement('div');
    title.textContent = 'Brush Palette';
    title.style.cssText = `
        color: #fff;
        font-weight: bold;
        margin-bottom: 5px;
        text-align: center;
        font-size: 16px;
        border-bottom: 1px solid #555;
        padding-bottom: 8px;
    `;
    palette.appendChild(title);

    // Create buttons for each brush type
    BRUSH_TYPES.forEach(brush => {
        const button = document.createElement('button');
        button.textContent = `${brush.icon || ''} ${brush.name}`;
        button.style.cssText = `
            padding: 8px 12px;
            border: 2px solid ${brush.color || '#666'};
            background: ${controls.brushType === brush.id ? brush.color || '#666' : 'transparent'};
            color: ${controls.brushType === brush.id ? '#fff' : brush.color || '#ccc'};
            cursor: pointer;
            border-radius: 4px;
            font-size: 12px;
            transition: all 0.2s;
            min-width: 100px;
            text-align: left;
        `;

        // Update button style on hover
        button.addEventListener('mouseenter', () => {
            if (controls.brushType !== brush.id) {
                button.style.background = `${brush.color || '#666'}33`; // 33 = 20% opacity
            }
        });
        button.addEventListener('mouseleave', () => {
            if (controls.brushType !== brush.id) {
                button.style.background = 'transparent';
            }
        });

        // Handle click
        button.addEventListener('click', () => {
            onBrushChange(brush.id);
            updatePaletteSelection(palette, controls);
        });

        palette.appendChild(button);
    });

    // Add separator
    const separator = document.createElement('div');
    separator.style.cssText = `
        border-top: 1px solid #555;
        margin: 5px 0;
    `;
    palette.appendChild(separator);

    // Brush Size control
    const sizeContainer = document.createElement('div');
    sizeContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 5px;
    `;
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = `Brush Size: ${controls.brushSize.toFixed(1)}`;
    sizeLabel.style.cssText = `
        color: #ccc;
        font-size: 12px;
    `;
    sizeContainer.appendChild(sizeLabel);
    
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = '0.1';
    sizeInput.max = '20.0';
    sizeInput.step = '0.1';
    sizeInput.value = controls.brushSize.toString();
    sizeInput.style.cssText = `
        width: 100%;
    `;
    sizeInput.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        sizeLabel.textContent = `Brush Size: ${value.toFixed(1)}`;
        onSizeChange(value);
    });
    sizeContainer.appendChild(sizeInput);
    palette.appendChild(sizeContainer);

    // Brush Strength control
    const strengthContainer = document.createElement('div');
    strengthContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 5px;
    `;
    const strengthLabel = document.createElement('label');
    strengthLabel.textContent = `Brush Strength: ${controls.brushStrenth.toFixed(2)}`;
    strengthLabel.style.cssText = `
        color: #ccc;
        font-size: 12px;
    `;
    strengthContainer.appendChild(strengthLabel);
    
    const strengthInput = document.createElement('input');
    strengthInput.type = 'range';
    strengthInput.min = '0.1';
    strengthInput.max = '2.0';
    strengthInput.step = '0.01';
    strengthInput.value = controls.brushStrenth.toString();
    strengthInput.style.cssText = `
        width: 100%;
    `;
    strengthInput.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        strengthLabel.textContent = `Brush Strength: ${value.toFixed(2)}`;
        onStrengthChange(value);
    });
    strengthContainer.appendChild(strengthInput);
    palette.appendChild(strengthContainer);

    // Add/Subtract toggle
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
    `;
    operationContainer.appendChild(operationLabel);
    
    const operationSelect = document.createElement('select');
    operationSelect.style.cssText = `
        width: 100%;
        padding: 5px;
        background: #222;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        font-size: 12px;
    `;
    const addOption = document.createElement('option');
    addOption.value = '0';
    addOption.textContent = 'Add';
    const subtractOption = document.createElement('option');
    subtractOption.value = '1';
    subtractOption.textContent = 'Subtract';
    operationSelect.appendChild(addOption);
    operationSelect.appendChild(subtractOption);
    operationSelect.value = controls.brushOperation.toString();
    operationSelect.addEventListener('change', (e) => {
        const value = parseInt((e.target as HTMLSelectElement).value);
        onOperationChange(value);
    });
    operationContainer.appendChild(operationSelect);
    palette.appendChild(operationContainer);

    return palette;
}

/**
 * Update the visual selection state of the palette
 */
export function updatePaletteSelection(
    palette: HTMLElement,
    controls: BrushPaletteControls
): void {
    // Update brush type buttons
    const buttons = palette.querySelectorAll('button');
    buttons.forEach((button, index) => {
        const brush = BRUSH_TYPES[index];
        if (brush) {
            const isSelected = controls.brushType === brush.id;
            button.style.background = isSelected ? (brush.color || '#666') : 'transparent';
            button.style.color = isSelected ? '#fff' : (brush.color || '#ccc');
        }
    });

    // Update brush size slider and label
    const sizeInput = palette.querySelector('input[type="range"]') as HTMLInputElement;
    const sizeLabel = palette.querySelector('label') as HTMLLabelElement;
    if (sizeInput && sizeLabel && sizeLabel.textContent?.startsWith('Brush Size:')) {
        sizeInput.value = controls.brushSize.toString();
        sizeLabel.textContent = `Brush Size: ${controls.brushSize.toFixed(1)}`;
    }

    // Update brush strength slider and label
    const strengthInputs = palette.querySelectorAll('input[type="range"]');
    if (strengthInputs.length >= 2) {
        const strengthInput = strengthInputs[1] as HTMLInputElement;
        strengthInput.value = controls.brushStrenth.toString();
        const strengthLabel = strengthInput.previousElementSibling as HTMLLabelElement;
        if (strengthLabel && strengthLabel.textContent?.startsWith('Brush Strength:')) {
            strengthLabel.textContent = `Brush Strength: ${controls.brushStrenth.toFixed(2)}`;
        }
    }

    // Update operation select
    const operationSelect = palette.querySelector('select') as HTMLSelectElement;
    if (operationSelect) {
        operationSelect.value = controls.brushOperation.toString();
    }
}

/**
 * Initialize the brush palette and add it to the document
 */
export function initBrushPalette(
    controls: BrushPaletteControls,
    onBrushChange: (brushType: number) => void,
    onSizeChange: (size: number) => void,
    onStrengthChange: (strength: number) => void,
    onOperationChange: (operation: number) => void
): HTMLElement {
    // Remove existing palette if it exists
    const existing = document.getElementById('brush-palette');
    if (existing) {
        existing.remove();
    }

    const palette = createBrushPalette(controls, onBrushChange, onSizeChange, onStrengthChange, onOperationChange);
    document.body.appendChild(palette);
    return palette;
}

