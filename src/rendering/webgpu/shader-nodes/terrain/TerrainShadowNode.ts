import { Texture } from 'three';
import { clamp, float, texture, vec3 } from 'three/tsl';

export interface TerrainShadowInputs {
    shadowMap?: Texture;
    shadowCoord?: any;
    bias?: any;
    strength?: any;
}

export interface TerrainShadowResult {
    shadowFactor: any;
    shadowDepth: any;
}

export interface TerrainShadowEvaluationInputs {
    shadowMapSample?: number;
    shadowCoordZ?: number;
    bias?: number;
    strength?: number;
}

export class TerrainShadowNode {
    build(inputs: TerrainShadowInputs): TerrainShadowResult {
        const shadowCoord = inputs.shadowCoord ?? vec3(0, 0, 0);
        const bias = this.ensureFloatNode(inputs.bias, 0.0001);
        const strength = this.ensureFloatNode(inputs.strength, 0.5);

        if (!inputs.shadowMap) {
            return {
                shadowFactor: float(1),
                shadowDepth: float(1),
            };
        }

        const depthSample = texture(inputs.shadowMap, shadowCoord.xy).x;
        const inShadow = shadowCoord.z.sub(bias).greaterThan(depthSample);
        const shadowFactor = inShadow.select(float(1).sub(clamp(strength, 0, 1)), float(1));

        return {
            shadowFactor,
            shadowDepth: depthSample,
        };
    }

    static evaluate(inputs: TerrainShadowEvaluationInputs): number {
        const sample = inputs.shadowMapSample ?? 1;
        const compareZ = inputs.shadowCoordZ ?? 0;
        const bias = inputs.bias ?? 0.0001;
        const strength = clampNumber(inputs.strength ?? 0.5);
        const inShadow = compareZ - bias > sample;
        return inShadow ? 1 - strength : 1;
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}

function clampNumber(value: number, min = 0, max = 1): number {
    return Math.min(Math.max(value, min), max);
}
