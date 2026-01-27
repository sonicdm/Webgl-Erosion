/**
 * Holds client-side UI state.
 * This is the single source of truth for client-related state.
 */
export class ClientStateHolder {
    // Client dimensions
    public clientWidth: number = 0;
    public clientHeight: number = 0;
    
    // Last mouse position in client coordinates (pixels)
    public lastX: number = 0;
    public lastY: number = 0;
    
    setClientDimensions(width: number, height: number): void {
        this.clientWidth = width;
        this.clientHeight = height;
    }
    
    setLastMousePosition(x: number, y: number): void {
        this.lastX = x;
        this.lastY = y;
    }
}
