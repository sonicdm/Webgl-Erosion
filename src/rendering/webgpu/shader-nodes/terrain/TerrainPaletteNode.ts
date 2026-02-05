import { Color } from 'three';
import { abs, acos, clamp, dot, float, max, min, mix, pow, smoothstep, vec3 } from 'three/tsl';

export interface TerrainPaletteInputs {
    /** Raw terrain height from heightmap (R channel) */
    height: any;
    /** Surface normal (normalized, pointing down for flat terrain in our convention) */
    normal: any;
    /** Rock material value from heightmap (B channel), 0-1 */
    rock: any;
    /** Palette variant selector (0=default, 1=desert, 2=extended range) */
    terrainPalette: any;
    /** Max terrain height for normalization (terrainHeight * 120, default 240) */
    maxHeight?: any;
    /** Normalised height where grass starts blending in (0-0.5, default 0.10) */
    grassLine?: any;
    /** Normalised height where rock starts blending in (0.2-0.9, default 0.50) */
    rockLine?: any;
    /** Normalised height where snow starts blending in (0.3-1.0, default 0.70) */
    snowLine?: any;
    /** How aggressively slopes show rock (0-3, default 1.0) */
    slopeRockAmount?: any;
}

export interface BiomeWeights {
    sand: any;
    grass: any;
    rock: any;
    snow: any;
}

export interface TerrainPaletteResult {
    color: any;
    baseColor: any;
    rockColor: any;
    rockBlend: any;
    /** Per-biome roughness (0=mirror, 1=fully rough) */
    roughness: any;
    /** Per-biome blend weights for detail noise modulation */
    biomeWeights: BiomeWeights;
}

export interface TerrainPaletteEvaluationInputs {
    height: number;
    normalY: number;
    rock: number;
    terrainPalette: number;
    maxHeight?: number;
    /** Normalised height where grass starts blending in (default 0.10) */
    grassLine?: number;
    /** Normalised height where rock starts blending in (default 0.50) */
    rockLine?: number;
    /** Normalised height where snow starts blending in (default 0.70) */
    snowLine?: number;
    /** How aggressively slopes show rock (0-3, default 1.0) */
    slopeRockAmount?: number;
}

// Procedural biome colors (no textures — matches THREE.Terrain color spirit)
const SAND_COLOR = new Color(0.76, 0.70, 0.50);
const GRASS_COLOR = new Color(0.22, 0.42, 0.14);
const ROCK_COLOR_MID = new Color(0.45, 0.42, 0.40);
const SNOW_COLOR = new Color(0.95, 0.95, 0.97);
const DIRT_COLOR = new Color(0.50, 0.44, 0.35);
const ROCK_DARK = new Color(0.15, 0.18, 0.25);
const ROCK_LIGHT = new Color(0.35, 0.38, 0.45);

/**
 * THREE.Terrain–inspired procedural palette.
 *
 * Uses multi-band height blending with smoothstep transitions and
 * slope-based rock override. Height is normalised by maxHeight
 * (terrainHeight*120, default 240) so the palette is resolution-independent.
 *
 * Height bands (normalised 0–1):
 *   0.00 – 0.08   sand / dirt (lowest)
 *   0.05 – 0.20   grass / forest blends in
 *   0.20 – 0.55   grass dominant
 *   0.40 – 0.65   rock blends in
 *   0.65 – 0.85   rock dominant
 *   0.70 – 0.95   snow blends in (controlled by snowLine)
 *
 * Slope override:
 *   slope > 27 °  rock starts blending in
 *   slope > 45 °  mostly rock
 */
export class TerrainPaletteNode {
    build(inputs: TerrainPaletteInputs): TerrainPaletteResult {
        const rawHeight = this.ensureFloatNode(inputs.height, 0);
        const normal = inputs.normal ?? vec3(0, 1, 0);
        const rock = this.ensureFloatNode(inputs.rock, 0);
        const terrainPalette = this.ensureFloatNode(inputs.terrainPalette, 0);
        const maxH = this.ensureFloatNode(inputs.maxHeight ?? 240, 240);
        const normHeight = clamp(rawHeight.div(maxH), 0, 1);

        // Layer control uniforms (from GUI or defaults)
        const grassLine = this.ensureFloatNode(inputs.grassLine, 0.10);
        const rockLine = this.ensureFloatNode(inputs.rockLine, 0.50);
        const snowLineParam = this.ensureFloatNode(inputs.snowLine, 0.70);
        const slopeRockAmt = this.ensureFloatNode(inputs.slopeRockAmount, 1.0);

        // --- Procedural colour constants ---
        const sandCol   = vec3(0.76, 0.70, 0.50);
        const grassCol  = vec3(0.22, 0.42, 0.14);
        const rockMid   = vec3(0.45, 0.42, 0.40);
        const snowCol   = vec3(0.95, 0.95, 0.97);
        const dirtCol   = vec3(0.50, 0.44, 0.35);

        // --- Height-based multi-band blending ---
        // Bands are driven by grassLine, rockLine, snowLine uniforms.
        // Each band has a smoothstep in-transition (~0.10 wide) and out-transition.
        let baseColor = sandCol;

        // Grass band: blends in at grassLine, blends out approaching rockLine
        const grassStart = grassLine.sub(float(0.02));
        const grassEnd = grassLine.add(float(0.08));
        const grassOutStart = rockLine.sub(float(0.05));
        const grassOutEnd = rockLine.add(float(0.10));
        const grassIn = smoothstep(grassStart, grassEnd, normHeight);
        const grassOut = smoothstep(grassOutStart, grassOutEnd, normHeight);
        const grassBlend = clamp(grassIn.mul(float(1).sub(grassOut)), 0, 1);
        baseColor = mix(baseColor, grassCol, grassBlend);

        // Rock band: blends in at rockLine, blends out approaching snowLine
        const rockStart = rockLine.sub(float(0.05));
        const rockEnd = rockLine.add(float(0.10));
        const rockOutStart = snowLineParam.sub(float(0.05));
        const rockOutEnd = snowLineParam.add(float(0.10));
        const rockIn = smoothstep(rockStart, rockEnd, normHeight);
        const rockOut = smoothstep(rockOutStart, rockOutEnd, normHeight);
        const rockHeightBlend = clamp(rockIn.mul(float(1).sub(rockOut)), 0, 1);
        baseColor = mix(baseColor, rockMid, rockHeightBlend);

        // Snow band: blends in at snowLine
        const snowStart = snowLineParam.sub(float(0.05));
        const snowEnd = snowLineParam.add(float(0.10));
        const snowBlend = clamp(smoothstep(snowStart, snowEnd, normHeight), 0, 1);
        baseColor = mix(baseColor, snowCol, snowBlend);

        // --- Slope-based rock override ---
        const cosSlope = clamp(abs(normal.y), 0, 1);
        const slopeAngle = acos(cosSlope);
        const slopeFactor = smoothstep(float(0.47), float(0.79), slopeAngle);
        const slopeRock = clamp(slopeFactor.mul(slopeRockAmt), 0, 1);
        baseColor = mix(baseColor, rockMid, slopeRock);

        // Blend dirt into flat low areas (below grass line)
        const dirtThresh = grassLine.mul(float(0.6));
        const dirtBlend = clamp(float(1).sub(normHeight.div(dirtThresh)), 0, 1);
        baseColor = mix(baseColor, dirtCol, dirtBlend.mul(float(0.4)));

        // --- Terrain palette variant ---
        // Palette 1: desert (replace grass with sand tones)
        const desertGrass = vec3(0.65, 0.58, 0.40);
        const desertBase = mix(baseColor, mix(sandCol, desertGrass, grassBlend), float(0.8));
        baseColor = terrainPalette.equal(float(1)).select(desertBase, baseColor);

        // --- Per-biome roughness (blended in parallel with color) ---
        // Sand/dirt: 0.85 (granular), Grass: 0.75, Rock: 0.95, Snow: 0.55 (crystalline, catches sunlight)
        let roughness = float(0.85); // sand base
        roughness = mix(roughness, float(0.75), grassBlend);
        roughness = mix(roughness, float(0.95), rockHeightBlend);
        roughness = mix(roughness, float(0.55), snowBlend);
        roughness = mix(roughness, float(0.95), slopeRock);

        // --- Painted rock material override ---
        const rockDark = vec3(0.15, 0.18, 0.25);
        const rockLight = vec3(0.35, 0.38, 0.45);
        const paintedRockBlend = clamp(rock.sub(float(0.1)).div(float(0.9)), 0, 1);
        const paintedRockColor = mix(rockDark, rockLight, paintedRockBlend);
        const finalColor = mix(baseColor, paintedRockColor, paintedRockBlend);
        roughness = mix(roughness, float(0.95), paintedRockBlend);

        // Biome weights for detail noise modulation
        const rockWeight = clamp(rockHeightBlend.add(slopeRock).add(paintedRockBlend), 0, 1);
        const sandWeight = clamp(float(1).sub(grassBlend).sub(snowBlend).sub(rockWeight), 0, 1);

        return {
            color: finalColor,
            baseColor,
            rockColor: paintedRockColor,
            rockBlend: paintedRockBlend,
            roughness,
            biomeWeights: {
                sand: sandWeight,
                grass: grassBlend,
                rock: rockWeight,
                snow: snowBlend,
            },
        };
    }

    /**
     * CPU-side evaluation for tests / BVH color queries.
     */
    static evaluate(inputs: TerrainPaletteEvaluationInputs): Color {
        const maxH = inputs.maxHeight ?? 240;
        const normHeight = clampNumber(inputs.height / maxH);
        const cosSlope = clampNumber(Math.abs(inputs.normalY));
        const slopeAngle = Math.acos(cosSlope);

        const grassLineVal = inputs.grassLine ?? 0.10;
        const rockLineVal = inputs.rockLine ?? 0.50;
        const snowLineVal = inputs.snowLine ?? 0.70;
        const slopeRockAmt = inputs.slopeRockAmount ?? 1.0;

        // Height bands (matching GPU build() logic)
        let base = SAND_COLOR.clone();

        // Grass band
        const grassStart = grassLineVal - 0.02;
        const grassEnd = grassLineVal + 0.08;
        const grassOutStart = rockLineVal - 0.05;
        const grassOutEnd = rockLineVal + 0.10;
        const grassIn = smoothstepNum(grassStart, grassEnd, normHeight);
        const grassOut = smoothstepNum(grassOutStart, grassOutEnd, normHeight);
        const grassBlend = clampNumber(grassIn * (1 - grassOut));
        base = mixColor(base, GRASS_COLOR, grassBlend);

        // Rock band
        const rockStart = rockLineVal - 0.05;
        const rockEnd = rockLineVal + 0.10;
        const rockOutStart = snowLineVal - 0.05;
        const rockOutEnd = snowLineVal + 0.10;
        const rockIn = smoothstepNum(rockStart, rockEnd, normHeight);
        const rockOut = smoothstepNum(rockOutStart, rockOutEnd, normHeight);
        const rockHBlend = clampNumber(rockIn * (1 - rockOut));
        base = mixColor(base, ROCK_COLOR_MID, rockHBlend);

        // Snow band
        const snowStart = snowLineVal - 0.05;
        const snowEnd = snowLineVal + 0.10;
        const snowBlend = clampNumber(smoothstepNum(snowStart, snowEnd, normHeight));
        base = mixColor(base, SNOW_COLOR, snowBlend);

        // Slope rock
        const slopeFactor = smoothstepNum(0.47, 0.79, slopeAngle);
        const slopeRock = clampNumber(slopeFactor * slopeRockAmt);
        base = mixColor(base, ROCK_COLOR_MID, slopeRock);

        // Dirt (below grass line)
        const dirtThresh = grassLineVal * 0.6;
        const dirtBlend = clampNumber(1 - normHeight / Math.max(dirtThresh, 0.001));
        base = mixColor(base, DIRT_COLOR, dirtBlend * 0.4);

        // Desert palette
        if (inputs.terrainPalette === 1) {
            const desertGrass = new Color(0.65, 0.58, 0.40);
            const desertBase = mixColor(mixColor(SAND_COLOR, desertGrass, grassBlend), base, 0.2);
            base = desertBase;
        }

        // Painted rock
        if (inputs.rock > 0.1) {
            const rb = clampNumber((inputs.rock - 0.1) / 0.9);
            const rc = mixColor(ROCK_DARK, ROCK_LIGHT, rb);
            base = mixColor(base, rc, rb);
        }

        return base;
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

function smoothstepNum(edge0: number, edge1: number, x: number): number {
    const t = clampNumber((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function mixColor(a: Color, b: Color, t: number): Color {
    const out = new Color();
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;
    return out;
}
