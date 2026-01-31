import { Scene, Mesh, BufferGeometry, Float32BufferAttribute, DoubleSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

/** Height sampler: (u, v) → raw terrain height value */
export type HeightSampler = (u: number, v: number) => number;

export interface SourceIndicatorData {
    position: [number, number]; // UV [0,1]
    size: number;
}

const RING_SEGMENTS = 48;
const RING_INNER = 0.85; // fraction of outer radius
const RING_RADIAL_STRIPS = 1; // single strip for the ring band

/**
 * Manages terrain-conforming ring overlay meshes for water source indicators.
 * Each ring's vertices are placed in world space with Y sampled from the
 * heightmap, so the ring drapes over the terrain surface.
 */
export class SourceIndicatorOverlay {
    private scene: Scene;
    private meshes: Mesh[] = [];
    private geometries: BufferGeometry[] = [];
    private material: MeshBasicNodeMaterial;
    private simres: number = 512;

    constructor(scene: Scene) {
        this.scene = scene;

        this.material = new MeshBasicNodeMaterial();
        this.material.colorNode = vec3(0.95, 0.25, 0.15);
        this.material.opacityNode = float(0.55);
        this.material.transparent = true;
        this.material.depthTest = false;
        this.material.depthWrite = false;
        this.material.side = DoubleSide;
    }

    /**
     * Update overlay to match current source list.
     * @param sources  Active water sources
     * @param sampleHeight  (u, v) → raw height from CPU buffer
     * @param simres  Simulation resolution (worldY = rawHeight / simres)
     */
    update(
        sources: SourceIndicatorData[],
        sampleHeight: HeightSampler,
        simres: number,
    ): void {
        this.simres = simres;

        // Grow pool if needed
        while (this.meshes.length < sources.length) {
            const geo = new BufferGeometry();
            const mesh = new Mesh(geo, this.material as any);
            mesh.frustumCulled = false;
            mesh.renderOrder = 10;
            this.scene.add(mesh);
            this.meshes.push(mesh);
            this.geometries.push(geo);
        }

        for (let i = 0; i < this.meshes.length; i++) {
            if (i < sources.length) {
                this.buildRingGeometry(this.geometries[i], sources[i], sampleHeight);
                this.meshes[i].visible = true;
            } else {
                this.meshes[i].visible = false;
            }
        }
    }

    private buildRingGeometry(
        geo: BufferGeometry,
        src: SourceIndicatorData,
        sampleHeight: HeightSampler,
    ): void {
        const centerU = src.position[0];
        const centerV = src.position[1];
        const outerR = 0.01 * src.size; // UV-space radius
        const innerR = outerR * RING_INNER;
        const yBias = 0.001;

        const verts: number[] = [];
        const indices: number[] = [];

        // Two concentric rings of vertices: inner and outer
        for (let s = 0; s <= RING_SEGMENTS; s++) {
            const angle = (s / RING_SEGMENTS) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            for (let r = 0; r <= RING_RADIAL_STRIPS; r++) {
                const frac = r / RING_RADIAL_STRIPS;
                const radius = innerR + (outerR - innerR) * frac;
                const u = centerU + cosA * radius;
                const v = centerV + sinA * radius;

                // UV → world XZ
                const worldX = u - 0.5;
                const worldZ = 0.5 - v;

                // Sample terrain height, clamp UV to valid range
                const clampedU = Math.max(0, Math.min(1, u));
                const clampedV = Math.max(0, Math.min(1, v));
                const rawH = sampleHeight(clampedU, clampedV);
                const worldY = rawH / this.simres + yBias;

                verts.push(worldX, worldY, worldZ);
            }
        }

        // Build triangle strip indices
        const stride = RING_RADIAL_STRIPS + 1; // verts per segment
        for (let s = 0; s < RING_SEGMENTS; s++) {
            for (let r = 0; r < RING_RADIAL_STRIPS; r++) {
                const a = s * stride + r;
                const b = a + 1;
                const c = (s + 1) * stride + r;
                const d = c + 1;
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        // Mark for GPU re-upload
        if (geo.attributes.position) {
            (geo.attributes.position as any).needsUpdate = true;
        }
        if (geo.index) {
            geo.index.needsUpdate = true;
        }
    }

    dispose(): void {
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
        }
        for (const geo of this.geometries) {
            geo.dispose();
        }
        this.meshes.length = 0;
        this.geometries.length = 0;
        this.material.dispose();
    }
}
