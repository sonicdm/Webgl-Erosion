import { Color } from 'three';
import { abs, acos, clamp, dot, float, max, min, mix, pow, smoothstep, vec3 } from 'three/tsl';

export interface TerrainPaletteInputs {
    /** Raw terrain height from heightmap (R channel) */
    height: any;
    /** Surface normal (normalized, pointing down for flat terrain in our convention) */
    normal: any;
    /** Rock material value from heightmap (B channel), 0-1 */
    rock: any;
    /** Controls snow line height (GUI parameter) */
    snowRange: any;
    /** Controls forest/grass steepness threshold (GUI parameter) */
    forestRange: any;
    /** Palette variant selector (0=default, 1=desert, 2=extended range) */
    terrainPalette: any;
    /** Max terrain height for normalization (terrainHeight * 120, default 240) */
    maxHeight?: any;
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
    maxHeight?: number;
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
 *   0.70 – 0.95   snow blends in (controlled by snowRange)
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
        const snowRange = this.ensureFloatNode(inputs.snowRange, 1);
        const forestRange = this.ensureFloatNode(inputs.forestRange, 1);
        const terrainPalette = this.ensureFloatNode(inputs.terrainPalette, 0);
        // maxHeight = terrainHeight * 120 (default 2*120=240).
        // Dividing by maxHeight normalises to 0..1 independent of simres.
        const maxH = this.ensureFloatNode(inputs.maxHeight ?? 240, 240);
        const normHeight = clamp(rawHeight.div(maxH), 0, 1);

        // --- Procedural colour constants ---
        const sandCol   = vec3(0.76, 0.70, 0.50);
        const grassCol  = vec3(0.22, 0.42, 0.14);
        const rockMid   = vec3(0.45, 0.42, 0.40);
        const snowCol   = vec3(0.95, 0.95, 0.97);
        const dirtCol   = vec3(0.50, 0.44, 0.35);

        // --- Height-based multi-band blending (THREE.Terrain smoothstep style) ---
        // Start with sand (base)
        let baseColor = sandCol;

        // Grass band: blends in 0.05–0.15, blends out 0.55–0.70
        const grassIn = smoothstep(float(0.05), float(0.15), normHeight);
        const grassOut = smoothstep(float(0.55), float(0.70), normHeight);
        const grassBlend = clamp(grassIn.mul(float(1).sub(grassOut)), 0, 1);
        baseColor = mix(baseColor, grassCol, grassBlend);

        // Rock band: blends in 0.40–0.60, blends out 0.80–0.95
        const rockIn = smoothstep(float(0.40), float(0.60), normHeight);
        const rockOut = smoothstep(float(0.80), float(0.95), normHeight);
        const rockHeightBlend = clamp(rockIn.mul(float(1).sub(rockOut)), 0, 1);
        baseColor = mix(baseColor, rockMid, rockHeightBlend);

        // Snow band: blends in based on snowRange — higher snowRange pushes snow line up
        // Default snowRange=1 → snow starts at 0.70.  snowRange=3 → starts higher.
        const snowStart = float(0.60).add(snowRange.mul(float(0.10)));
        const snowEnd = snowStart.add(float(0.15));
        const snowBlend = clamp(smoothstep(snowStart, snowEnd, normHeight), 0, 1);
        baseColor = mix(baseColor, snowCol, snowBlend);

        // --- Slope-based rock override (THREE.Terrain style) ---
        // Slope: angle between surface normal and up vector.
        // Our normal points DOWN for flat terrain, so use abs(normal.y) directly.
        // abs(normal.y) = 1 → flat, abs(normal.y) = 0 → cliff
        const cosSlope = clamp(abs(normal.y), 0, 1);
        // Convert to slope angle: acos(cosSlope) where 0 = flat, PI/2 = vertical
        // THREE.Terrain uses smoothstep(27°, 45°, slope) → radians 0.471, 0.785
        const slopeAngle = acos(cosSlope);
        const slopeFactor = smoothstep(float(0.47), float(0.79), slopeAngle);
        // forestRange controls how aggressively slopes show rock (higher = more slope rock)
        const slopeRock = clamp(slopeFactor.mul(forestRange), 0, 1);
        baseColor = mix(baseColor, rockMid, slopeRock);

        // Blend dirt into flat low areas (below grass line)
        const dirtBlend = clamp(float(1).sub(normHeight.div(float(0.06))), 0, 1);
        baseColor = mix(baseColor, dirtCol, dirtBlend.mul(float(0.4)));

        // --- Terrain palette variant ---
        // Palette 1: desert (replace grass with sand tones)
        const desertGrass = vec3(0.65, 0.58, 0.40);
        const desertBase = mix(baseColor, mix(sandCol, desertGrass, grassBlend), float(0.8));
        baseColor = terrainPalette.equal(float(1)).select(desertBase, baseColor);

        // --- Painted rock material override ---
        const rockDark = vec3(0.15, 0.18, 0.25);
        const rockLight = vec3(0.35, 0.38, 0.45);
        const paintedRockBlend = clamp(rock.sub(float(0.1)).div(float(0.9)), 0, 1);
        const paintedRockColor = mix(rockDark, rockLight, paintedRockBlend);
        const finalColor = mix(baseColor, paintedRockColor, paintedRockBlend);

        return {
            color: finalColor,
            baseColor,
            rockColor: paintedRockColor,
            rockBlend: paintedRockBlend,
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

        // Height bands
        let base = SAND_COLOR.clone();
        const grassIn = smoothstepNum(0.05, 0.15, normHeight);
        const grassOut = smoothstepNum(0.55, 0.70, normHeight);
        const grassBlend = clampNumber(grassIn * (1 - grassOut));
        base = mixColor(base, GRASS_COLOR, grassBlend);

        const rockIn = smoothstepNum(0.40, 0.60, normHeight);
        const rockOut = smoothstepNum(0.80, 0.95, normHeight);
        const rockHBlend = clampNumber(rockIn * (1 - rockOut));
        base = mixColor(base, ROCK_COLOR_MID, rockHBlend);

        const snowStart = 0.60 + inputs.snowRange * 0.10;
        const snowEnd = snowStart + 0.15;
        const snowBlend = clampNumber(smoothstepNum(snowStart, snowEnd, normHeight));
        base = mixColor(base, SNOW_COLOR, snowBlend);

        // Slope rock
        const slopeFactor = smoothstepNum(0.47, 0.79, slopeAngle);
        const slopeRock = clampNumber(slopeFactor * inputs.forestRange);
        base = mixColor(base, ROCK_COLOR_MID, slopeRock);

        // Dirt
        const dirtBlend = clampNumber(1 - normHeight / 0.06);
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
