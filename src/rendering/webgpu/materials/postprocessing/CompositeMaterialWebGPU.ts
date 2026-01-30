import { Texture } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { clamp, float, mix, texture, uniform, uv, vec3 } from 'three/tsl';

export interface CompositeMaterialInputs {
    colorTexture?: Texture;
    depthTexture?: Texture;
    mixFactor?: number;
}

export class CompositeMaterialWebGPU extends NodeMaterial {
    private mixFactorUniform: any;
    private inputs: CompositeMaterialInputs;

    constructor(inputs: CompositeMaterialInputs = {}) {
        super();
        this.inputs = { ...inputs };
        this.mixFactorUniform = uniform(inputs.mixFactor ?? 1);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<CompositeMaterialInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.mixFactor !== undefined) {
            this.mixFactorUniform.value = inputs.mixFactor;
        }
        this.buildGraph(this.inputs);
    }

    private buildGraph(inputs: CompositeMaterialInputs): void {
        const uvNode = uv();
        const colorSample = inputs.colorTexture ? texture(inputs.colorTexture, uvNode).xyz : vec3(0);
        const depthSample = inputs.depthTexture ? texture(inputs.depthTexture, uvNode).x : float(0);
        const depthMix = clamp(depthSample.mul(this.mixFactorUniform), 0, 1);

        this.colorNode = mix(colorSample, vec3(0), depthMix);
    }
}
