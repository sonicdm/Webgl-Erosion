import { Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraPosition, clamp, dot, float, max, min, mix, normalize, normalLocal, positionLocal, positionWorld, pow, reflect, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

export interface WaterMaterialNodeInputs {
    /** Heightmap texture (R=height, G=water, B=rock, A=baseRockHeight) */
    heightmap?: Texture;
    /** Sediment map texture */
    sedimentMap?: Texture;
    /** Simulation resolution */
    simres?: number;
    /** Water transparency factor (higher = more transparent) */
    waterTransparency?: number;
    /** Light direction (normalized) */
    lightDir?: [number, number, number];
}

/**
 * Water material using Three.js NodeMaterial (TSL).
 * Ports legacy water-frag.glsl: specular highlights, Fresnel reflection,
 * sediment-based coloring, rock-aware brightness, depth-based opacity.
 */
export class WaterMaterialNode extends MeshBasicNodeMaterial {
    private simresUniform: any;
    private waterTransparencyUniform: any;
    private lightDirUniform: any;
    private inputs: WaterMaterialNodeInputs;

    constructor(inputs: WaterMaterialNodeInputs = {}) {
        super();
        this.inputs = { ...inputs };
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.waterTransparencyUniform = uniform(inputs.waterTransparency ?? 1.0);
        this.lightDirUniform = uniform(new Vector3(
            inputs.lightDir?.[0] ?? 0.4,
            inputs.lightDir?.[1] ?? 0.8,
            inputs.lightDir?.[2] ?? 0.0
        ));

        this.transparent = true;
        this.depthWrite = false;

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<WaterMaterialNodeInputs>): void {
        this.inputs = { ...this.inputs, ...inputs };
        if (inputs.simres !== undefined) {
            this.simresUniform.value = inputs.simres;
        }
        if (inputs.waterTransparency !== undefined) {
            this.waterTransparencyUniform.value = inputs.waterTransparency;
        }
        this.buildGraph(this.inputs);
    }

    updateUniforms(params: {
        waterTransparency?: number;
        lightDir?: [number, number, number];
    }): void {
        if (params.waterTransparency !== undefined) {
            this.waterTransparencyUniform.value = params.waterTransparency;
        }
        if (params.lightDir !== undefined) {
            this.lightDirUniform.value.set(params.lightDir[0], params.lightDir[1], params.lightDir[2]);
        }
    }

    private buildGraph(inputs: WaterMaterialNodeInputs): void {
        if (!inputs.heightmap) {
            this.colorNode = vec3(0.0, 0.3, 0.5);
            this.opacityNode = float(0.5);
            return;
        }

        const curUv = uv();
        const hm = texture(inputs.heightmap, curUv);
        const terrainHeight = hm.x;
        const waterLevel = hm.y;
        const rockVal = hm.z;
        const sediment = inputs.sedimentMap ? texture(inputs.sedimentMap, curUv).x : float(0);

        // --- Vertex displacement ---
        // Small upward bias (0.0002) prevents Z-fighting with terrain at shallow depths
        const totalHeight = terrainHeight.add(sediment).add(waterLevel);
        const displacementY = totalHeight.div(this.simresUniform).add(float(0.0002));
        this.positionNode = positionLocal.add(normalLocal.mul(displacementY));

        // --- Water surface normal via 4-neighbor central differences ---
        // Uses 2-texel offset to average out per-texel noise from point-sampled
        // compute heights, preventing grid-aligned stripe artifacts in specular.
        const eps2 = float(2).div(this.simresUniform);
        const hmR = texture(inputs.heightmap, curUv.add(vec2(eps2, float(0))));
        const hmL = texture(inputs.heightmap, curUv.add(vec2(eps2.negate(), float(0))));
        const hmT = texture(inputs.heightmap, curUv.add(vec2(float(0), eps2)));
        const hmB = texture(inputs.heightmap, curUv.add(vec2(float(0), eps2.negate())));
        // Total surface height = terrain + water at each neighbor
        const lTotal = hmL.x.add(hmL.y);
        const rTotal = hmR.x.add(hmR.y);
        const tTotal = hmT.x.add(hmT.y);
        const bTotal = hmB.x.add(hmB.y);
        // Central difference: (left-right, 2.0, bottom-top), normalized
        const waterNormal = normalize(vec3(lTotal.sub(rTotal), float(2), bTotal.sub(tTotal)));

        // --- View and light vectors ---
        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const lightDir = normalize(this.lightDirUniform);
        const halfway = normalize(lightDir.add(viewDir));

        // --- Specular highlight ---
        // pow(80): low enough to smooth over per-texel normal noise from
        // point-sampled compute heights, while still giving a visible glint.
        const spec = pow(max(dot(waterNormal, halfway), float(0)), float(80));

        // --- Fresnel reflection ---
        // Schlick-like: bias=0.15, scale=0.15, pow=8 — softer than legacy to
        // avoid amplifying per-texel normal noise into visible banding.
        const fresnelBase = clamp(float(1).add(dot(viewDir, waterNormal.negate())), 0, 1);
        const fresnel = clamp(
            float(0.15).add(float(0.15).mul(pow(fresnelBase, float(8)))),
            0, 1
        );
        // Sky color for reflection — use reflected view direction for spatial coherence
        const reflectDir = reflect(viewDir.negate(), waterNormal);
        const reflectedSky = mix(vec3(0.6, 0.6, 0.6), vec3(0.3, 0.5, 0.9), clamp(reflectDir.y, 0, 1));

        // --- Depth-based opacity ---
        // Scale water level to a perceptual depth; clamp to reasonable range
        const depthScaled = clamp(waterLevel.mul(float(180)).div(this.simresUniform), 0, 4);
        const dpVal = float(1).sub(pow(float(2.718), depthScaled.negate()));

        // --- Base water color ---
        // Rock-aware: brighter blue over rock for contrast against dark rock surface
        const isRock = rockVal.greaterThan(0.1);
        const baseColor = isRock.select(
            vec3(0.1, 0.4, 0.65),   // brighter blue on rock
            vec3(0.0, 0.3, 0.5)     // standard deep blue
        );

        // --- Combine: base + Fresnel sky reflection + specular (matches legacy) ---
        const waterColor = baseColor
            .add(fresnel.mul(reflectedSky))
            .add(vec3(spec, spec, spec));

        // Opacity: deeper = more opaque; specular adds slight extra opacity
        // Gentle shallow fade to prevent single-pixel water noise at edges
        const shallowFade = clamp(waterLevel.mul(float(180)).div(this.simresUniform).mul(float(5)), 0, 1);
        const opacity = min(
            float(1.8).add(spec).mul(this.waterTransparencyUniform).mul(dpVal).mul(shallowFade),
            float(1)
        );

        this.colorNode = waterColor;
        this.opacityNode = opacity;
    }
}
