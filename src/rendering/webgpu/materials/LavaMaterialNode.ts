import { Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraPosition, clamp, dot, float, max, min, mix, normalize, normalLocal, positionLocal, positionWorld, pow, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

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

        const curUv = uv();
        const hm = texture(inputs.heightmap, curUv);
        const lava = texture(inputs.lavaMap, curUv);
        const lavaVel = inputs.lavaVelocityMap ? texture(inputs.lavaVelocityMap, curUv) : null;

        const terrainHeight = hm.x;
        const waterLevel = hm.y;
        const lavaHeight = lava.x;
        const temperature = lava.y;
        const crustThickness = lava.w;
        const speed = lavaVel ? lavaVel.z : float(0);

        // --- Vertex displacement: lava sits on top of terrain + water ---
        const totalHeight = terrainHeight.add(waterLevel).add(lavaHeight);
        const displacementY = totalHeight.div(this.simresUniform).add(float(0.0004));
        this.positionNode = positionLocal.add(normalLocal.mul(displacementY));

        // --- Lava surface normal via 4-neighbor central differences ---
        const eps = float(2).div(this.simresUniform);
        const hmR = texture(inputs.heightmap, curUv.add(vec2(eps, float(0))));
        const hmL = texture(inputs.heightmap, curUv.add(vec2(eps.negate(), float(0))));
        const hmT = texture(inputs.heightmap, curUv.add(vec2(float(0), eps)));
        const hmB = texture(inputs.heightmap, curUv.add(vec2(float(0), eps.negate())));
        const lR = texture(inputs.lavaMap, curUv.add(vec2(eps, float(0))));
        const lL = texture(inputs.lavaMap, curUv.add(vec2(eps.negate(), float(0))));
        const lT = texture(inputs.lavaMap, curUv.add(vec2(float(0), eps)));
        const lB = texture(inputs.lavaMap, curUv.add(vec2(float(0), eps.negate())));
        const lTotal = hmL.x.add(hmL.y).add(lL.x);
        const rTotal = hmR.x.add(hmR.y).add(lR.x);
        const tTotal = hmT.x.add(hmT.y).add(lT.x);
        const bTotal = hmB.x.add(hmB.y).add(lB.x);
        const lavaNormal = normalize(vec3(lTotal.sub(rTotal), float(2), bTotal.sub(tTotal)));

        // --- Lighting ---
        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const lightDir = normalize(this.lightDirUniform);
        const surfaceNormal = lavaNormal.negate();
        const lamb = max(dot(surfaceNormal, lightDir), float(0.15));

        // --- 5-stage temperature color ramp ---
        // Normalized T: 1.0 ≈ 1150°C emission temperature
        const blackColor = vec3(0.05, 0.04, 0.03);        // <0.35: solid basalt
        const darkRedColor = vec3(0.3, 0.05, 0.02);       // 0.35-0.45: dark red/brown
        const redColor = vec3(0.85, 0.12, 0.02);           // 0.45-0.70: red hot
        const orangeColor = vec3(1.0, 0.45, 0.05);         // 0.70-0.90: bright orange
        const yellowColor = vec3(1.0, 0.85, 0.35);         // >0.90: white/yellow

        // Smooth transitions between stages
        const t1 = clamp(temperature.sub(0.35).div(0.10), 0, 1);  // black → dark red
        const t2 = clamp(temperature.sub(0.45).div(0.25), 0, 1);  // dark red → red
        const t3 = clamp(temperature.sub(0.70).div(0.20), 0, 1);  // red → orange
        const t4 = clamp(temperature.sub(0.90).div(0.10), 0, 1);  // orange → yellow

        const ramp1 = mix(blackColor, darkRedColor, t1);
        const ramp2 = mix(ramp1, redColor, t2);
        const ramp3 = mix(ramp2, orangeColor, t3);
        const baseColor = mix(ramp3, yellowColor, t4);

        // --- Crust rendering: black crust over hot interior ---
        const crustFactor = clamp(crustThickness.mul(5.0), 0, 1);
        const crustColor = mix(baseColor, blackColor, crustFactor);

        // --- Cracks: where crust is present but temperature is high, reveal hot lava ---
        // crackIntensity is high when: crust is thick AND temperature is still hot
        const crackIntensity = clamp(temperature.sub(0.3).mul(crustFactor).mul(2.5), 0, 1);
        const surfaceColor = mix(crustColor, baseColor, crackIntensity.mul(0.7));

        // --- Emissive glow (not affected by lighting direction) ---
        // Onset at T=0.35, quadratic ramp for natural falloff
        const emissiveStrength = clamp(temperature.sub(0.35), 0, 1);
        const emissiveColor = baseColor.mul(emissiveStrength.mul(emissiveStrength).mul(1.5));

        // --- Flow heat glow: fast-flowing lava glows brighter ---
        const flowHeat = clamp(speed.mul(float(0.3)), 0, 1);
        const flowGlow = orangeColor.mul(flowHeat.mul(float(0.2)));

        // --- Fresnel rim glow for hot edges ---
        const NdotV = max(dot(surfaceNormal, viewDir), float(0));
        const fresnel = pow(float(1).sub(NdotV), float(3));
        const rimGlow = orangeColor.mul(fresnel.mul(emissiveStrength).mul(float(0.3)));

        // --- Final composite: lit surface + emissive + flow glow + rim ---
        const finalColor = surfaceColor.mul(lamb).add(emissiveColor).add(flowGlow).add(rimGlow);

        // --- Opacity: based on lava height with shallow edge fade ---
        const depthScaled = clamp(lavaHeight.mul(float(180)).div(this.simresUniform), 0, 4);
        const dpVal = float(1).sub(pow(float(2.718), depthScaled.negate()));
        const shallowFade = clamp(lavaHeight.mul(float(180)).div(this.simresUniform).mul(float(8)), 0, 1);
        const opacity = min(dpVal.mul(shallowFade).mul(float(2.0)), float(1));

        this.colorNode = finalColor;
        this.opacityNode = opacity;
    }
}
