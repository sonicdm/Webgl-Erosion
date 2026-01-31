import { Scene, Mesh, BufferGeometry, Float32BufferAttribute, DoubleSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, vec3 } from 'three/tsl';

/** Height sampler: (u, v) → raw terrain height value */
export type HeightSampler = (u: number, v: number) => number;

export interface SourceIndicatorData {
    position: [number, number]; // UV [0,1]
    size: number;
}

const SEGMENTS = 32;      // angular segments around the disc
const RADIAL_RINGS = 6;   // concentric vertex rings (center → edge)

/**
 * Terrain-conforming radial glow discs for water source indicators.
 * Each disc is a filled circle whose vertices are height-sampled from the
 * CPU heightmap buffer, with per-vertex alpha creating a soft radial
 * falloff (bright at center, transparent at edge). Renders additively
 * on top of terrain — mimics the old in-shader glow without adding any
 * TSL nodes to the terrain material.
 */
export class SourceIndicatorOverlay {
    private scene: Scene;
    private meshes: Mesh[] = [];
    private geometries: BufferGeometry[] = [];
    private material: MeshBasicNodeMaterial;
    private simres: number = 512;

    constructor(scene: Scene) {
        this.scene = scene;

        // Material reads per-vertex 'alpha' attribute for radial falloff
        const vAlpha = attribute('alpha', 'float');
        this.material = new MeshBasicNodeMaterial();
        this.material.colorNode = mix(vec3(0.95, 0.3, 0.15), vec3(1.0, 0.6, 0.3), vAlpha);
        this.material.opacityNode = vAlpha.mul(float(0.45));
        this.material.transparent = true;
        this.material.depthTest = false;
        this.material.depthWrite = false;
        this.material.side = DoubleSide;
    }

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
                this.buildDiscGeometry(this.geometries[i], sources[i], sampleHeight);
                this.meshes[i].visible = true;
            } else {
                this.meshes[i].visible = false;
            }
        }
    }

    private buildDiscGeometry(
        geo: BufferGeometry,
        src: SourceIndicatorData,
        sampleHeight: HeightSampler,
    ): void {
        const centerU = src.position[0];
        const centerV = src.position[1];
        const outerR = 0.01 * src.size;
        const yBias = 0.0015;

        const positions: number[] = [];
        const alphas: number[] = [];
        const indices: number[] = [];

        // Center vertex
        const cU = Math.max(0, Math.min(1, centerU));
        const cV = Math.max(0, Math.min(1, centerV));
        const centerH = sampleHeight(cU, cV);
        positions.push(centerU - 0.5, centerH / this.simres + yBias, 0.5 - centerV);
        alphas.push(1.0); // Full intensity at center
        // vertex index 0 = center

        // Concentric rings of vertices
        for (let ring = 1; ring <= RADIAL_RINGS; ring++) {
            const frac = ring / RADIAL_RINGS;
            const radius = outerR * frac;
            // Radial falloff: strong near center, fading to 0 at edge
            // Use a quadratic curve for a natural soft glow
            const alpha = (1.0 - frac) * (1.0 - frac);

            for (let s = 0; s < SEGMENTS; s++) {
                const angle = (s / SEGMENTS) * Math.PI * 2;
                const u = centerU + Math.cos(angle) * radius;
                const v = centerV + Math.sin(angle) * radius;

                const clU = Math.max(0, Math.min(1, u));
                const clV = Math.max(0, Math.min(1, v));
                const rawH = sampleHeight(clU, clV);

                positions.push(u - 0.5, rawH / this.simres + yBias, 0.5 - v);
                alphas.push(alpha);
            }
        }

        // Triangles: center fan for ring 1
        const ring1Start = 1; // first vertex of ring 1
        for (let s = 0; s < SEGMENTS; s++) {
            const curr = ring1Start + s;
            const next = ring1Start + (s + 1) % SEGMENTS;
            indices.push(0, curr, next);
        }

        // Triangle strips between consecutive rings
        for (let ring = 1; ring < RADIAL_RINGS; ring++) {
            const innerStart = 1 + (ring - 1) * SEGMENTS;
            const outerStart = 1 + ring * SEGMENTS;
            for (let s = 0; s < SEGMENTS; s++) {
                const iCurr = innerStart + s;
                const iNext = innerStart + (s + 1) % SEGMENTS;
                const oCurr = outerStart + s;
                const oNext = outerStart + (s + 1) % SEGMENTS;
                indices.push(iCurr, oCurr, iNext);
                indices.push(iNext, oCurr, oNext);
            }
        }

        geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geo.setAttribute('alpha', new Float32BufferAttribute(alphas, 1));
        geo.setIndex(indices);

        if (geo.attributes.position) (geo.attributes.position as any).needsUpdate = true;
        if (geo.attributes.alpha) (geo.attributes.alpha as any).needsUpdate = true;
        if (geo.index) geo.index.needsUpdate = true;
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
