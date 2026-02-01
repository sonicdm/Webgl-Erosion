import { Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, dot, float, fract, max, min, mix, normalize, normalLocal, positionLocal, pow, sin, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

export interface LavaMaterialNodeInputs {
    /** Heightmap texture (R=terrainHeight, G=water, B=rock, A=baseRock) */
    heightmap?: Texture;
    /** Lava map texture (R=lavaHeight, G=temperature, B=viscosity, A=crustThickness) */
    lavaMap?: Texture;
    /** Lava velocity map texture (R=velX, G=velY, B=speed, A=deltaH) */
    lavaVelocityMap?: Texture;
    /** Simulation resolution */
    simres?: number;
    /** Light direction */
    lightDir?: [number, number, number];
}

/**
 * Lava material using Three.js NodeMaterial (TSL).
 * Renders lava as a transparent plane displaced above terrain+water.
 *
 * Temperature-driven 5-stage color ramp:
 *   >0.90 (>1150°C): white/yellow
 *   0.70-0.90 (1000-1150°C): bright orange
 *   0.45-0.70 (650-1000°C): red
 *   0.35-0.45 (500-650°C): dark red/brown
 *   <0.35 (solid): black basalt
 *
 * Emissive glow from hot lava, black crust with glowing cracks.
 * Manual Lambertian lighting (project has no scene lights).
 */
export class LavaMaterialNode extends MeshBasicNodeMaterial {
    private simresUniform: any;
    private lightDirUniform: any;
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
    }): void {
        if (params.lightDir !== undefined) {
            this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
        }
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

        // Vertex displacement: terrain + full lava height.
        // Lava is a volume sitting on terrain — the mesh represents the lava surface.
        const totalHeight = terrainHeight.add(lavaHeight);
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
        const hL = hmL.x.add(lavaL.x);
        const hR = hmR.x.add(lavaR.x);
        const hD = hmD.x.add(lavaD.x);
        const hU = hmU.x.add(lavaU.x);
        const dhdx = hR.sub(hL).mul(0.5);
        const dhdy = hU.sub(hD).mul(0.5);
        const surfaceNormal = normalize(vec3(dhdx.negate(), float(1), dhdy.negate()));

        // --- Manual Lambertian lighting (matching terrain material) ---
        const lightDir = normalize(this.lightDirUniform);
        const lamb = max(dot(surfaceNormal, lightDir), float(0.05));

        // --- Temperature-driven 5-stage color ramp ---
        // Real lava color reference (USGS):
        //   >1150°C (T>0.90): incandescent white-yellow
        //   1000-1150°C (T 0.70-0.90): bright orange
        //   650-1000°C (T 0.45-0.70): cherry red
        //   500-650°C (T 0.35-0.45): dark red/brown
        //   <500°C (T<0.35): solid black basalt
        const T = clamp(temperature, 0, 1);

        const colBlack = vec3(0.05, 0.04, 0.03);       // solid basalt
        const colDarkRed = vec3(0.3, 0.05, 0.02);      // dark red/brown
        const colRed = vec3(0.8, 0.15, 0.02);           // cherry red
        const colOrange = vec3(1.0, 0.45, 0.05);        // bright orange
        const colYellow = vec3(1.0, 0.85, 0.35);        // incandescent white/yellow

        // Smooth interpolation between stages
        const t1 = smoothstep(float(0.30), float(0.40), T); // black → dark red
        const t2 = smoothstep(float(0.40), float(0.50), T); // dark red → red
        const t3 = smoothstep(float(0.55), float(0.75), T); // red → orange
        const t4 = smoothstep(float(0.80), float(0.95), T); // orange → yellow

        let baseColor = mix(colBlack, colDarkRed, t1);
        baseColor = mix(baseColor, colRed, t2);
        baseColor = mix(baseColor, colOrange, t3);
        baseColor = mix(baseColor, colYellow, t4);

        // --- Crust darkening ---
        // Crust forms a dark insulating skin over the hot interior.
        // Where crust is thick and temperature is moderate, surface appears dark.
        // Where temperature is very high, crust melts and glowing interior shows through.
        const crustFactor = clamp(crustThickness.mul(8), 0, 1);
        const crustMeltthrough = smoothstep(float(0.5), float(0.8), T);
        const crustDarkening = crustFactor.mul(float(1).sub(crustMeltthrough));
        const crustColor = vec3(0.06, 0.05, 0.04); // dark crust
        const surfaceColor = mix(baseColor, crustColor, crustDarkening);

        // --- Crust crack rendering (glowing fissures) ---
        // Where crust exists but underlying lava is still hot, render glowing cracks.
        // Uses multi-octave procedural noise to create irregular crack patterns.
        // Crack density increases with: speed (shear cracking), temperature differential
        // (thermal stress), and decreases with crust thickness (thick crust has fewer cracks).

        // Hash-based noise at two scales for irregular crack patterns
        const noiseUv1 = safeUv.mul(float(200)); // fine detail
        const noiseUv2 = safeUv.mul(float(80));  // larger cracks
        // Classic GPU hash: fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453)
        const hash1 = fract(sin(dot(noiseUv1, vec2(12.9898, 78.233))).mul(43758.5453));
        const hash2 = fract(sin(dot(noiseUv2, vec2(39.346, 11.135))).mul(23421.631));

        // Combine octaves: creates irregular web-like pattern
        const crackNoise = min(hash1, hash2);

        // Crack conditions: crust must exist and lava underneath must be hot
        const hasCrust = smoothstep(float(0.01), float(0.05), crustThickness);
        const hotUnderneath = smoothstep(float(0.35), float(0.6), T);
        // Crack width: thinner crust = more cracks, faster flow = more shear cracks
        const baseCrackWidth = float(0.12);
        const crackWidth = baseCrackWidth.add(
            clamp(float(1).sub(crustThickness.mul(4)), 0, 0.15)  // thin crust = wider cracks
        );

        // Crack mask: noise below threshold = crack
        const isCrack = crackNoise.lessThan(crackWidth);
        const crackIntensity = hasCrust.mul(hotUnderneath).mul(isCrack.select(float(1), float(0)));

        // Crack glow color: show the hot baseColor underneath with full brightness
        const crackGlow = baseColor.mul(crackIntensity).mul(1.2);

        // --- Emissive glow ---
        // Hot lava emits light — this is added on top of Lambertian lighting.
        // Emissive intensity ramps up above solidification temperature.
        const emissiveThreshold = float(0.3);
        const emissiveT = clamp(T.sub(emissiveThreshold).div(float(1).sub(emissiveThreshold)), 0, 1);
        const emissiveIntensity = emissiveT.mul(emissiveT).mul(1.5);
        // Crust suppresses emission except at cracks
        const crustEmissionBlock = float(1).sub(crustDarkening.mul(0.7));
        // Cracks get full emissive regardless of crust darkening
        const baseEmissive = baseColor.mul(emissiveIntensity).mul(crustEmissionBlock);
        const crackEmissive = crackGlow.mul(emissiveIntensity.mul(1.5));
        const emissiveColor = max(baseEmissive, crackEmissive);

        // --- Final color: lit surface + crack glow + emissive ---
        // Cracks punch through crust darkening to show hot color
        const crackedSurface = mix(surfaceColor, baseColor, crackIntensity);
        const litColor = crackedSurface.mul(lamb).add(emissiveColor);

        // --- Speed-based heat glow (frictional heating from velocity) ---
        let finalColor = litColor;
        if (inputs.lavaVelocityMap) {
            const vel = texture(inputs.lavaVelocityMap, safeUv);
            const speed = vel.z;
            const heatGlow = clamp(speed.mul(0.3), 0, 0.15);
            finalColor = litColor.add(vec3(heatGlow, heatGlow.mul(0.3), float(0)));
        }

        // --- Opacity: solid where there's lava, fades at thin edges ---
        const opacity = clamp(lavaHeight.mul(float(500)).div(this.simresUniform), 0, 1);

        this.colorNode = finalColor;
        this.opacityNode = opacity;
    }
}
