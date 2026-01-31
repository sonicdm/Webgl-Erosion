import { Vector2, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, dot, float, length, max, mix, normalize, normalLocal, positionLocal, pow, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl';
import { TerrainShaderNodeController } from '../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../shader-nodes/terrain/TerrainSamplingNode';

export interface TerrainMaterialNodeInputs extends TerrainSamplingInputs {
    snowRange?: number;
    forestRange?: number;
    terrainPalette?: number;
    /** Max terrain height for palette normalization (terrainHeight * 120) */
    maxHeight?: number;
    shadowCoord?: any;
    /** Brush center in UV [0,1] (for overlay); (-10,-10) = off */
    brushPos?: [number, number] | any;
    brushSize?: number | any;
    brushType?: number | any;
    /** Debug visualization mode (0 = none, see TerrainDebugMode) */
    debugMode?: number;
    /** Show flow trace overlay (where water has flowed) */
    showFlowTrace?: boolean;
    /** Show sediment trace overlay (sediment deposits on terrain) */
    showSedimentTrace?: boolean;
}

/**
 * Terrain material using Three.js NodeMaterial (TSL).
 * Vertex displacement from heightmap matches legacy terrain-vert.glsl (Y = yval / u_SimRes).
 *
 * PERFORMANCE NOTE: TSL compile time scales super-linearly with node count.
 * Keep this graph minimal — debug modes, source indicators, and optional
 * overlays should be toggled via uniforms, not additional node branches.
 */
export class TerrainMaterialNode extends MeshBasicNodeMaterial {
    private controller: TerrainShaderNodeController;
    private snowRangeUniform: any;
    private forestRangeUniform: any;
    private terrainPaletteUniform: any;
    private simresUniform: any;
    private maxHeightUniform: any;
    private brushPosUniform: any;
    private brushSizeUniform: any;
    private brushTypeUniform: any;
    private debugModeUniform: any;
    private showFlowTraceUniform: any;
    private showSedimentTraceUniform: any;
    private lightDirUniform: any;
    private grassLineUniform: any;
    private rockLineUniform: any;
    private snowLineUniform: any;
    private slopeRockAmountUniform: any;
    /** Brush overlay color (set from JS based on brushType) */
    private brushColorUniform: any;
    private inputs: TerrainMaterialNodeInputs;

    constructor(
        inputs: TerrainMaterialNodeInputs = {},
        controller: TerrainShaderNodeController = new TerrainShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.snowRangeUniform = uniform(inputs.snowRange ?? 1);
        this.forestRangeUniform = uniform(inputs.forestRange ?? 1);
        this.terrainPaletteUniform = uniform(inputs.terrainPalette ?? 0);
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.maxHeightUniform = uniform(inputs.maxHeight ?? 240);
        this.brushPosUniform = uniform(TerrainMaterialNode.toVector2(inputs.brushPos));
        this.brushSizeUniform = uniform(inputs.brushSize ?? 0);
        this.brushTypeUniform = uniform(inputs.brushType ?? 0);
        this.debugModeUniform = uniform(inputs.debugMode ?? 0);
        this.showFlowTraceUniform = uniform(inputs.showFlowTrace ? 1 : 0);
        this.showSedimentTraceUniform = uniform(inputs.showSedimentTrace !== false ? 1 : 0);
        this.lightDirUniform = uniform(new Vector3(0.4, 0.8, 0.0));
        this.grassLineUniform = uniform(0.10);
        this.rockLineUniform = uniform(0.50);
        this.snowLineUniform = uniform(0.70);
        this.slopeRockAmountUniform = uniform(1.0);
        this.brushColorUniform = uniform(new Vector3(0.1, 0.3, 0.8)); // default: water brush blue

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<TerrainMaterialNodeInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.snowRange !== undefined) {
            this.snowRangeUniform.value = inputs.snowRange;
        }
        if (inputs.forestRange !== undefined) {
            this.forestRangeUniform.value = inputs.forestRange;
        }
        if (inputs.terrainPalette !== undefined) {
            this.terrainPaletteUniform.value = inputs.terrainPalette;
        }
        if (inputs.brushPos !== undefined) {
            const v = TerrainMaterialNode.toVector2(inputs.brushPos);
            this.brushPosUniform.value.set(v.x, v.y);
        }
        if (inputs.brushSize !== undefined) {
            this.brushSizeUniform.value = inputs.brushSize;
        }
        if (inputs.brushType !== undefined) {
            this.brushTypeUniform.value = inputs.brushType;
        }
        if (inputs.simres !== undefined) {
            this.simresUniform.value = inputs.simres;
        }
        this.buildGraph(this.inputs);
        (this as any).needsUpdate = true;
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    /** Update brush uniforms only (no graph rebuild). Call each frame. */
    updateBrush(brushPos: [number, number], brushSize: number, brushType: number): void {
        this.brushPosUniform.value.set(brushPos[0], brushPos[1]);
        this.brushSizeUniform.value = brushSize;
        this.brushTypeUniform.value = brushType;
        // Set brush color from JS instead of 6 nested TSL selects
        const colors: Record<number, [number, number, number]> = {
            1: [214 / 255, 184 / 255, 96 / 255],  // terrain: sand
            2: [0.1, 0.3, 0.8],                     // water: blue
            3: [0.35, 0.38, 0.45],                   // rock: grey
            4: [0.5, 0.8, 1.0],                      // smooth: cyan
            5: [1.0, 1.0, 0.3],                      // flatten: yellow
            6: [0.3, 1.0, 0.3],                      // slope: green
        };
        const c = colors[brushType] ?? [0, 0, 0];
        this.brushColorUniform.value.set(c[0], c[1], c[2]);
    }

    /** Update per-frame uniforms from controls (no graph rebuild). */
    updateUniforms(params: {
        snowRange?: number;
        forestRange?: number;
        terrainPalette?: number;
        maxHeight?: number;
        debugMode?: number;
        showFlowTrace?: boolean;
        showSedimentTrace?: boolean;
        lightDir?: [number, number, number];
        grassLine?: number;
        rockLine?: number;
        snowLine?: number;
        slopeRockAmount?: number;
    }): void {
        if (params.snowRange !== undefined) this.snowRangeUniform.value = params.snowRange;
        if (params.forestRange !== undefined) this.forestRangeUniform.value = params.forestRange;
        if (params.terrainPalette !== undefined) this.terrainPaletteUniform.value = params.terrainPalette;
        if (params.maxHeight !== undefined) this.maxHeightUniform.value = params.maxHeight;
        if (params.debugMode !== undefined) this.debugModeUniform.value = params.debugMode;
        if (params.grassLine !== undefined) this.grassLineUniform.value = params.grassLine;
        if (params.rockLine !== undefined) this.rockLineUniform.value = params.rockLine;
        if (params.snowLine !== undefined) this.snowLineUniform.value = params.snowLine;
        if (params.slopeRockAmount !== undefined) this.slopeRockAmountUniform.value = params.slopeRockAmount;
        if (params.showFlowTrace !== undefined) this.showFlowTraceUniform.value = params.showFlowTrace ? 1 : 0;
        if (params.showSedimentTrace !== undefined) this.showSedimentTraceUniform.value = params.showSedimentTrace ? 1 : 0;
        if (params.lightDir !== undefined) this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
    }

    /** getValueType() returns null for plain arrays; use Vector2 so WGSL gets type 'vec2'. */
    private static toVector2(v: [number, number] | any): Vector2 {
        if (v != null && typeof (v as Vector2).x === 'number' && typeof (v as Vector2).y === 'number') return v as Vector2;
        if (Array.isArray(v) && v.length >= 2) return new Vector2(Number(v[0]), Number(v[1]));
        return new Vector2(0, 0);
    }

    private buildGraph(inputs: TerrainMaterialNodeInputs): void {
        // Vertex displacement: clamp UV by half-texel to avoid edge spike artifacts.
        if (inputs.heightmap) {
            const halfTexel = float(0.5).div(this.simresUniform);
            const safeUv = clamp(uv(), vec2(halfTexel, halfTexel), vec2(float(1).sub(halfTexel), float(1).sub(halfTexel)));
            const vertexHeight = texture(inputs.heightmap, safeUv).x;
            const displacementY = vertexHeight.div(this.simresUniform);
            this.positionNode = positionLocal.add(normalLocal.mul(displacementY));
        }

        // Only pass textures actually needed for the render path (not debug-only ones).
        // This avoids TSL creating nodes for unused texture reads.
        const samplingInputs: TerrainSamplingInputs = {
            heightmap: inputs.heightmap,
            simres: inputs.simres,
            sedimentMap: inputs.sedimentMap,
            sedimentBlendMap: inputs.sedimentBlendMap,
        };
        const sampling = this.controller.getSamplingNode(samplingInputs);

        // Compute normHeight for debug visualization
        const normHeight = clamp(sampling.height.div(this.maxHeightUniform), 0, 1);

        // Palette
        const palette = this.controller.getPaletteNode({
            height: sampling.height,
            normal: sampling.normal,
            rock: sampling.rock,
            snowRange: this.snowRangeUniform,
            forestRange: this.forestRangeUniform,
            terrainPalette: this.terrainPaletteUniform,
            maxHeight: this.maxHeightUniform,
            grassLine: this.grassLineUniform,
            rockLine: this.rockLineUniform,
            snowLine: this.snowLineUniform,
            slopeRockAmount: this.slopeRockAmountUniform,
        });
        const shadowCoord = inputs.shadowCoord ?? vec3(sampling.uv, float(1));
        const shadow = this.controller.getShadowNode({
            shadowMap: inputs.shadowMap,
            shadowCoord,
        });

        // Directional light
        const surfaceNormal = sampling.normal.negate();
        const lightDir = normalize(this.lightDirUniform);
        const lamb = max(dot(surfaceNormal, lightDir), float(0));
        const ambientCol = vec3(0.01, 0.01, 0.01);
        let litColor = palette.color.mul(shadow.shadowFactor).mul(lamb).add(ambientCol);

        // Brush overlay — ring + fill. Color comes from a single uniform (set in updateBrush).
        const brushPos = this.brushPosUniform;
        const brushSize = this.brushSizeUniform;
        const brushType = this.brushTypeUniform;
        const delta = sampling.uv.sub(brushPos);
        const distToBrush = length(delta);
        const brushRadius = float(0.01).mul(brushSize);
        const brushCol = this.brushColorUniform;
        const ringWidth = brushRadius.mul(0.06).max(float(0.0008));
        const ringDist = distToBrush.sub(brushRadius).abs();
        const ringFactor = float(1).sub(ringDist.div(ringWidth)).clamp(0, 1);
        const insideFill = float(1).sub(distToBrush.div(brushRadius)).clamp(0, 1).mul(0.12);
        const brushIntensity = ringFactor.mul(0.95).add(insideFill);
        const brushActiveFloat = brushType.greaterThan(0).select(float(1), float(0));
        const brushBlend = brushActiveFloat.mul(brushIntensity);
        litColor = mix(litColor, litColor.add(brushCol), brushBlend);

        // --- Flow trace overlay ---
        const flowTraceEnabled = this.showFlowTraceUniform.equal(1);
        const sval = sampling.sedimentBlend;
        const flowIntensity = float(1).sub(pow(float(2.718), sval.mul(-300).clamp(-10, 0)));
        const terrainLum = litColor.x.mul(0.299).add(litColor.y.mul(0.587)).add(litColor.z.mul(0.114));
        const flowColorBright = vec3(240 / 255, 230 / 255, 140 / 255);
        const flowColorDark = vec3(0.35, 0.25, 0.10);
        const flowColor = mix(flowColorBright, flowColorDark, smoothstep(float(0.35), float(0.55), terrainLum));
        const flowBlended = mix(litColor, flowColor.mul(lamb).add(ambientCol), flowIntensity.mul(1.5).clamp(0, 0.85));
        litColor = flowTraceEnabled.select(flowBlended, litColor);

        // --- Sediment trace overlay (simplified: single-band green tint) ---
        const sedTraceEnabled = this.showSedimentTraceUniform.equal(1);
        const ssval = float(1).sub(pow(float(2.718), sampling.sediment.x.mul(-7).clamp(-10, 0)));
        const sediCol = vec3(0.0, 0.5, 0.4);
        const sedBlended = mix(litColor, sediCol.mul(lamb), ssval.clamp(0, 1));
        litColor = sedTraceEnabled.select(sedBlended, litColor);

        // --- Debug visualization (simplified: terrain grayscale only, others use debug dropdown CPU-side) ---
        const dbg = this.debugModeUniform;
        const debugTerrain = vec3(normHeight, normHeight, normHeight);
        const debugRock = vec3(sampling.rock, sampling.rock, sampling.rock);
        const debugFlow = vec3(sampling.sedimentBlend, sampling.sedimentBlend, sampling.sedimentBlend).mul(float(300));
        // Only 3 modes in the shader; other debug modes can use separate materials if needed
        const finalColor = dbg.equal(3).select(debugTerrain,
            dbg.equal(10).select(debugRock,
                dbg.equal(7).select(debugFlow,
                    litColor)));

        this.colorNode = finalColor;
    }
}
