import { Texture, Vector2, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, dot, float, fract, length, max, min, mix, normalize, normalLocal, positionLocal, pow, sin, cos, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

export interface LavaMaterialNodeInputs {
    /** Heightmap texture (R=terrainHeight, G=water, B=rock, A=baseRock) */
    heightmap?: Texture;
    /** Lava map texture (R=lavaHeight, G=temperature, B=viscosity, A=crustThickness) */
    lavaMap?: Texture;
    /** Lava velocity map texture (R=velX, G=velY, B=speed, A=deltaH) */
    lavaVelocityMap?: Texture;
    /** Cool lava map texture (R=coolLavaHeight) */
    coolLavaMap?: Texture;
    /** Basalt map texture (R=basaltHeight) */
    basaltMap?: Texture;
    /** Simulation resolution */
    simres?: number;
    /** Light direction */
    lightDir?: [number, number, number];
    /** Temperature threshold where orange dominates (default 0.45) */
    orangeTemp?: number;
    /** Temperature threshold where yellow dominates (default 0.65) */
    yellowTemp?: number;
    /** Emissive glow strength (default 0.35) */
    emissiveStrength?: number;
}

/**
 * Lava material using Three.js NodeMaterial (TSL).
 * Renders lava as a transparent plane displaced above terrain+water.
 *
 * Temperature-driven color ramp with wide overlapping transitions.
 * Animated multi-octave turbulence simulates convection.
 * Manual Lambertian lighting (project has no scene lights).
 */
export class LavaMaterialNode extends MeshBasicNodeMaterial {
    private simresUniform: any;
    private lightDirUniform: any;
    private orangeTempUniform: any;
    private yellowTempUniform: any;
    private emissiveStrengthUniform: any;
    private timeUniform: any;
    private debugModeUniform: any;
    private brushPosUniform: any;
    private brushSizeUniform: any;
    private brushTypeUniform: any;
    private brushColorUniform: any;
    private inputs: LavaMaterialNodeInputs;

    constructor(inputs: LavaMaterialNodeInputs = {}) {
        super();
        this.inputs = { ...inputs };
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.lightDirUniform = uniform(new Vector3(
            inputs.lightDir?.[0] ?? 0.4,
            inputs.lightDir?.[1] ?? 0.8,
            inputs.lightDir?.[2] ?? 0.0
        ));
        this.orangeTempUniform = uniform(inputs.orangeTemp ?? 0.45);
        this.yellowTempUniform = uniform(inputs.yellowTemp ?? 0.65);
        this.emissiveStrengthUniform = uniform(inputs.emissiveStrength ?? 0.35);
        this.timeUniform = uniform(0.0);
        this.debugModeUniform = uniform(0);
        this.brushPosUniform = uniform(new Vector2(-10, -10));
        this.brushSizeUniform = uniform(0);
        this.brushTypeUniform = uniform(0);
        this.brushColorUniform = uniform(new Vector3(0.1, 0.3, 0.8));

        this.transparent = true;
        this.depthWrite = true;

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<LavaMaterialNodeInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.simres !== undefined) {
            this.simresUniform.value = inputs.simres;
        }
        this.buildGraph(this.inputs);
    }

    updateUniforms(params: {
        lightDir?: [number, number, number];
        orangeTemp?: number;
        yellowTemp?: number;
        emissiveStrength?: number;
        time?: number;
        debugMode?: number;
    }): void {
        if (params.lightDir !== undefined) {
            this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
        }
        if (params.orangeTemp !== undefined) {
            this.orangeTempUniform.value = params.orangeTemp;
        }
        if (params.yellowTemp !== undefined) {
            this.yellowTempUniform.value = params.yellowTemp;
        }
        if (params.emissiveStrength !== undefined) {
            this.emissiveStrengthUniform.value = params.emissiveStrength;
        }
        if (params.time !== undefined) {
            this.timeUniform.value = params.time;
        }
        if (params.debugMode !== undefined) {
            this.debugModeUniform.value = params.debugMode;
        }
    }

    /** Update brush uniforms only (no graph rebuild). Call each frame. */
    updateBrush(brushPos: [number, number], brushSize: number, brushType: number): void {
        this.brushPosUniform.value.set(brushPos[0], brushPos[1]);
        this.brushSizeUniform.value = brushSize;
        this.brushTypeUniform.value = brushType;
        const colors: Record<number, [number, number, number]> = {
            1: [214 / 255, 184 / 255, 96 / 255],
            2: [0.1, 0.3, 0.8],
            3: [0.35, 0.38, 0.45],
            4: [0.5, 0.8, 1.0],
            5: [1.0, 1.0, 0.3],
            6: [0.3, 1.0, 0.3],
            7: [0.88, 0.34, 0.13],
        };
        const c = colors[brushType] ?? [0, 0, 0];
        this.brushColorUniform.value.set(c[0], c[1], c[2]);
    }

    private buildGraph(inputs: LavaMaterialNodeInputs): void {
        if (!inputs.heightmap || !inputs.lavaMap) {
            this.colorNode = vec3(0.0, 0.0, 0.0);
            this.opacityNode = float(0.0);
            return;
        }

        // Match terrain material's UV clamping to avoid edge displacement mismatch
        const halfTexel = float(0.5).div(this.simresUniform);
        const safeUv = clamp(uv(), vec2(halfTexel, halfTexel), vec2(float(1).sub(halfTexel), float(1).sub(halfTexel)));
        const hm = texture(inputs.heightmap, safeUv);
        const lava = texture(inputs.lavaMap, safeUv);

        const terrainHeight = hm.x;
        const lavaHeight = lava.x;
        const temperature = lava.y;
        const crustThickness = lava.w;

        // Sample coolLava and basalt layers for surface height stacking
        const coolLavaHeight = inputs.coolLavaMap ? texture(inputs.coolLavaMap, safeUv).x : float(0);
        const basaltHeight = inputs.basaltMap ? texture(inputs.basaltMap, safeUv).x : float(0);

        // Vertex displacement: terrain + basalt + coolLava + lava (full surface stack)
        const totalHeight = terrainHeight.add(basaltHeight).add(coolLavaHeight).add(lavaHeight);
        const displacementY = totalHeight.div(this.simresUniform).add(float(0.0002));
        this.positionNode = positionLocal.add(normalLocal.mul(displacementY));

        // --- Normal estimation from lava surface for lighting ---
        const eps = float(1).div(this.simresUniform);
        const hmL = texture(inputs.heightmap, safeUv.add(vec2(eps.negate(), 0)));
        const hmR = texture(inputs.heightmap, safeUv.add(vec2(eps, 0)));
        const hmD = texture(inputs.heightmap, safeUv.add(vec2(0, eps.negate())));
        const hmU = texture(inputs.heightmap, safeUv.add(vec2(0, eps)));
        const lavaL = texture(inputs.lavaMap, safeUv.add(vec2(eps.negate(), 0)));
        const lavaR = texture(inputs.lavaMap, safeUv.add(vec2(eps, 0)));
        const lavaD = texture(inputs.lavaMap, safeUv.add(vec2(0, eps.negate())));
        const lavaU = texture(inputs.lavaMap, safeUv.add(vec2(0, eps)));
        // Include basalt + coolLava in normal estimation
        const clL = inputs.coolLavaMap ? texture(inputs.coolLavaMap, safeUv.add(vec2(eps.negate(), 0))).x : float(0);
        const clR = inputs.coolLavaMap ? texture(inputs.coolLavaMap, safeUv.add(vec2(eps, 0))).x : float(0);
        const clD = inputs.coolLavaMap ? texture(inputs.coolLavaMap, safeUv.add(vec2(0, eps.negate()))).x : float(0);
        const clU = inputs.coolLavaMap ? texture(inputs.coolLavaMap, safeUv.add(vec2(0, eps))).x : float(0);
        const bL = inputs.basaltMap ? texture(inputs.basaltMap, safeUv.add(vec2(eps.negate(), 0))).x : float(0);
        const bR = inputs.basaltMap ? texture(inputs.basaltMap, safeUv.add(vec2(eps, 0))).x : float(0);
        const bD = inputs.basaltMap ? texture(inputs.basaltMap, safeUv.add(vec2(0, eps.negate()))).x : float(0);
        const bU = inputs.basaltMap ? texture(inputs.basaltMap, safeUv.add(vec2(0, eps))).x : float(0);
        const hL = hmL.x.add(bL).add(clL).add(lavaL.x);
        const hR = hmR.x.add(bR).add(clR).add(lavaR.x);
        const hD = hmD.x.add(bD).add(clD).add(lavaD.x);
        const hU = hmU.x.add(bU).add(clU).add(lavaU.x);
        const dhdx = hR.sub(hL).mul(0.5);
        const dhdy = hU.sub(hD).mul(0.5);
        const surfaceNormal = normalize(vec3(dhdx.negate(), float(1), dhdy.negate()));

        // --- Manual Lambertian lighting (matching terrain material) ---
        const lightDir = normalize(this.lightDirUniform);
        const lamb = max(dot(surfaceNormal, lightDir), float(0.05));

        const T = clamp(temperature, 0, 1);
        const time = this.timeUniform;

        // --- Animated turbulence: simulates convection cells ---
        // Two noise layers scrolling in different directions at different speeds.
        // This perturbs the temperature lookup to create organic hot/cool patches
        // that move across the surface like real convective overturning.
        const turbScale1 = float(40);
        const turbScale2 = float(18);
        const turbSpeed1 = float(0.03);
        const turbSpeed2 = float(0.02);
        // Layer 1: fine detail, scrolls diagonally
        const turbUv1 = safeUv.mul(turbScale1).add(vec2(time.mul(turbSpeed1), time.mul(turbSpeed1).mul(0.7)));
        const turb1 = fract(sin(dot(turbUv1, vec2(12.9898, 78.233))).mul(43758.5453));
        // Layer 2: larger cells, scrolls opposite direction
        const turbUv2 = safeUv.mul(turbScale2).add(vec2(time.mul(turbSpeed2).negate(), time.mul(turbSpeed2).mul(1.3)));
        const turb2 = fract(sin(dot(turbUv2, vec2(39.346, 11.135))).mul(23421.631));
        // Layer 3: very slow large-scale drift
        const turbUv3 = safeUv.mul(float(8)).add(vec2(time.mul(0.008), time.mul(0.005).negate()));
        const turb3 = fract(sin(dot(turbUv3, vec2(71.917, 23.687))).mul(67432.891));

        // Combine: weighted blend of octaves (fine + medium + coarse)
        const turbulence = turb1.mul(0.3).add(turb2.mul(0.45)).add(turb3.mul(0.25));

        // Perturb temperature before color ramp lookup.
        // Strength scales with temperature — hot lava has more turbulence, cool lava is static.
        const turbStrength = smoothstep(float(0.2), float(0.5), T).mul(0.15);
        const Tperturbed = clamp(T.add(turbulence.sub(0.5).mul(turbStrength)), 0, 1);

        // --- Temperature-driven color ramp with WIDE overlapping transitions ---
        // Wider bands (0.20-0.30) create smooth gradients instead of visible banding.
        // Transitions overlap so colors blend naturally like real lava.
        const colBlack = vec3(0.05, 0.04, 0.03);       // solid basalt
        const colDarkRed = vec3(0.3, 0.05, 0.02);      // dark red/brown
        const colRed = vec3(0.85, 0.12, 0.02);          // cherry red
        const colOrange = vec3(1.0, 0.45, 0.05);        // bright orange
        const colYellow = vec3(1.0, 0.75, 0.3);         // incandescent yellow-orange

        const orangeT = this.orangeTempUniform;
        const yellowT = this.yellowTempUniform;

        // Wide overlapping smoothstep bands — each 0.20-0.30 wide
        const t1 = smoothstep(float(0.10), float(0.30), Tperturbed);                    // black → dark red
        const t2 = smoothstep(float(0.20), orangeT, Tperturbed);                         // dark red → red
        const t3 = smoothstep(orangeT.sub(0.10), orangeT.add(0.20), Tperturbed);        // red → orange
        const t4 = smoothstep(orangeT.add(0.05), yellowT.add(0.15), Tperturbed);        // orange → yellow

        let baseColor = mix(colBlack, colDarkRed, t1);
        baseColor = mix(baseColor, colRed, t2);
        baseColor = mix(baseColor, colOrange, t3);
        baseColor = mix(baseColor, colYellow, t4);

        // --- Crust darkening ---
        const crustFactor = clamp(crustThickness.mul(20), 0, 1);
        const crustMeltthrough = smoothstep(float(0.5), float(0.8), T);
        const crustDarkening = crustFactor.mul(float(1).sub(crustMeltthrough));
        const crustColor = vec3(0.06, 0.05, 0.04);
        const surfaceColor = mix(baseColor, crustColor, crustDarkening);

        // --- Crust crack rendering (glowing fissures) ---
        // Animated cracks: noise scrolls slowly to simulate thermal stress fracturing
        const crackUv1 = safeUv.mul(float(200)).add(vec2(time.mul(0.01), float(0)));
        const crackUv2 = safeUv.mul(float(80)).add(vec2(float(0), time.mul(0.007).negate()));
        const hash1 = fract(sin(dot(crackUv1, vec2(12.9898, 78.233))).mul(43758.5453));
        const hash2 = fract(sin(dot(crackUv2, vec2(39.346, 11.135))).mul(23421.631));
        const crackNoise = min(hash1, hash2);

        const hasCrust = smoothstep(float(0.01), float(0.05), crustThickness);
        const hotUnderneath = smoothstep(float(0.35), float(0.6), T);
        const baseCrackWidth = float(0.12);
        const crackWidth = baseCrackWidth.add(
            clamp(float(1).sub(crustThickness.mul(4)), 0, 0.15)
        );
        const isCrack = crackNoise.lessThan(crackWidth);
        const crackIntensity = hasCrust.mul(hotUnderneath).mul(isCrack.select(float(1), float(0)));
        const crackGlow = baseColor.mul(crackIntensity).mul(1.2);

        // --- Emissive glow ---
        const emissiveThreshold = float(0.3);
        const emissiveT = clamp(T.sub(emissiveThreshold).div(float(1).sub(emissiveThreshold)), 0, 1);
        const emissiveIntensity = emissiveT.mul(emissiveT).mul(this.emissiveStrengthUniform);
        const crustEmissionBlock = float(1).sub(crustDarkening.mul(0.7));
        const baseEmissive = baseColor.mul(emissiveIntensity).mul(crustEmissionBlock);
        const crackEmissive = crackGlow.mul(emissiveIntensity.mul(1.2));
        const emissiveColor = max(baseEmissive, crackEmissive);

        // --- Final color: lit surface + crack glow + emissive ---
        const crackedSurface = mix(surfaceColor, baseColor, crackIntensity);
        const litColor = crackedSurface.mul(lamb).add(emissiveColor);

        // --- Animated flow texture + convection surface detail ---
        let finalColor = litColor;
        if (inputs.lavaVelocityMap) {
            const vel = texture(inputs.lavaVelocityMap, safeUv);
            const speed = vel.z;
            const velX = vel.x;
            const velY = vel.y;

            // Flow-aligned noise: stretched along velocity direction
            const flowScale = float(80);
            const flowUv = safeUv.mul(flowScale);
            const speedFactor = clamp(speed.mul(5), 0, 1);

            // Animated flow detail: scrolls with velocity + time
            const stretchedU = flowUv.x.add(velX.mul(flowScale).mul(0.3)).add(time.mul(0.05));
            const stretchedV = flowUv.y.add(velY.mul(flowScale).mul(0.3)).add(time.mul(0.03));
            const flowNoise = fract(sin(
                dot(vec2(stretchedU, stretchedV), vec2(17.239, 43.157))
            ).mul(28461.327));

            // Stronger modulation than before: 0.85-1.15 range for visible texture
            const detailStrength = mix(float(0.06), float(0.15), speedFactor);
            const flowDetail = float(1).sub(detailStrength).add(flowNoise.mul(detailStrength.mul(2)));
            finalColor = litColor.mul(flowDetail);

            // Speed-based heat glow
            const heatGlow = clamp(speed.mul(0.15), 0, 0.06);
            finalColor = finalColor.add(vec3(heatGlow, heatGlow.mul(0.3), float(0)));
        }

        // --- Brush overlay (same as terrain, so brush shows over lava) ---
        const brushPos = this.brushPosUniform;
        const brushSize = this.brushSizeUniform;
        const brushType = this.brushTypeUniform;
        const brushDelta = safeUv.sub(brushPos);
        const distToBrush = length(brushDelta);
        const brushRadius = float(0.01).mul(brushSize);
        const brushCol = this.brushColorUniform;
        const ringWidth = brushRadius.mul(0.06).max(float(0.0008));
        const ringDist = distToBrush.sub(brushRadius).abs();
        const ringFactor = float(1).sub(ringDist.div(ringWidth)).clamp(0, 1);
        const insideFill = float(1).sub(distToBrush.div(brushRadius)).clamp(0, 1).mul(0.12);
        const brushIntensity = ringFactor.mul(0.95).add(insideFill);
        const brushActiveFloat = brushType.greaterThan(0).select(float(1), float(0));
        const brushBlend = brushActiveFloat.mul(brushIntensity);
        finalColor = finalColor.add(brushCol.mul(brushBlend));

        // --- Opacity: visible where mobile lava or cool lava exists ---
        // Cool lava is still part of the lava system (can re-melt).
        // Basalt is permanent and rendered by the terrain shader instead.
        const lavaPresence = lavaHeight.add(coolLavaHeight);
        // Lava is physically opaque. 100000x multiplier ensures any lava presence
        // (even thin films at h=0.01) saturates to full opacity.
        const baseOpacity = clamp(lavaPresence.mul(float(100000)).div(this.simresUniform), 0, 1);
        // When any debug view is active, hide the lava material so terrain debug views show through
        const dbg = this.debugModeUniform;
        const opacity = dbg.equal(0).select(baseOpacity, float(0));

        this.colorNode = finalColor;
        this.opacityNode = opacity;
    }
}
