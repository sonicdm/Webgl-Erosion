import { NodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { WaterShaderInputs, WaterShaderNodeController } from '../shader-nodes/water/WaterShaderNodeController';

export interface WaterMaterialNodeInputs extends WaterShaderInputs {
    foamStrength?: number;
}

/**
 * Water material using Three.js NodeMaterial (TSL).
 * This is a scaffolding implementation for Phase 4.
 */
export class WaterMaterialNode extends NodeMaterial {
    private controller: WaterShaderNodeController;
    private foamStrengthUniform: any;
    private inputs: WaterMaterialNodeInputs;

    constructor(
        inputs: WaterMaterialNodeInputs = {},
        controller: WaterShaderNodeController = new WaterShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.foamStrengthUniform = uniform(inputs.foamStrength ?? 0);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<WaterMaterialNodeInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.foamStrength !== undefined) {
            this.foamStrengthUniform.value = inputs.foamStrength;
        }
        this.buildGraph(this.inputs);
    }

    getWaterNodeController(): WaterShaderNodeController {
        return this.controller;
    }

    private buildGraph(inputs: WaterMaterialNodeInputs): void {
        const colorNode = this.controller.getSurfaceColorNode({
            baseColor: inputs.baseColor,
            foamColor: inputs.foamColor,
            foamStrength: this.foamStrengthUniform,
        });

        this.colorNode = colorNode;
    }
}
