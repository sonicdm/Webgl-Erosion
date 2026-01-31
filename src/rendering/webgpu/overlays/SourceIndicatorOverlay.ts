import { Scene, Mesh, RingGeometry, DoubleSide, Color } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

export interface SourceIndicatorData {
    position: [number, number]; // UV [0,1]
    size: number;
    worldY: number; // terrain height in world space (height / simres)
}

/**
 * Manages a pool of ring overlay meshes that mark water source positions
 * on the terrain. Uses simple flat-color MeshBasicNodeMaterial (no TSL
 * graph complexity) with depthTest disabled so they render on top.
 *
 * UV→world: PlaneGeometry(1,1) rotated -PI/2 about X →
 *   worldX = u - 0.5, worldZ = 0.5 - v, worldY = small offset
 */
export class SourceIndicatorOverlay {
    private scene: Scene;
    private meshes: Mesh[] = [];
    private material: MeshBasicNodeMaterial;
    private ringGeometry: RingGeometry;

    constructor(scene: Scene) {
        this.scene = scene;

        // Shared material: red-orange, semi-transparent, always on top
        this.material = new MeshBasicNodeMaterial();
        this.material.colorNode = vec3(0.95, 0.25, 0.15);
        this.material.opacityNode = float(0.55);
        this.material.transparent = true;
        this.material.depthTest = false;
        this.material.depthWrite = false;
        this.material.side = DoubleSide;

        // Shared ring geometry: unit ring, scaled per-source
        // innerRadius/outerRadius ratio gives a thin ring
        this.ringGeometry = new RingGeometry(0.85, 1.0, 32);
        this.ringGeometry.rotateX(-Math.PI / 2); // Flat on XZ plane
    }

    /**
     * Update overlay to match current source list.
     * Call each frame (or when sources change).
     */
    update(sources: SourceIndicatorData[]): void {
        // Grow pool if needed
        while (this.meshes.length < sources.length) {
            const mesh = new Mesh(this.ringGeometry, this.material as any);
            mesh.frustumCulled = false;
            mesh.renderOrder = 10; // After terrain + water
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }

        // Position active meshes, hide extras
        for (let i = 0; i < this.meshes.length; i++) {
            const mesh = this.meshes[i];
            if (i < sources.length) {
                const src = sources[i];
                const radius = 0.01 * src.size;
                const worldX = src.position[0] - 0.5;
                const worldZ = 0.5 - src.position[1];
                mesh.position.set(worldX, src.worldY + 0.001, worldZ);
                mesh.scale.set(radius, radius, radius);
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        }
    }

    dispose(): void {
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
        }
        this.meshes.length = 0;
        this.ringGeometry.dispose();
        this.material.dispose();
    }
}
