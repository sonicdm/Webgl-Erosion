import { float } from 'three/tsl';
import { MieScatteringInputs, MieScatteringNode } from './MieScatteringNode';
import { RayleighScatteringInputs, RayleighScatteringNode } from './RayleighScatteringNode';

export interface ScatteringInputs {
    rayleigh?: RayleighScatteringInputs;
    mie?: MieScatteringInputs;
    mieStrength?: any;
}

export class ScatteringShaderNodeController {
    constructor(
        private rayleighNode: RayleighScatteringNode = new RayleighScatteringNode(),
        private mieNode: MieScatteringNode = new MieScatteringNode()
    ) {}

    getBackgroundColorNode(inputs: ScatteringInputs = {}): any {
        const rayleigh = this.rayleighNode.build(inputs.rayleigh ?? {});
        const mie = this.mieNode.build(inputs.mie ?? {});
        const mieStrength = this.ensureFloatNode(inputs.mieStrength, 1);
        return rayleigh.add(mie.mul(mieStrength));
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}
