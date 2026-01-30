import { NodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { TerrainShaderNodeController } from '../../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../../shader-nodes/terrain/TerrainSamplingNode';

export interface TerrainDebugMaterialInputs extends TerrainSamplingInputs {
    debugMode?: number;
}

export class TerrainDebugMaterialWebGPU extends NodeMaterial {
    private controller: TerrainShaderNodeController;
    private debugModeUniform: any;
    private inputs: TerrainDebugMaterialInputs;

    constructor(
        inputs: TerrainDebugMaterialInputs = {},
        controller: TerrainShaderNodeController = new TerrainShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.debugModeUniform = uniform(inputs.debugMode ?? 0);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<TerrainDebugMaterialInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.debugMode !== undefined) {
            this.debugModeUniform.value = inputs.debugMode;
        }
        this.buildGraph(this.inputs);
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    getDebugModeValue(): number {
        return this.debugModeUniform.value as number;
    }

    private buildGraph(inputs: TerrainDebugMaterialInputs): void {
        const sampling = this.controller.getSamplingNode(inputs);
        const debugView = this.controller.getDebugViewNode({
            debugMode: this.debugModeUniform,
            sampling,
        });

        this.colorNode = debugView.color;
    }
}
