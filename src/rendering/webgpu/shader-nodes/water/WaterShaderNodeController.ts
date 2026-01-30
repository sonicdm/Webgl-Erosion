import { float, vec3 } from 'three/tsl';

export interface WaterShaderInputs {
    baseColor?: any;
    foamColor?: any;
    foamStrength?: any;
}

export class WaterShaderNodeController {
    getSurfaceColorNode(inputs: WaterShaderInputs = {}): any {
        const baseColor = inputs.baseColor ?? vec3(0.05, 0.25, 0.6);
        const foamColor = inputs.foamColor ?? vec3(0.8, 0.9, 1.0);
        const foamStrength = this.ensureFloatNode(inputs.foamStrength, 0.0);

        return baseColor.add(foamColor.mul(foamStrength));
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}
