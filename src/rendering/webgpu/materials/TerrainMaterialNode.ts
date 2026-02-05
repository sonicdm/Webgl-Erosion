import { Texture, Vector2, Vector3, DataTexture, FloatType, RGBAFormat, NearestFilter } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, clamp, float, length, mix, normalize, normalLocal, output, positionLocal, pow, smoothstep, texture, transformNormalToView, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { TerrainShaderNodeController } from '../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../shader-nodes/terrain/TerrainSamplingNode';

export interface TerrainMaterialNodeInputs extends TerrainSamplingInputs {
    terrainPalette?: number;
    /** Max terrain height for palette normalization (terrainHeight * 120) */
    maxHeight?: number;
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
    /** Lava map texture (R=lavaHeight, G=temperature, B=viscosity, A=crustThickness) */
    lavaMap?: Texture;
    /** Lava velocity map texture (R=velX, G=velY, B=speed, A=heat) */
    lavaVelocityMap?: Texture;
    /** Cool lava map texture (R=coolLavaHeight) */
    coolLavaMap?: Texture;
    /** Basalt map texture (R=basaltHeight) */
    basaltMap?: Texture;
}

/**
 * Terrain material using Three.js NodeMaterial (TSL).
 * Vertex displacement from heightmap matches legacy terrain-vert.glsl (Y = yval / u_SimRes).
 *
 * PERFORMANCE NOTE: TSL compile time scales super-linearly with node count.
 * Keep this graph minimal — debug modes, source indicators, and optional
 * overlays should be toggled via uniforms, not additional node branches.
 */
export class TerrainMaterialNode extends MeshStandardNodeMaterial {
    private controller: TerrainShaderNodeController;
    private terrainPaletteUniform: any;
    private simresUniform: any;
    private maxHeightUniform: any;
    private brushPosUniform: any;
    private brushSizeUniform: any;
    private brushTypeUniform: any;
    private debugModeUniform: any;
    private showFlowTraceUniform: any;
    private showSedimentTraceUniform: any;
    private grassLineUniform: any;
    private rockLineUniform: any;
    private snowLineUniform: any;
    private slopeRockAmountUniform: any;
    /** Brush overlay color (set from JS based on brushType) */
    private brushColorUniform: any;
    // Terrain detail uniforms
    private detailIntensityUniform: any;
    private detailNormalStrengthUniform: any;
    private detailRoughnessVarUniform: any;
    private detailScaleUniform: any;
    /** Water source data packed into a 16×1 RGBA32F DataTexture (R=u, G=v, B=size, A=active) */
    private sourceDataTexture: DataTexture;
    private sourceCountUniform: any;
    /** Lava source data packed into a 16×1 RGBA32F DataTexture (R=u, G=v, B=size, A=active) */
    private lavaSourceDataTexture: DataTexture;
    private lavaSourceCountUniform: any;
    private inputs: TerrainMaterialNodeInputs;

    constructor(
        inputs: TerrainMaterialNodeInputs = {},
        controller: TerrainShaderNodeController = new TerrainShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.terrainPaletteUniform = uniform(inputs.terrainPalette ?? 0);
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.maxHeightUniform = uniform(inputs.maxHeight ?? 240);
        this.brushPosUniform = uniform(TerrainMaterialNode.toVector2(inputs.brushPos));
        this.brushSizeUniform = uniform(inputs.brushSize ?? 0);
        this.brushTypeUniform = uniform(inputs.brushType ?? 0);
        this.debugModeUniform = uniform(inputs.debugMode ?? 0);
        this.showFlowTraceUniform = uniform(inputs.showFlowTrace ? 1 : 0);
        this.showSedimentTraceUniform = uniform(inputs.showSedimentTrace !== false ? 1 : 0);
        this.grassLineUniform = uniform(0.10);
        this.rockLineUniform = uniform(0.50);
        this.snowLineUniform = uniform(0.70);
        this.slopeRockAmountUniform = uniform(1.0);
        this.brushColorUniform = uniform(new Vector3(0.1, 0.3, 0.8)); // default: water brush blue
        this.detailIntensityUniform = uniform(1.0);
        this.detailNormalStrengthUniform = uniform(0.5);
        this.detailRoughnessVarUniform = uniform(0.5);
        this.detailScaleUniform = uniform(1.0);

        // 16×1 RGBA32F texture packing source data: R=u, G=v, B=size, A=active(0/1)
        const MAX_SOURCES = 16;
        this.sourceDataTexture = new DataTexture(
            new Float32Array(MAX_SOURCES * 4), MAX_SOURCES, 1, RGBAFormat, FloatType
        );
        this.sourceDataTexture.magFilter = NearestFilter;
        this.sourceDataTexture.minFilter = NearestFilter;
        this.sourceDataTexture.needsUpdate = true;
        this.sourceCountUniform = uniform(0);

        // 16×1 RGBA32F texture packing lava source data: R=u, G=v, B=size, A=active(0/1)
        this.lavaSourceDataTexture = new DataTexture(
            new Float32Array(MAX_SOURCES * 4), MAX_SOURCES, 1, RGBAFormat, FloatType
        );
        this.lavaSourceDataTexture.magFilter = NearestFilter;
        this.lavaSourceDataTexture.minFilter = NearestFilter;
        this.lavaSourceDataTexture.needsUpdate = true;
        this.lavaSourceCountUniform = uniform(0);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<TerrainMaterialNodeInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
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
            7: [0.88, 0.34, 0.13],                    // lava: orange
        };
        const c = colors[brushType] ?? [0, 0, 0];
        this.brushColorUniform.value.set(c[0], c[1], c[2]);
    }

    /** Update water source indicator data each frame (no graph rebuild). */
    updateSources(sources: { position: [number, number]; size: number }[]): void {
        const data = this.sourceDataTexture.image.data as Float32Array;
        const max = data.length / 4; // 16
        const count = Math.min(sources.length, max);
        for (let i = 0; i < max; i++) {
            const base = i * 4;
            if (i < count) {
                data[base] = sources[i].position[0];     // R = u
                data[base + 1] = sources[i].position[1]; // G = v
                data[base + 2] = sources[i].size;         // B = size
                data[base + 3] = 1;                       // A = active
            } else {
                data[base] = -10;
                data[base + 1] = -10;
                data[base + 2] = 0;
                data[base + 3] = 0;
            }
        }
        this.sourceDataTexture.needsUpdate = true;
        this.sourceCountUniform.value = count;
    }

    /** Update lava source indicator data each frame (no graph rebuild). */
    updateLavaSources(sources: { position: [number, number]; size: number }[]): void {
        const data = this.lavaSourceDataTexture.image.data as Float32Array;
        const max = data.length / 4; // 16
        const count = Math.min(sources.length, max);
        for (let i = 0; i < max; i++) {
            const base = i * 4;
            if (i < count) {
                data[base] = sources[i].position[0];     // R = u
                data[base + 1] = sources[i].position[1]; // G = v
                data[base + 2] = sources[i].size;         // B = size
                data[base + 3] = 1;                       // A = active
            } else {
                data[base] = -10;
                data[base + 1] = -10;
                data[base + 2] = 0;
                data[base + 3] = 0;
            }
        }
        this.lavaSourceDataTexture.needsUpdate = true;
        this.lavaSourceCountUniform.value = count;
    }

    /** Update per-frame uniforms from controls (no graph rebuild). */
    updateUniforms(params: {
        terrainPalette?: number;
        maxHeight?: number;
        debugMode?: number;
        showFlowTrace?: boolean;
        showSedimentTrace?: boolean;
        grassLine?: number;
        rockLine?: number;
        snowLine?: number;
        slopeRockAmount?: number;
        detailIntensity?: number;
        detailNormalStrength?: number;
        detailRoughnessVar?: number;
        detailScale?: number;
    }): void {
        if (params.terrainPalette !== undefined) this.terrainPaletteUniform.value = params.terrainPalette;
        if (params.maxHeight !== undefined) this.maxHeightUniform.value = params.maxHeight;
        if (params.debugMode !== undefined) this.debugModeUniform.value = params.debugMode;
        if (params.grassLine !== undefined) this.grassLineUniform.value = params.grassLine;
        if (params.rockLine !== undefined) this.rockLineUniform.value = params.rockLine;
        if (params.snowLine !== undefined) this.snowLineUniform.value = params.snowLine;
        if (params.slopeRockAmount !== undefined) this.slopeRockAmountUniform.value = params.slopeRockAmount;
        if (params.showFlowTrace !== undefined) this.showFlowTraceUniform.value = params.showFlowTrace ? 1 : 0;
        if (params.showSedimentTrace !== undefined) this.showSedimentTraceUniform.value = params.showSedimentTrace ? 1 : 0;
        if (params.detailIntensity !== undefined) this.detailIntensityUniform.value = params.detailIntensity;
        if (params.detailNormalStrength !== undefined) this.detailNormalStrengthUniform.value = params.detailNormalStrength;
        if (params.detailRoughnessVar !== undefined) this.detailRoughnessVarUniform.value = params.detailRoughnessVar;
        if (params.detailScale !== undefined) this.detailScaleUniform.value = params.detailScale;
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
            let vertexHeight = texture(inputs.heightmap, safeUv).x;
            // Include basalt + coolLava in terrain mesh height so solidified lava is visible
            if (inputs.basaltMap) {
                vertexHeight = vertexHeight.add(texture(inputs.basaltMap, safeUv).x);
            }
            if (inputs.coolLavaMap) {
                vertexHeight = vertexHeight.add(texture(inputs.coolLavaMap, safeUv).x);
            }
            const displacementY = vertexHeight.div(this.simresUniform);
            this.positionNode = positionLocal.add(normalLocal.mul(displacementY));
        }

        // Pass all textures to sampling — debug views need velocity, flux, etc.
        const sampling = this.controller.getSamplingNode(inputs);

        // normHeight for debug + palette
        const normHeight = clamp(sampling.height.div(this.maxHeightUniform), 0, 1);

        // Palette
        const palette = this.controller.getPaletteNode({
            height: sampling.height,
            normal: sampling.normal,
            rock: sampling.rock,
            terrainPalette: this.terrainPaletteUniform,
            maxHeight: this.maxHeightUniform,
            grassLine: this.grassLineUniform,
            rockLine: this.rockLineUniform,
            snowLine: this.snowLineUniform,
            slopeRockAmount: this.slopeRockAmountUniform,
        });

        // --- Albedo (PBR handles lighting via MeshStandardNodeMaterial) ---
        let albedo = palette.color;
        let roughness = palette.roughness;

        // Basalt: blend dark igneous rock into albedo + max roughness (volcanic rock)
        if (inputs.basaltMap) {
            const basaltH = texture(inputs.basaltMap, sampling.uv).x;
            const basaltBlend = clamp(basaltH.mul(float(500)).div(this.simresUniform), 0, 1);
            albedo = mix(albedo, vec3(0.12, 0.11, 0.10), basaltBlend);
            roughness = mix(roughness, float(1.0), basaltBlend);
        }

        // Procedural detail: multi-scale FBM for color, normals, and roughness variation
        const detail = this.controller.getDetailNode(sampling.uv, palette.biomeWeights, {
            intensity: this.detailIntensityUniform,
            normalStrength: this.detailNormalStrengthUniform,
            roughnessVar: this.detailRoughnessVarUniform,
            scale: this.detailScaleUniform,
        });
        albedo = albedo.mul(detail.colorModulation);
        roughness = clamp(roughness.add(detail.roughnessVariation), 0, 1);

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
        let emissive = brushCol.mul(brushBlend);

        // --- Water source indicators (red glow, unrolled over DataTexture) ---
        // Each iteration reads one texel from the 16×1 source data texture.
        // Inactive sources at (-10,-10) with size=0 naturally produce 0 glow.
        // IMPORTANT: use emissive.add(c.mul(t)) instead of mix(emissive, emissive.add(c), t)
        // because mix(a, a+c, t) = a + c*t algebraically, but the mix form references the
        // accumulator twice per iteration, causing exponential node traversal in TSL (2^N paths).
        const sourceGlowCol = vec3(0.8, 0.15, 0.1);
        const srcTex = texture(this.sourceDataTexture);
        const MAX_SOURCES = 16;
        for (let i = 0; i < MAX_SOURCES; i++) {
            const srcUv = vec2((i + 0.5) / MAX_SOURCES, 0.5);
            const srcData = srcTex.uv(srcUv);
            const srcDist = length(sampling.uv.sub(vec2(srcData.x, srcData.y)));
            const srcRadius = float(0.01).mul(srcData.z).max(float(0.0001));
            const srcGlow = float(1).sub(srcDist.div(srcRadius)).clamp(0, 1).mul(srcData.w);
            emissive = emissive.add(sourceGlowCol.mul(0.5).mul(srcGlow));
        }

        // --- Lava source indicators (orange glow, unrolled over DataTexture) ---
        const lavaSourceGlowCol = vec3(1.0, 0.6, 0.1);
        const lavaSrcTex = texture(this.lavaSourceDataTexture);
        for (let i = 0; i < MAX_SOURCES; i++) {
            const lsUv = vec2((i + 0.5) / MAX_SOURCES, 0.5);
            const lsData = lavaSrcTex.uv(lsUv);
            const lsDist = length(sampling.uv.sub(vec2(lsData.x, lsData.y)));
            const lsRadius = float(0.01).mul(lsData.z).max(float(0.0001));
            const lsGlow = float(1).sub(lsDist.div(lsRadius)).clamp(0, 1).mul(lsData.w);
            emissive = emissive.add(lavaSourceGlowCol.mul(0.5).mul(lsGlow));
        }

        // --- Flow trace overlay (modifies albedo; PBR will light it) ---
        const flowTraceEnabled = this.showFlowTraceUniform.equal(1);
        const sval = sampling.sedimentBlend;
        const flowIntensity = float(1).sub(pow(float(2.718), sval.mul(-300).clamp(-10, 0)));
        const albedoLum = albedo.x.mul(0.299).add(albedo.y.mul(0.587)).add(albedo.z.mul(0.114));
        const flowColorBright = vec3(240 / 255, 230 / 255, 140 / 255);
        const flowColorDark = vec3(0.35, 0.25, 0.10);
        const flowColor = mix(flowColorBright, flowColorDark, smoothstep(float(0.35), float(0.55), albedoLum));
        const flowBlended = mix(albedo, flowColor, flowIntensity.mul(1.5).clamp(0, 0.85));
        albedo = flowTraceEnabled.select(flowBlended, albedo);

        // --- Sediment trace overlay (3-tier gradient, modifies albedo) ---
        const sedTraceEnabled = this.showSedimentTraceUniform.equal(1);
        const ssval = float(1).sub(pow(float(2.718), sampling.sediment.x.mul(-7).clamp(-10, 0)));
        const lightSediCol = vec3(0.0, 0.5, 0.3);
        const medSediCol = vec3(0.0, 0.5, 0.5);
        const deepSediCol = vec3(0.0, 0.0, 0.99);
        const smallThresh = float(0.4);
        const largeThresh = float(0.7);
        const band1 = mix(albedo, lightSediCol, ssval.div(smallThresh).clamp(0, 1));
        const band2 = mix(lightSediCol, medSediCol, ssval.sub(smallThresh).div(float(0.3)).clamp(0, 1));
        const band3 = mix(medSediCol, deepSediCol, ssval.sub(largeThresh).div(float(0.3)).clamp(0, 1));
        const sediColor = ssval.lessThan(smallThresh).select(band1,
            ssval.lessThan(largeThresh).select(band2, band3));
        const sedBlended = mix(albedo, sediColor, ssval.clamp(0, 1));
        albedo = sedTraceEnabled.select(sedBlended, albedo);

        // --- PBR node assignments ---
        // Shadows handled by Three.js built-in shadow mapping (DirectionalLight.castShadow)
        this.colorNode = albedo;
        // Blend detail normal with heightmap normal (additive in tangent space).
        // Heightmap normal is object-space; detail normal is tangent-space perturbation.
        // We add the XZ perturbation from detail into the heightmap normal, then re-normalize.
        const hmNormal = sampling.normal.negate();
        const blendedNormal = normalize(vec3(
            hmNormal.x.add(detail.detailNormal.x),
            hmNormal.y.add(detail.detailNormal.y.sub(float(1))), // subtract 1 since detailNormal.y = 1 (flat base)
            hmNormal.z.add(detail.detailNormal.z),
        ));
        this.normalNode = transformNormalToView(blendedNormal);
        this.roughnessNode = roughness;
        this.metalnessNode = float(0.0);
        this.emissiveNode = emissive;

        // --- Debug visualization (all modes from legacy terrain-frag) ---
        // 0=normal, 1=sediment, 2=velocity, 3=terrain, 4=flux, 5=terrainflux, 7=flow, 10=rock
        const dbg = this.debugModeUniform;
        const debugTerrain = vec3(normHeight, normHeight, normHeight);
        const debugSediment = sampling.sediment.mul(float(2));
        const debugVelocity = sampling.velocity.div(float(20));
        const debugFlux = sampling.flux.div(float(3));
        const debugTerrainFlux = sampling.terrainFlux.mul(float(100000));
        const debugFlow = vec3(sampling.sedimentBlend, sampling.sedimentBlend, sampling.sedimentBlend).mul(float(300));
        const debugRock = vec3(sampling.rock, sampling.rock, sampling.rock);

        // Lava debug views (sample lava textures if available)
        const curUv = sampling.uv;
        let debugLavaHeight = vec3(0, 0, 0);
        let debugLavaTemp = vec3(0, 0, 0);
        let debugLavaVel = vec3(0, 0, 0);
        let debugLavaVolume = vec3(0, 0, 0);
        let debugLavaLayering = vec3(0, 0, 0);
        if (inputs.lavaMap) {
            const lavaData = texture(inputs.lavaMap, curUv);
            debugLavaHeight = vec3(lavaData.x.mul(5), lavaData.x.mul(2), lavaData.x);  // blue-white ramp
            debugLavaTemp = vec3(lavaData.y, lavaData.y.mul(0.3), float(0));  // red-orange heat

            // LavaVolume: thermal mass = height * temperature (shows where heat is concentrated)
            const thermalMass = clamp(lavaData.x.mul(lavaData.y).mul(10), 0, 1);
            debugLavaVolume = mix(vec3(0, 0, 0.1), mix(vec3(1, 0.3, 0), vec3(1, 1, 0.5), thermalMass), thermalMass);

            // LavaLayering: sample 4 neighbors to show insulation pattern
            const eps = float(1).div(float(inputs.simres ?? 512));
            const nT = texture(inputs.lavaMap, curUv.add(vec2(0, eps)));
            const nR = texture(inputs.lavaMap, curUv.add(vec2(eps, 0)));
            const nB = texture(inputs.lavaMap, curUv.add(vec2(0, eps.negate())));
            const nL = texture(inputs.lavaMap, curUv.add(vec2(eps.negate(), 0)));
            // Average neighbor thermal mass
            const avgNeighborMass = nT.x.mul(nT.y).add(nR.x.mul(nR.y)).add(nB.x.mul(nB.y)).add(nL.x.mul(nL.y)).div(4);
            const selfMass = lavaData.x.mul(lavaData.y);
            // Insulation factor: how much this cell is surrounded by hot lava mass
            const insulation = clamp(avgNeighborMass.mul(3), 0, 1);
            // Show: red = exposed (cools fast), green = insulated (retains heat), blue = self thermal mass
            debugLavaLayering = vec3(
                clamp(float(1).sub(insulation), 0, 1),
                insulation,
                clamp(selfMass.mul(5), 0, 1)
            );
        }
        let debugLavaWaterContact = vec3(0, 0, 0);
        let debugLavaCrust = vec3(0, 0, 0);
        let debugLavaDeltaH = vec3(0, 0, 0);
        if (inputs.lavaMap) {
            const lavaData2 = texture(inputs.lavaMap, curUv);
            // WaterLavaContact: red = lava height, blue = water, green = overlap zone
            const contactIntensity = clamp(lavaData2.x.mul(sampling.water).mul(50), 0, 1);
            debugLavaWaterContact = vec3(
                clamp(lavaData2.x.mul(3), 0, 1),
                contactIntensity,
                clamp(sampling.water.mul(3), 0, 1)
            );

            // LavaCrust: white = thick crust, red-orange = thin/cracking crust
            const crustVal = clamp(lavaData2.w.mul(5), 0, 1);
            const crustCracking = clamp(lavaData2.y.mul(lavaData2.w).mul(3), 0, 1);
            debugLavaCrust = vec3(crustVal, crustCracking, crustVal.mul(0.5));
        }
        let debugThermalErosionRate = vec3(0, 0, 0);
        if (inputs.lavaVelocityMap) {
            const lavaVelData = texture(inputs.lavaVelocityMap, curUv);
            debugLavaVel = abs(vec3(lavaVelData.x, lavaVelData.y, lavaVelData.z)).div(5);

            // LavaDeltaH: green = lava arriving (deltaH > 0), red = lava leaving (deltaH < 0)
            const deltaH = lavaVelData.w;
            const arriving = clamp(deltaH.mul(50), 0, 1);
            const leaving = clamp(deltaH.negate().mul(50), 0, 1);
            debugLavaDeltaH = vec3(leaving, arriving, float(0));

            // ThermalErosionRate: estimated erosion intensity = temperature * speed
            // Black→blue→green→red heatmap
            if (inputs.lavaMap) {
                const lavaForErosion = texture(inputs.lavaMap, curUv);
                const erosionProxy = clamp(lavaForErosion.y.mul(lavaVelData.z).mul(5), 0, 1);
                const erLow = mix(vec3(0, 0, 0.3), vec3(0, 0.8, 0), clamp(erosionProxy.mul(3), 0, 1));
                const erHigh = mix(vec3(0, 0.8, 0), vec3(1, 0.2, 0), clamp(erosionProxy.sub(0.33).mul(3), 0, 1));
                debugThermalErosionRate = erosionProxy.lessThan(float(0.33)).select(erLow, erHigh);
            }
        }

        // Basalt debug view: black→blue→cyan ramp by basalt height
        let debugBasalt = vec3(0, 0, 0);
        if (inputs.basaltMap) {
            const basaltVal = texture(inputs.basaltMap, curUv).x;
            const basaltNorm = clamp(basaltVal.mul(float(500)).div(this.simresUniform), 0, 1);
            const basaltLow = mix(vec3(0, 0, 0), vec3(0.1, 0.2, 0.8), clamp(basaltNorm.mul(3), 0, 1));
            const basaltHigh = mix(vec3(0.1, 0.2, 0.8), vec3(0.3, 0.9, 1.0), clamp(basaltNorm.sub(0.33).mul(3), 0, 1));
            debugBasalt = basaltNorm.lessThan(float(0.33)).select(basaltLow, basaltHigh);
        }

        const debugColor = dbg.equal(3).select(debugTerrain,
            dbg.equal(1).select(debugSediment,
                dbg.equal(2).select(debugVelocity,
                    dbg.equal(4).select(debugFlux,
                        dbg.equal(5).select(debugTerrainFlux,
                            dbg.equal(7).select(debugFlow,
                                dbg.equal(10).select(debugRock,
                                    dbg.equal(11).select(debugLavaHeight,
                                        dbg.equal(12).select(debugLavaTemp,
                                            dbg.equal(13).select(debugLavaVel,
                                                dbg.equal(14).select(debugLavaVolume,
                                                    dbg.equal(15).select(debugLavaLayering,
                                                        dbg.equal(16).select(debugLavaWaterContact,
                                                            dbg.equal(17).select(debugLavaCrust,
                                                                dbg.equal(18).select(debugLavaDeltaH,
                                                                    dbg.equal(19).select(debugThermalErosionRate,
                                                                        dbg.equal(20).select(debugBasalt,
                                                                            vec3(0, 0, 0))))))))))))))))));

        // Debug override: bypass PBR with flat unlit color when debug mode is active
        this.outputNode = dbg.greaterThan(float(0)).select(
            vec4(debugColor, float(1)),
            output
        );
    }
}
