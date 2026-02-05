import { NodeMaterial } from 'three/webgpu';
import { ScatteringInputs, ScatteringShaderNodeController } from '../../shader-nodes/scattering/ScatteringShaderNodeController';

export interface BackgroundScatteringMaterialInputs extends ScatteringInputs {}

export class BackgroundScatteringMaterialWebGPU extends NodeMaterial {
    private controller: ScatteringShaderNodeController;
    private inputs: BackgroundScatteringMaterialInputs;

    constructor(
        inputs: BackgroundScatteringMaterialInputs = {},
        controller: ScatteringShaderNodeController = new ScatteringShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<BackgroundScatteringMaterialInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        this.buildGraph(this.inputs);
    }

    getScatteringNodeController(): ScatteringShaderNodeController {
        return this.controller;
    }

    private buildGraph(inputs: BackgroundScatteringMaterialInputs): void {
        this.colorNode = this.controller.getBackgroundColorNode(inputs);
    }
}
