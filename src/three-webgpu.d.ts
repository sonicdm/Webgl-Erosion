declare module 'three/webgpu' {
    export class WebGPURenderer {
        constructor(options?: { canvas?: HTMLCanvasElement; antialias?: boolean });
        init(): Promise<void>;
        dispose(): void;
        setClearColor(r: number, g: number, b: number, a: number): void;
        setSize(width: number, height: number): void;
        clear(): void;
        render(scene: unknown, camera: unknown): void;
    }
    export class NodeMaterial {
        colorNode: any;
        positionNode?: any;
    }
    export class MeshBasicNodeMaterial extends NodeMaterial {}
    export const TSL: unknown;
}
