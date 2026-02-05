import type { AppContext } from '../context';
import type { IAppControls } from '../controls/types';
import type { ControlsConfig } from '../../controls-config';
import { getMouseButtonAction, isModifierPressed } from '../../controls-config';
import { getOriginalBrushOperation, setOriginalBrushOperation } from '../../brush-handler';
import { updatePaletteSelection } from '../../brush-palette';

export interface EventHandlers {
    onKeyDown: (e: KeyboardEvent) => void;
    onKeyUp: (e: KeyboardEvent) => void;
    onMouseDown: (e: PointerEvent) => void;
    onMouseUp: (e: PointerEvent) => void;
}

/**
 * Owns all DOM event listeners (pointer, keyboard, wheel).
 * Registers on construction; call dispose() to remove everything.
 */
export class InputManager {
    private abortController = new AbortController();

    constructor(
        private canvas: HTMLCanvasElement,
        private appContext: AppContext,
        private getControls: () => IAppControls,
        private controlsConfig: ControlsConfig,
        private eventHandlers: EventHandlers,
    ) {
        this.setupListeners();
    }

    dispose(): void {
        this.abortController.abort();
    }

    private setupListeners(): void {
        const { signal } = this.abortController;
        const canvas = this.canvas;
        const appCtx = this.appContext;

        // Keyboard
        document.addEventListener('keydown', this.eventHandlers.onKeyDown, { signal });
        document.addEventListener('keyup', this.eventHandlers.onKeyUp, { signal });

        // Pointer down — brush activation intercepts before OrbitControls
        window.addEventListener('pointerdown', (e) => {
            const target = e.target as HTMLElement;
            const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
            if (isCanvas) {
                appCtx.simulationState.setLastMousePosition(e.clientX, e.clientY);
                appCtx.clientState.setLastMousePosition(e.clientX, e.clientY);

                const action = getMouseButtonAction(e.button, this.controlsConfig);
                if (action === 'brushActivate') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    this.eventHandlers.onMouseDown(e);
                    return;
                }
            }
        }, { capture: true, signal });

        // Pointer up
        window.addEventListener('pointerup', (e) => {
            const target = e.target as HTMLElement;
            if (target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas) {
                const action = getMouseButtonAction(e.button, this.controlsConfig);
                if (action === 'brushActivate') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    this.eventHandlers.onMouseUp(e);
                }
            }
        }, { capture: true, signal });

        // Pointer move — brush position + modifier inversion
        window.addEventListener('pointermove', (e) => {
            const target = e.target as HTMLElement;
            const isCanvas = target === canvas || target.id === 'canvas' || target.closest('#canvas') === canvas;
            if (isCanvas) {
                appCtx.simulationState.setLastMousePosition(e.clientX, e.clientY);
                appCtx.clientState.setLastMousePosition(e.clientX, e.clientY);

                const controls = this.getControls();
                if (controls.brushPressed === 1) {
                    const invertModifier = this.controlsConfig.modifiers.brushInvert;
                    if (invertModifier) {
                        const modifierPressed = isModifierPressed(invertModifier, e);
                        if (modifierPressed && getOriginalBrushOperation() === null) {
                            setOriginalBrushOperation(controls.brushOperation);
                            controls.brushOperation = controls.brushOperation === 0 ? 1 : 0;
                        } else if (!modifierPressed && getOriginalBrushOperation() !== null) {
                            const original = getOriginalBrushOperation();
                            if (original !== null) {
                                controls.brushOperation = original;
                                setOriginalBrushOperation(null);
                            }
                        }
                    }
                }
            }
        }, { capture: true, signal });

        // Pointer cancel
        window.addEventListener('pointercancel', () => {
            const controls = this.getControls();
            if (controls.brushPressed === 1) {
                controls.brushPressed = 0;
            }
        }, { capture: true, signal });

        // Wheel — brush size adjustment with modifier
        canvas.addEventListener('wheel', (e) => {
            const scrollModifier = this.controlsConfig.modifiers.brushSizeScroll;
            if (!scrollModifier) return;

            const modifierPressed = isModifierPressed(scrollModifier, e);
            if (modifierPressed) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const controls = this.getControls();
                const sizeChange = e.deltaY * 0.002;
                const newSize = controls.brushSize - sizeChange;
                controls.brushSize = Math.round(Math.max(0.1, Math.min(20.0, newSize)) * 100) / 100;

                const brushSizeCtrl = (window as any).brushSizeController;
                if (brushSizeCtrl) brushSizeCtrl.updateDisplay();

                const brushPalette = (window as any).brushPalette;
                if (brushPalette) updatePaletteSelection(brushPalette, controls);
            }
        }, { capture: true, passive: false, signal } as any);
    }
}
