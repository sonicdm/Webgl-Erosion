import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec4 } from 'three/tsl';

/**
 * Minimal terrain material for perf experiments only.
 * Use ?terrainMaterial=basic to replace terrain with this (no PBR, no textures).
 * If FPS improves, the draw-path bottleneck is the Standard material / lighting path.
 */
export class TerrainBasicMaterialNode extends MeshBasicNodeMaterial {
    constructor() {
        super();
        this.colorNode = vec4(0.2, 0.5, 0.2, 1);
    }
}
