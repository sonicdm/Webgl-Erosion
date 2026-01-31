import { Texture, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraPosition, clamp, dot, float, max, mix, normalize, normalLocal, positionLocal, positionWorld, pow, texture, uniform, uv, vec2, vec3 } from 'three/tsl';

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

        const eps = float(1).div(this.simresUniform);
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

        // --- Water surface normal from heightmap neighbors ---
        // Sample total height (terrain+water) at neighboring texels
        const hmR = texture(inputs.heightmap, curUv.add(vec2(eps, float(0))));
        const hmT = texture(inputs.heightmap, curUv.add(vec2(float(0), eps)));
        const curTotal = terrainHeight.add(waterLevel);
        const rTotal = hmR.x.add(hmR.y);
        const tTotal = hmT.x.add(hmT.y);
        // Cross product of tangent vectors gives normal (matches legacy calnor)
        const n1 = normalize(vec3(float(-1), curTotal.sub(rTotal), float(0)));
        const n2 = normalize(vec3(float(-1), tTotal.sub(rTotal), float(1)));
        const waterNormal = normalize(n1.cross(n2)).negate();

        // --- View and light vectors ---
        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const lightDir = normalize(this.lightDirUniform);
        const halfway = normalize(lightDir.add(viewDir));

        // --- Specular highlight (legacy: pow 333 for tight, bright specular) ---
        const spec = pow(max(dot(waterNormal, halfway), float(0)), float(333));

        // --- Fresnel reflection (legacy: bias=0.2, scale=0.2, pow=22) ---
        const fresnelBase = float(1).add(dot(viewDir, waterNormal.negate()));
        const fresnel = clamp(
            float(0.2).add(float(0.2).mul(pow(fresnelBase, float(22)))),
            0, 1
        );
        // Sky color for reflection
        const reflectedSky = mix(vec3(0.6, 0.6, 0.6), vec3(0.3, 0.5, 0.9), clamp(halfway.y, 0, 1));

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

        // --- Sediment coloring (legacy: red for low sediment → blue for high) ---
        const sedimentAmount = inputs.sedimentMap
            ? clamp(texture(inputs.sedimentMap, curUv).x.mul(2), 0, 1)
            : float(0);
        const sedimentTint = mix(vec3(0.8, 0.0, 0.0), vec3(0.0, 0.0, 0.8), sedimentAmount);
        // Blend sediment tint into base color when sediment is present
        const tintedBase = mix(baseColor, sedimentTint, clamp(sedimentAmount.mul(0.6), 0, 0.7));

        // --- Combine ---
        const waterColor = tintedBase
            .add(fresnel.mul(reflectedSky))
            .add(vec3(spec, spec, spec));

        // Opacity: deeper = more opaque; specular adds slight extra opacity
        // Kill very shallow water (< ~0.5 texel worth) to prevent thin-film artifacts
        const minWaterThreshold = float(0.3);
        const shallowFade = clamp(waterLevel.mul(float(180)).div(this.simresUniform).div(minWaterThreshold), 0, 1);
        const opacity = clamp(
            float(1.8).add(spec).mul(this.waterTransparencyUniform).mul(dpVal).mul(shallowFade),
            0, 1
        );

        this.colorNode = waterColor;
        this.opacityNode = opacity;
    }
}
