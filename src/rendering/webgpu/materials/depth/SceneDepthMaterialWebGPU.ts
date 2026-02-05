import { NodeMaterial } from 'three/webgpu';
import { clamp, uniform, vec3 } from 'three/tsl';
import { TerrainShaderNodeController } from '../../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../../shader-nodes/terrain/TerrainSamplingNode';

export interface SceneDepthMaterialInputs extends TerrainSamplingInputs {
    depthScale?: number;
    depthBias?: number;
}

export class SceneDepthMaterialWebGPU extends NodeMaterial {
    private controller: TerrainShaderNodeController;
    private depthScaleUniform: any;
    private depthBiasUniform: any;
    private inputs: SceneDepthMaterialInputs;

    constructor(
        inputs: SceneDepthMaterialInputs = {},
        controller: TerrainShaderNodeController = new TerrainShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.depthScaleUniform = uniform(inputs.depthScale ?? 1);
        this.depthBiasUniform = uniform(inputs.depthBias ?? 0);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<SceneDepthMaterialInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.depthScale !== undefined) {
            this.depthScaleUniform.value = inputs.depthScale;
        }
        if (inputs.depthBias !== undefined) {
            this.depthBiasUniform.value = inputs.depthBias;
        }
        this.buildGraph(this.inputs);
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    private buildGraph(inputs: SceneDepthMaterialInputs): void {
        const sampling = this.controller.getSamplingNode(inputs);
        const depthValue = clamp(sampling.sceneDepth.mul(this.depthScaleUniform).add(this.depthBiasUniform), 0, 1);
        this.colorNode = vec3(depthValue);
    }
}
