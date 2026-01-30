import { Color } from 'three';
import { abs, clamp, float, mix, pow, vec3 } from 'three/tsl';

export interface TerrainPaletteInputs {
    height: any;
    normal: any;
    rock: any;
    snowRange: any;
    forestRange: any;
    terrainPalette: any;
    midHeight?: any;
    highHeight?: any;
}

export interface TerrainPaletteResult {
    color: any;
    baseColor: any;
    rockColor: any;
    rockBlend: any;
}

export interface TerrainPaletteEvaluationInputs {
    height: number;
    normalY: number;
    rock: number;
    snowRange: number;
    forestRange: number;
    terrainPalette: number;
    midHeight?: number;
    highHeight?: number;
}

const FOREST_COLOR = new Color(63 / 255 * 0.6, 155 / 255 * 0.6, 7 / 255 * 0.6);
const MOUNTAIN_COLOR = new Color(0.99, 0.99, 0.99);
const DIRT_COLOR = new Color(0.45, 0.45, 0.45);
const ROCK_DARK = new Color(0.15, 0.18, 0.25);
const ROCK_LIGHT = new Color(0.35, 0.38, 0.45);

export class TerrainPaletteNode {
    build(inputs: TerrainPaletteInputs): TerrainPaletteResult {
        const height = this.ensureFloatNode(inputs.height, 0);
        const normal = inputs.normal ?? vec3(0, 1, 0);
        const rock = this.ensureFloatNode(inputs.rock, 0);
        const snowRange = this.ensureFloatNode(inputs.snowRange, 1);
        const forestRange = this.ensureFloatNode(inputs.forestRange, 1);
        const terrainPalette = this.ensureFloatNode(inputs.terrainPalette, 0);
        const midHeight = this.ensureFloatNode(inputs.midHeight ?? 300, 300);
        const highHeightBase = this.ensureFloatNode(inputs.highHeight ?? 600, 600);

        const forestBase = vec3(63 / 255 * 0.6, 155 / 255 * 0.6, 7 / 255 * 0.6);
        const mountain = vec3(0.99, 0.99, 0.99);
        const dirt = vec3(0.45, 0.45, 0.45);
        const rockDark = vec3(0.15, 0.18, 0.25);
        const rockLight = vec3(0.35, 0.38, 0.45);

        const forestColor = terrainPalette.equal(float(1)).select(mountain, forestBase);
        const highHeight = terrainPalette.equal(float(2)).select(float(2000), highHeightBase);
        const heightBlend = clamp(height.sub(midHeight).div(highHeight.sub(midHeight)), 0, 1);

        let baseColor = mix(forestColor, mountain, heightBlend);

        const slope = abs(normal.y);
        const forestBlend = clamp(pow(slope, forestRange), 0, 1);
        baseColor = mix(mountain, baseColor, forestBlend);

        const snowBlend = pow(clamp(slope.div(0.75), 0, 1), snowRange);
        baseColor = mix(dirt, baseColor, snowBlend);

        const rockBlend = clamp(rock.sub(0.1).div(0.9), 0, 1);
        const rockColor = mix(rockDark, rockLight, rockBlend);
        const finalColor = mix(baseColor, rockColor, rockBlend);

        return {
            color: finalColor,
            baseColor,
            rockColor,
            rockBlend,
        };
    }

    static evaluate(inputs: TerrainPaletteEvaluationInputs): Color {
        const midHeight = inputs.midHeight ?? 300;
        const highHeightDefault = inputs.highHeight ?? 600;
        const terrainPalette = inputs.terrainPalette;
        const forestColor = terrainPalette === 1 ? MOUNTAIN_COLOR : FOREST_COLOR;
        const highHeight = terrainPalette === 2 ? 2000 : highHeightDefault;

        const heightBlend = clampNumber((inputs.height - midHeight) / (highHeight - midHeight));
        let baseColor = mixColor(forestColor, MOUNTAIN_COLOR, heightBlend);

        const slope = Math.abs(inputs.normalY);
        const forestBlend = clampNumber(Math.pow(slope, inputs.forestRange));
        baseColor = mixColor(MOUNTAIN_COLOR, baseColor, forestBlend);

        const snowBlend = Math.pow(clampNumber(slope / 0.75), inputs.snowRange);
        baseColor = mixColor(DIRT_COLOR, baseColor, snowBlend);

        if (inputs.rock > 0.1) {
            const rockBlend = clampNumber((inputs.rock - 0.1) / 0.9);
            const rockColor = mixColor(ROCK_DARK, ROCK_LIGHT, rockBlend);
            baseColor = mixColor(baseColor, rockColor, rockBlend);
        }

        return baseColor;
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

function mixColor(a: Color, b: Color, t: number): Color {
    const out = new Color();
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;
    return out;
}
