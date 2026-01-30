import { Color, Vector3 } from 'three';
import { abs, clamp, float, length, mix, vec3 } from 'three/tsl';
import { TerrainSamplingResult } from './TerrainSamplingNode';

export enum TerrainDebugMode {
    None = 0,
    Sediment = 1,
    Velocity = 2,
    Terrain = 3,
    Flux = 4,
    TerrainFlux = 5,
    MaxSlippage = 6,
    SedimentBlend = 7,
    Normal = 8,
    VelocityMagnitude = 9,
    RockMaterial = 10,
}

export interface TerrainDebugViewInputs {
    debugMode: any;
    sampling: TerrainSamplingResult;
}

export interface TerrainDebugViewResult {
    color: any;
}

export interface TerrainDebugEvaluationInputs {
    debugMode: TerrainDebugMode;
    sediment?: Color;
    velocity?: Vector3;
    flux?: Color;
    terrainFlux?: Color;
    maxSlippage?: Color;
    sedimentBlend?: number;
    normal?: Vector3;
    rock?: number;
}

export class TerrainDebugViewNode {
    build(inputs: TerrainDebugViewInputs): TerrainDebugViewResult {
        const mode = this.ensureFloatNode(inputs.debugMode, 0);
        const sampling = inputs.sampling;

        const sedimentColor = sampling.sediment;
        const velocityColor = abs(sampling.velocity).div(20);
        const terrainColor = sampling.heightSample.xyz;
        const fluxColor = sampling.flux;
        const terrainFluxColor = sampling.terrainFlux;
        const maxSlippageColor = sampling.maxSlippage;
        const sedimentBlendColor = vec3(sampling.sedimentBlend);
        const normalColor = abs(sampling.normal);
        const velocityMagnitudeColor = this.buildVelocityMagnitudeColor(sampling.velocity);
        const rockMaterialColor = this.buildRockMaterialColor(sampling.rock);

        let color = normalColor;

        color = mode.equal(float(TerrainDebugMode.Sediment)).select(sedimentColor, color);
        color = mode.equal(float(TerrainDebugMode.Velocity)).select(velocityColor, color);
        color = mode.equal(float(TerrainDebugMode.Terrain)).select(terrainColor, color);
        color = mode.equal(float(TerrainDebugMode.Flux)).select(fluxColor, color);
        color = mode.equal(float(TerrainDebugMode.TerrainFlux)).select(terrainFluxColor, color);
        color = mode.equal(float(TerrainDebugMode.MaxSlippage)).select(maxSlippageColor, color);
        color = mode.equal(float(TerrainDebugMode.SedimentBlend)).select(sedimentBlendColor, color);
        color = mode.equal(float(TerrainDebugMode.Normal)).select(normalColor, color);
        color = mode.equal(float(TerrainDebugMode.VelocityMagnitude)).select(velocityMagnitudeColor, color);
        color = mode.equal(float(TerrainDebugMode.RockMaterial)).select(rockMaterialColor, color);

        return { color };
    }

    static evaluate(inputs: TerrainDebugEvaluationInputs): Color {
        const sediment = inputs.sediment ?? new Color(0, 0, 0);
        const velocity = inputs.velocity ?? new Vector3(0, 0, 0);
        const flux = inputs.flux ?? new Color(0, 0, 0);
        const terrainFlux = inputs.terrainFlux ?? new Color(0, 0, 0);
        const maxSlippage = inputs.maxSlippage ?? new Color(0, 0, 0);
        const sedimentBlend = inputs.sedimentBlend ?? 0;
        const normal = inputs.normal ?? new Vector3(0, 1, 0);
        const rock = inputs.rock ?? 0;

        switch (inputs.debugMode) {
            case TerrainDebugMode.Sediment:
                return sediment.clone();
            case TerrainDebugMode.Velocity:
                return new Color(Math.abs(velocity.x) / 20, Math.abs(velocity.y) / 20, Math.abs(velocity.z) / 20);
            case TerrainDebugMode.Terrain:
                return new Color(0.5, 0.5, 0.5);
            case TerrainDebugMode.Flux:
                return flux.clone();
            case TerrainDebugMode.TerrainFlux:
                return terrainFlux.clone();
            case TerrainDebugMode.MaxSlippage:
                return maxSlippage.clone();
            case TerrainDebugMode.SedimentBlend:
                return new Color(sedimentBlend, sedimentBlend, sedimentBlend);
            case TerrainDebugMode.Normal:
                return new Color(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
            case TerrainDebugMode.VelocityMagnitude:
                return velocityMagnitudeColor(velocity);
            case TerrainDebugMode.RockMaterial:
                return rockMaterialColor(rock);
            case TerrainDebugMode.None:
            default:
                return new Color(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        }
    }

    private buildVelocityMagnitudeColor(velocity: any): any {
        const velSize = length(velocity).div(5);
        const lowBlend = clamp(velSize.div(0.5), 0, 1);
        const highBlend = clamp(velSize.sub(0.5).div(0.5), 0, 1);

        const lowColor = mix(vec3(0, 0, 1), vec3(0, 1, 0), lowBlend);
        const highColor = mix(vec3(0, 1, 0), vec3(1, 0, 0), highBlend);

        return velSize.lessThanEqual(float(0.5)).select(lowColor, highColor);
    }

    private buildRockMaterialColor(rockValue: any): any {
        const rockColor = vec3(0.2, 0.2, 0.2).mul(rockValue.mul(0.5).add(0.5));
        const soilColor = vec3(0.6, 0.5, 0.4);
        return rockValue.greaterThan(float(0.5)).select(rockColor, soilColor);
    }

    private ensureFloatNode(value: any, fallback: number): any {
        if (value === undefined || value === null) {
            return float(fallback);
        }
        return typeof value === 'number' ? float(value) : value;
    }
}

function velocityMagnitudeColor(velocity: Vector3): Color {
    const velSize = Math.min(Math.max(velocity.length() / 5, 0), 1);
    if (velSize <= 0.5) {
        const t = velSize / 0.5;
        return mixLinear(new Color(0, 0, 1), new Color(0, 1, 0), t);
    }
    const t = (velSize - 0.5) / 0.5;
    return mixLinear(new Color(0, 1, 0), new Color(1, 0, 0), t);
}

function rockMaterialColor(rock: number): Color {
    if (rock > 0.5) {
        const intensity = 0.5 + rock * 0.5;
        return new Color(0.2 * intensity, 0.2 * intensity, 0.2 * intensity);
    }
    return new Color(0.6, 0.5, 0.4);
}

function mixLinear(a: Color, b: Color, t: number): Color {
    return new Color(
        a.r + (b.r - a.r) * t,
        a.g + (b.g - a.g) * t,
        a.b + (b.b - a.b) * t
    );
}
