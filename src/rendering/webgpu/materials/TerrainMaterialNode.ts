import { Vector2, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, dot, float, length, max, mix, normalize, normalLocal, positionLocal, pow, texture, uniform, uv, vec2, vec3 } from 'three/tsl';
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
    /** Water source indicator uniforms (up to 8 sources) */
    private sourceCountUniform: any;
    private sourcePosUniforms: any[] = [];
    private sourceSizeUniforms: any[] = [];
    private lightDirUniform: any;
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
        // Always create a uniform so WGSL builder never sees type null (causes "Uniform null not declared").
        // brushPos must be Vector2: getValueType([0,0]) returns null for plain arrays.
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.maxHeightUniform = uniform(inputs.maxHeight ?? 240);
        this.brushPosUniform = uniform(TerrainMaterialNode.toVector2(inputs.brushPos));
        this.brushSizeUniform = uniform(inputs.brushSize ?? 0);
        this.brushTypeUniform = uniform(inputs.brushType ?? 0);
        this.debugModeUniform = uniform(inputs.debugMode ?? 0);
        this.showFlowTraceUniform = uniform(inputs.showFlowTrace ? 1 : 0);
        this.showSedimentTraceUniform = uniform(inputs.showSedimentTrace !== false ? 1 : 0);
        this.lightDirUniform = uniform(new Vector3(0.4, 0.8, 0.0));
        // Water source indicator uniforms (up to 8 sources displayed)
        this.sourceCountUniform = uniform(0);
        const MAX_DISPLAYED_SOURCES = 8;
        for (let i = 0; i < MAX_DISPLAYED_SOURCES; i++) {
            this.sourcePosUniforms.push(uniform(new Vector2(-10, -10)));
            this.sourceSizeUniforms.push(uniform(0));
        }

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
        // Signal Three.js that the material needs recompilation after graph rebuild
        (this as any).needsUpdate = true;
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    /** Update brush uniforms only (no graph rebuild). Call each frame when using WebGPU render path. */
    updateBrush(brushPos: [number, number], brushSize: number, brushType: number): void {
        this.brushPosUniform.value.set(brushPos[0], brushPos[1]);
        this.brushSizeUniform.value = brushSize;
        this.brushTypeUniform.value = brushType;
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
    }): void {
        if (params.snowRange !== undefined) this.snowRangeUniform.value = params.snowRange;
        if (params.forestRange !== undefined) this.forestRangeUniform.value = params.forestRange;
        if (params.terrainPalette !== undefined) this.terrainPaletteUniform.value = params.terrainPalette;
        if (params.maxHeight !== undefined) this.maxHeightUniform.value = params.maxHeight;
        if (params.debugMode !== undefined) this.debugModeUniform.value = params.debugMode;
        if (params.showFlowTrace !== undefined) this.showFlowTraceUniform.value = params.showFlowTrace ? 1 : 0;
        if (params.showSedimentTrace !== undefined) this.showSedimentTraceUniform.value = params.showSedimentTrace ? 1 : 0;
        if (params.lightDir !== undefined) this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
    }

    /** Update water source indicator positions each frame. */
    updateSources(sources: { position: [number, number]; size: number }[]): void {
        const count = Math.min(sources.length, this.sourcePosUniforms.length);
        this.sourceCountUniform.value = count;
        for (let i = 0; i < this.sourcePosUniforms.length; i++) {
            if (i < count) {
                this.sourcePosUniforms[i].value.set(sources[i].position[0], sources[i].position[1]);
                this.sourceSizeUniforms[i].value = sources[i].size;
            } else {
                this.sourcePosUniforms[i].value.set(-10, -10);
                this.sourceSizeUniforms[i].value = 0;
            }
        }
    }

    /** getValueType() returns null for plain arrays; use Vector2 so WGSL gets type 'vec2'. */
    private static toVector2(v: [number, number] | any): Vector2 {
        if (v != null && typeof (v as Vector2).x === 'number' && typeof (v as Vector2).y === 'number') return v as Vector2;
        if (Array.isArray(v) && v.length >= 2) return new Vector2(Number(v[0]), Number(v[1]));
        return new Vector2(0, 0);
    }

    private buildGraph(inputs: TerrainMaterialNodeInputs): void {
        // Vertex displacement: clamp UV by half-texel to avoid edge spike artifacts.
        // At UV=0 or UV=1, clamped texture reads produce discontinuous heights/normals.
        if (inputs.heightmap) {
            const halfTexel = float(0.5).div(this.simresUniform);
            const safeUv = clamp(uv(), vec2(halfTexel, halfTexel), vec2(float(1).sub(halfTexel), float(1).sub(halfTexel)));
            const vertexHeight = texture(inputs.heightmap, safeUv).x;
            const displacementY = vertexHeight.div(this.simresUniform);
            this.positionNode = positionLocal.add(normalLocal.mul(displacementY));
        }

        const sampling = this.controller.getSamplingNode(inputs);

        // Compute normHeight for debug visualization (same formula as palette)
        const normHeight = clamp(sampling.height.div(this.maxHeightUniform), 0, 1);

        // THREE.Terrain-inspired palette normalises height by maxHeight (terrainHeight*120).
        const palette = this.controller.getPaletteNode({
            height: sampling.height,
            normal: sampling.normal,
            rock: sampling.rock,
            snowRange: this.snowRangeUniform,
            forestRange: this.forestRangeUniform,
            terrainPalette: this.terrainPaletteUniform,
            maxHeight: this.maxHeightUniform,
        });
        const shadowCoord = inputs.shadowCoord ?? vec3(sampling.uv, float(1));
        const shadow = this.controller.getShadowNode({
            shadowMap: inputs.shadowMap,
            shadowCoord,
        });

        // Directional light (driven by sunPos/Dir controls)
        const surfaceNormal = sampling.normal.negate();
        const lightDir = normalize(this.lightDirUniform);
        const lamb = max(dot(surfaceNormal, lightDir), float(0));
        const ambientCol = vec3(0.01, 0.01, 0.01);
        let litColor = palette.color.mul(shadow.shadowFactor).mul(lamb).add(ambientCol);

        // Brush overlay — sharp ring with subtle interior fill
        const brushPos = this.brushPosUniform ?? uniform(new Vector2(0, 0));
        const brushSize = this.brushSizeUniform ?? uniform(0);
        const brushType = this.brushTypeUniform ?? uniform(0);
        const delta = sampling.uv.sub(brushPos);
        const distToBrush = length(delta);
        const brushRadius = float(0.01).mul(brushSize);
        const sand = vec3(214 / 255, 184 / 255, 96 / 255);
        const watercol = vec3(0.1, 0.3, 0.8);
        const rockCol = vec3(0.35, 0.38, 0.45);
        const smoothCol = vec3(0.5, 0.8, 1.0);
        const flattenCol = vec3(1.0, 1.0, 0.3);
        const slopeCol = vec3(0.3, 1.0, 0.3);
        const brushCol = brushType.equal(1).select(sand,
            brushType.equal(2).select(watercol,
                brushType.equal(3).select(rockCol,
                    brushType.equal(4).select(smoothCol,
                        brushType.equal(5).select(flattenCol,
                            brushType.equal(6).select(slopeCol, vec3(0)))))));
        // Ring: distance from the circle edge, normalized by ring thickness
        const ringWidth = brushRadius.mul(0.06).max(float(0.0008));
        const ringDist = distToBrush.sub(brushRadius).abs();
        const ringFactor = float(1).sub(ringDist.div(ringWidth)).clamp(0, 1);
        // Subtle fill inside the circle
        const insideFill = float(1).sub(distToBrush.div(brushRadius)).clamp(0, 1).mul(0.12);
        const brushIntensity = ringFactor.mul(0.95).add(insideFill);
        const brushActiveFloat = brushType.greaterThan(0).select(float(1), float(0));
        const brushBlend = brushActiveFloat.mul(brushIntensity);
        litColor = mix(litColor, litColor.add(brushCol), brushBlend);

        // --- Water source indicators (red glow at source positions) ---
        const sourceGlowCol = vec3(0.8, 0.15, 0.1);
        for (let i = 0; i < this.sourcePosUniforms.length; i++) {
            const srcPos = this.sourcePosUniforms[i];
            const srcSize = this.sourceSizeUniforms[i];
            const srcDelta = sampling.uv.sub(srcPos);
            const srcDist = length(srcDelta);
            const srcRadius = float(0.01).mul(srcSize);
            // Smooth radial falloff within source radius
            const srcGlow = float(1).sub(srcDist.div(srcRadius)).clamp(0, 1);
            const srcActive = srcSize.greaterThan(0).select(float(1), float(0));
            litColor = mix(litColor, litColor.add(sourceGlowCol.mul(srcGlow.mul(0.5))), srcActive.mul(srcGlow));
        }

        // --- Flow trace overlay (legacy: yellowish where water has flowed) ---
        // sedimentBlend accumulates over time where water flows, fades when dry.
        // Legacy: sedimentTrace = 1 - exp(-sval*300), mixed with khaki color.
        const flowTraceEnabled = this.showFlowTraceUniform.equal(1);
        const sval = sampling.sedimentBlend; // accumulated flow history
        const flowIntensity = float(1).sub(pow(float(2.718), sval.mul(-300).clamp(-10, 0)));
        const flowColor = vec3(240 / 255, 230 / 255, 140 / 255); // khaki/yellow
        const flowBlended = mix(litColor, flowColor.mul(lamb).add(ambientCol), flowIntensity.mul(1.5).clamp(0, 0.85));
        litColor = flowTraceEnabled.select(flowBlended, litColor);

        // --- Sediment trace overlay (legacy: 3-tier gradient showing sediment deposits) ---
        // Uses actual sediment concentration with exponential mapping and 3-band color gradient.
        const sedTraceEnabled = this.showSedimentTraceUniform.equal(1);
        const ssval = float(1).sub(pow(float(2.718), sampling.sediment.x.mul(-7).clamp(-10, 0)));
        // 3-tier colors: green-teal → teal → deep blue (legacy active colors)
        const lightSediCol = vec3(0.0, 0.5, 0.3);
        const medSediCol = vec3(0.0, 0.5, 0.5);
        const deepSediCol = vec3(0.0, 0.0, 0.99);
        const smallThresh = float(0.4);
        const largeThresh = float(0.7);
        // Band 1: 0→0.4 lerp base→light
        const band1 = mix(litColor, lightSediCol.mul(lamb), ssval.div(smallThresh).clamp(0, 1));
        // Band 2: 0.4→0.7 lerp light→medium
        const band2 = mix(lightSediCol, medSediCol, ssval.sub(smallThresh).div(float(0.3)).clamp(0, 1));
        // Band 3: 0.7→1.0 lerp medium→deep
        const band3 = mix(medSediCol, deepSediCol, ssval.sub(largeThresh).div(float(0.3)).clamp(0, 1));
        // Select band based on ssval thresholds
        const sediColor = ssval.lessThan(smallThresh).select(band1,
            ssval.lessThan(largeThresh).select(band2.mul(lamb), band3.mul(lamb)));
        const sedBlended = mix(litColor, sediColor, ssval.clamp(0, 1));
        litColor = sedTraceEnabled.select(sedBlended, litColor);

        // --- Debug visualization modes (match legacy terrain-frag TerrainDebug dropdown) ---
        // 0 = normal render, 1 = sediment, 2 = velocity, 3 = terrain (normHeight grayscale),
        // 4 = flux, 5 = terrainflux, 7 = flowMap (sediment blend), 10 = rock material
        const dbg = this.debugModeUniform;
        // Mode 3: terrain — normHeight as grayscale (most useful for palette debugging)
        const debugTerrain = vec3(normHeight, normHeight, normHeight);
        // Mode 1: sediment — sediment RGB * 2
        const debugSediment = sampling.sediment.mul(float(2));
        // Mode 2: velocity — abs(velocity) / 20
        const debugVelocity = sampling.velocity.div(float(20));
        // Mode 4: flux
        const debugFlux = sampling.flux.div(float(3));
        // Mode 5: terrain flux
        const debugTerrainFlux = sampling.terrainFlux.mul(float(100000));
        // Mode 7: flow/sediment blend
        const debugFlow = vec3(sampling.sedimentBlend, sampling.sedimentBlend, sampling.sedimentBlend).mul(float(300));
        // Mode 10: rock material
        const debugRock = vec3(sampling.rock, sampling.rock, sampling.rock);

        // Select debug output (simple chain — only computed values, no extra texture reads)
        const finalColor = dbg.equal(3).select(debugTerrain,
            dbg.equal(1).select(debugSediment,
                dbg.equal(2).select(debugVelocity,
                    dbg.equal(4).select(debugFlux,
                        dbg.equal(5).select(debugTerrainFlux,
                            dbg.equal(7).select(debugFlow,
                                dbg.equal(10).select(debugRock,
                                    litColor)))))));

        this.colorNode = finalColor;
    }
}
