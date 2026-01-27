import { MeshBasicNodeMaterial } from 'three/webgpu';

/**
 * Terrain material using Three.js NodeMaterial (TSL).
 * This is a scaffolding implementation for Phase 2.
 * Full TSL implementation will be completed in later phases.
 * 
 * For Phase 2 acceptance: NodeMaterial renders with WebGPU backend
 */
export class TerrainMaterialNode extends MeshBasicNodeMaterial {
    constructor() {
        super();
        
        // Set a simple color (red for visibility)
        // This demonstrates NodeMaterial working with WebGPU backend
        this.color.setRGB(1.0, 0.0, 0.0); // Red color
    }
}
