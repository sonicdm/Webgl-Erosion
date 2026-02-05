import { Color } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { clamp, depth, uniform } from 'three/tsl';

export interface ShadowMapMaterialInputs {
    depthScale?: number;
    depthBias?: number;
    tint?: Color;
}

export class ShadowMapMaterialWebGPU extends NodeMaterial {
    private depthScaleUniform: any;
    private depthBiasUniform: any;
    private tintUniform: any;

    constructor(inputs: ShadowMapMaterialInputs = {}) {
        super();
        this.depthScaleUniform = uniform(inputs.depthScale ?? 1);
        this.depthBiasUniform = uniform(inputs.depthBias ?? 0);
        this.tintUniform = uniform(inputs.tint ?? new Color(1, 1, 1));

        this.buildGraph();
    }

    updateInputs(inputs: Partial<ShadowMapMaterialInputs>): void {
        if (inputs.depthScale !== undefined) {
            this.depthScaleUniform.value = inputs.depthScale;
        }
        if (inputs.depthBias !== undefined) {
            this.depthBiasUniform.value = inputs.depthBias;
        }
        if (inputs.tint !== undefined) {
            this.tintUniform.value.copy(inputs.tint);
        }
        this.buildGraph();
    }

    private buildGraph(): void {
        const depthValue = clamp(depth().mul(this.depthScaleUniform).add(this.depthBiasUniform), 0, 1);
        this.colorNode = this.tintUniform.mul(depthValue);
    }
}
