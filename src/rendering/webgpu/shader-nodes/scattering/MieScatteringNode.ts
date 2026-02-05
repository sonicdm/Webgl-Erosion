import { clamp, dot, float, normalize, pow, vec3 } from 'three/tsl';

export interface MieScatteringInputs {
    sunDirection?: any;
    viewDirection?: any;
    intensity?: any;
    color?: any;
    g?: any;
}

export class MieScatteringNode {
    build(inputs: MieScatteringInputs): any {
        const sunDirection = inputs.sunDirection ?? vec3(0, 1, 0);
        const viewDirection = inputs.viewDirection ?? vec3(0, 1, 0);
        const intensity = this.ensureFloatNode(inputs.intensity, 1);
        const g = this.ensureFloatNode(inputs.g, 0.8);
        const baseColor = inputs.color ?? vec3(1.0, 0.8, 0.6);

        const cosTheta = dot(normalize(sunDirection), normalize(viewDirection));
        const phase = clamp(pow(cosTheta.mul(0.5).add(0.5), g), 0, 1);

        return baseColor.mul(intensity).mul(phase);
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}
