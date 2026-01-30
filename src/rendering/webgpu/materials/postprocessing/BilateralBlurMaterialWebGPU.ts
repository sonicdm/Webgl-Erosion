import { Texture, Vector2 } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { clamp, float, mix, texture, uniform, uv, vec3 } from 'three/tsl';

export interface BilateralBlurMaterialInputs {
    colorTexture?: Texture;
    depthTexture?: Texture;
    texelSize?: Vector2;
    radius?: number;
    depthSigma?: number;
    colorSigma?: number;
}

export class BilateralBlurMaterialWebGPU extends NodeMaterial {
    private texelSizeUniform: any;
    private radiusUniform: any;
    private depthSigmaUniform: any;
    private colorSigmaUniform: any;
    private inputs: BilateralBlurMaterialInputs;

    constructor(inputs: BilateralBlurMaterialInputs = {}) {
        super();
        this.inputs = { ...inputs };
        this.texelSizeUniform = uniform(inputs.texelSize ?? new Vector2(1, 1));
        this.radiusUniform = uniform(inputs.radius ?? 1);
        this.depthSigmaUniform = uniform(inputs.depthSigma ?? 1);
        this.colorSigmaUniform = uniform(inputs.colorSigma ?? 1);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<BilateralBlurMaterialInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.texelSize !== undefined) {
            this.texelSizeUniform.value.copy(inputs.texelSize);
        }
        if (inputs.radius !== undefined) {
            this.radiusUniform.value = inputs.radius;
        }
        if (inputs.depthSigma !== undefined) {
            this.depthSigmaUniform.value = inputs.depthSigma;
        }
        if (inputs.colorSigma !== undefined) {
            this.colorSigmaUniform.value = inputs.colorSigma;
        }
        this.buildGraph(this.inputs);
    }

    private buildGraph(inputs: BilateralBlurMaterialInputs): void {
        const uvNode = uv();
        const colorSample = inputs.colorTexture ? texture(inputs.colorTexture, uvNode).xyz : vec3(0);
        const depthSample = inputs.depthTexture ? texture(inputs.depthTexture, uvNode).x : float(0);
        const blurMix = clamp(depthSample.mul(this.depthSigmaUniform), 0, 1);

        this.colorNode = mix(colorSample, vec3(0), blurMix);
    }
}
