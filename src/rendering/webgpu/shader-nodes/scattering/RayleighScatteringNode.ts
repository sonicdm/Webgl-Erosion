import { clamp, dot, float, normalize, vec3 } from 'three/tsl';

export interface RayleighScatteringInputs {
    sunDirection?: any;
    viewDirection?: any;
    intensity?: any;
    color?: any;
}

export class RayleighScatteringNode {
    build(inputs: RayleighScatteringInputs): any {
        const sunDirection = inputs.sunDirection ?? vec3(0, 1, 0);
        const viewDirection = inputs.viewDirection ?? vec3(0, 1, 0);
        const intensity = this.ensureFloatNode(inputs.intensity, 1);
        const baseColor = inputs.color ?? vec3(0.5, 0.7, 1.0);

        const cosTheta = dot(normalize(sunDirection), normalize(viewDirection));
        const phase = clamp(cosTheta.mul(0.5).add(0.5), 0, 1);

        return baseColor.mul(intensity).mul(phase);
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}
