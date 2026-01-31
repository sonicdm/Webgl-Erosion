import { Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraPosition, clamp, dot, float, max, min, mix, normalize, normalLocal, positionLocal, positionWorld, pow, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

export interface LavaMaterialNodeInputs {
    /** Heightmap texture (R=terrainHeight, G=water, B=rock, A=baseRock) */
    heightmap?: Texture;
    /** Lava map texture (R=lavaHeight, G=temperature, B=viscosity, A=crustThickness) */
    lavaMap?: Texture;
    /** Lava velocity map texture (R=velX, G=velY, B=speed, A=heat) */
    lavaVelocityMap?: Texture;
    /** Simulation resolution */
    simres?: number;
    /** Light direction */
    lightDir?: [number, number, number];
}

/**
 * Lava material using Three.js NodeMaterial (TSL).
 * Renders lava as a transparent plane displaced above terrain+water.
 * Uses heat-based coloring with crust darkening and incandescent glow.
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
        const heat = lavaVel ? lavaVel.w : temperature;

        // --- Vertex displacement: lava sits on top of terrain + water ---
        // Small upward bias (0.0004) prevents Z-fighting
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

        // --- View and light ---
        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const lightDir = normalize(this.lightDirUniform);
        const surfaceNormal = lavaNormal.negate();
        const lamb = max(dot(surfaceNormal, lightDir), float(0.15));

        // --- Lava coloring based on temperature/heat ---
        // Hot lava: bright orange-yellow, cool: dark basalt
        const basaltColor = vec3(0.15, 0.12, 0.10);  // cool solidified rock
        const hotLavaColor = vec3(1.0, 0.35, 0.05);   // molten orange
        const whiteHotColor = vec3(1.0, 0.85, 0.3);   // white-hot center

        // Use heat (from velocity) combined with temperature for color
        const effectiveHeat = clamp(heat.mul(0.5).add(temperature.mul(0.5)), 0, 1);

        // Two-stage color blend: basalt → hot orange → white-hot
        const moltenColor = mix(hotLavaColor, whiteHotColor, clamp(effectiveHeat.sub(0.5).mul(2.0), 0, 1));
        let lavaColor = mix(basaltColor, moltenColor, clamp(effectiveHeat.mul(2.0), 0, 1));

        // Crust rendering: thicker crust darkens the surface
        // Cracks in crust reveal hot lava beneath
        const crustFactor = clamp(crustThickness.mul(5.0), 0, 1);
        const crustDarkening = mix(lavaColor, basaltColor.mul(lamb), crustFactor);

        // Temperature modulates crack visibility - hotter = more cracks showing through
        const crackReveal = clamp(temperature.mul(crustFactor), 0, 1);
        lavaColor = mix(crustDarkening, lavaColor, crackReveal.mul(0.5));

        // Emission: hot lava glows (not affected by lighting)
        const emissiveIntensity = clamp(effectiveHeat.mul(effectiveHeat), 0, 1);
        const emissiveColor = moltenColor.mul(emissiveIntensity.mul(0.8));

        // Final color: lit surface + emissive glow
        const finalColor = lavaColor.mul(lamb).add(emissiveColor);

        // Channel overflow for incandescence (from Three.js lava shader)
        // When red is very hot, bleed into green/blue for white-hot appearance
        // (Approximated in TSL with smooth blending since we can't do channel mutation)

        // --- Opacity: based on lava height with shallow edge fade ---
        const depthScaled = clamp(lavaHeight.mul(float(180)).div(this.simresUniform), 0, 4);
        const dpVal = float(1).sub(pow(float(2.718), depthScaled.negate()));
        const shallowFade = clamp(lavaHeight.mul(float(180)).div(this.simresUniform).mul(float(8)), 0, 1);
        const opacity = min(dpVal.mul(shallowFade).mul(float(2.0)), float(1));

        this.colorNode = finalColor;
        this.opacityNode = opacity;
    }
}
