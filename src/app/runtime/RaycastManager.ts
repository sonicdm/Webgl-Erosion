import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import type { AppContext } from '../context';
import { rayCast } from '../../utils/raycast';
import { rayCastBVH } from '../../utils/bvh-raycast';
import type Camera from '../../Camera';

export interface RaycastResult {
    uvPos: vec2;
    worldOrigin: vec3;
    worldDir: vec3;
}

/**
 * Screen-to-world unproject + terrain raycast dispatch.
 * Pre-allocates all math objects to avoid GC pressure per frame.
 */
export class RaycastManager {
    // Pre-allocated reusable buffers (zero-alloc per frame)
    private viewProj = mat4.create();
    private invViewProj = mat4.create();
    private mousePoint = vec4.create();
    private mousePointEnd = vec4.create();
    private dir = vec3.create();
    private ro = vec3.create();
    private pos = vec2.create();

    constructor(private appContext: AppContext) {}

    /**
     * Unproject screen mouse → world ray, then raycast against terrain.
     * Returns borrowed references to internal buffers — consume before next call.
     */
    update(
        camera: Camera,
        normalizedScreenX: number,
        normalizedScreenY: number,
        raycastMethod: string,
    ): RaycastResult {
        // Build view-projection and its inverse
        mat4.multiply(this.viewProj, camera.projectionMatrix, camera.viewMatrix);
        mat4.invert(this.invViewProj, this.viewProj);

        // Unproject near and far clip points
        this.mousePoint[0] = 2.0 * normalizedScreenX - 1.0;
        this.mousePoint[1] = 1.0 - 2.0 * normalizedScreenY;
        this.mousePoint[2] = -1.0;
        this.mousePoint[3] = 1.0;
        this.mousePointEnd[0] = 2.0 * normalizedScreenX - 1.0;
        this.mousePointEnd[1] = 1.0 - 2.0 * normalizedScreenY;
        this.mousePointEnd[2] = -0.0;
        this.mousePointEnd[3] = 1.0;

        vec4.transformMat4(this.mousePoint, this.mousePoint, this.invViewProj);
        vec4.transformMat4(this.mousePointEnd, this.mousePointEnd, this.invViewProj);

        // Perspective divide
        const w0 = this.mousePoint[3];
        this.mousePoint[0] /= w0;
        this.mousePoint[1] /= w0;
        this.mousePoint[2] /= w0;
        this.mousePoint[3] = 1;
        const w1 = this.mousePointEnd[3];
        this.mousePointEnd[0] /= w1;
        this.mousePointEnd[1] /= w1;
        this.mousePointEnd[2] /= w1;
        this.mousePointEnd[3] = 1;

        // Ray direction
        this.dir[0] = this.mousePointEnd[0] - this.mousePoint[0];
        this.dir[1] = this.mousePointEnd[1] - this.mousePoint[1];
        this.dir[2] = this.mousePointEnd[2] - this.mousePoint[2];
        vec3.normalize(this.dir, this.dir);

        // Ray origin
        this.ro[0] = this.mousePoint[0];
        this.ro[1] = this.mousePoint[1];
        this.ro[2] = this.mousePoint[2];

        // Initialize to invalid (miss)
        this.pos[0] = -10.0;
        this.pos[1] = -10.0;

        const { terrainState, simulationState } = this.appContext;

        if (raycastMethod === 'bvh' && terrainState.terrainBVH && terrainState.terrainGeometry) {
            const hit = rayCastBVH(
                this.ro, this.dir,
                terrainState.terrainBVH, terrainState.terrainGeometry,
                this.pos,
            );
            // Always validate against heightmap
            const heightmapPos = vec2.create();
            rayCast(this.ro, this.dir, simulationState.simres, simulationState.heightMapCpuBuf, heightmapPos);
            if (!hit) {
                this.pos[0] = heightmapPos[0];
                this.pos[1] = heightmapPos[1];
            } else {
                const uvError = Math.hypot(heightmapPos[0] - this.pos[0], heightmapPos[1] - this.pos[1]);
                if (uvError > 0.02) {
                    this.pos[0] = heightmapPos[0];
                    this.pos[1] = heightmapPos[1];
                }
            }
        } else {
            rayCast(this.ro, this.dir, simulationState.simres, simulationState.heightMapCpuBuf, this.pos);
        }

        return { uvPos: this.pos, worldOrigin: this.ro, worldDir: this.dir };
    }

    /**
     * Convert viewport coordinates (clientX/clientY) to canvas-relative normalized [0,1].
     */
    static normalizeMousePosition(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height,
        };
    }
}
