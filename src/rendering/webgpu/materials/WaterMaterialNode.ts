import { Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { clamp, float, mix, normalLocal, positionLocal, pow, texture, uniform, uv, vec3, vec4 } from 'three/tsl';

export interface WaterMaterialNodeInputs {
    /** Heightmap texture (R=height, G=water, B=rock, A=baseRockHeight) */
    heightmap?: Texture;
    /** Sediment map texture */
    sedimentMap?: Texture;
    /** Simulation resolution */
    simres?: number;
    /** Water transparency factor (higher = more transparent) */
    waterTransparency?: number;
}

/**
 * Water material using Three.js NodeMaterial (TSL).
 * Vertex displacement: Y = (terrainHeight + sediment + waterLevel) / simres
 * Fragment: depth-based opacity with blue tint, sediment coloring.
 */
export class WaterMaterialNode extends MeshBasicNodeMaterial {
    private simresUniform: any;
    private waterTransparencyUniform: any;
    private inputs: WaterMaterialNodeInputs;

    constructor(inputs: WaterMaterialNodeInputs = {}) {
        super();
        this.inputs = { ...inputs };
        this.simresUniform = uniform(inputs.simres ?? 512);
        this.waterTransparencyUniform = uniform(inputs.waterTransparency ?? 1.0);

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

    updateUniforms(params: { waterTransparency?: number }): void {
        if (params.waterTransparency !== undefined) {
            this.waterTransparencyUniform.value = params.waterTransparency;
        }
    }

    private buildGraph(inputs: WaterMaterialNodeInputs): void {
        if (inputs.heightmap) {
            const hm = texture(inputs.heightmap, uv());
            const terrainHeight = hm.x;
            const waterLevel = hm.y;
            // Sediment contribution (small additive term matching legacy shader)
            const sediment = inputs.sedimentMap ? texture(inputs.sedimentMap, uv()).x : float(0);

            // Vertex displacement: match legacy water-vert.glsl
            // Y = (terrainHeight + sediment + waterLevel) / simres
            const totalHeight = terrainHeight.add(sediment).add(waterLevel);
            const displacementY = totalHeight.div(this.simresUniform);
            this.positionNode = positionLocal.add(normalLocal.mul(displacementY));

            // Fragment: depth-based opacity
            // Water depth is the water level (G channel)
            // Deeper water is more opaque; very shallow water is nearly invisible
            const waterDepth = waterLevel;
            const depthFactor = clamp(waterDepth.mul(float(180)).div(this.simresUniform), 0, 1);
            // Exponential depth attenuation (matches legacy: 1 - exp(-depth))
            const opacity = clamp(float(1).sub(pow(float(2.718), depthFactor.negate())).mul(this.waterTransparencyUniform), 0, 0.85);

            // Water base color: blue with sediment tinting
            const waterBlue = vec3(0.15, 0.35, 0.65);
            const sedimentColor = vec3(0.45, 0.35, 0.2);
            const sedimentAmount = inputs.sedimentMap ? clamp(texture(inputs.sedimentMap, uv()).x.mul(0.5), 0, 1) : float(0);
            const waterColor = mix(waterBlue, sedimentColor, sedimentAmount);

            // Simple Fresnel approximation: more reflective at glancing angles
            // Use a fixed sky-ish color for reflection blend
            const skyReflect = vec3(0.4, 0.5, 0.7);
            // Approximate view-dependent Fresnel using depth as proxy (shallow = more reflective)
            const fresnelFactor = clamp(float(1).sub(depthFactor).mul(0.3), 0, 0.4);
            const finalColor = mix(waterColor, skyReflect, fresnelFactor);

            this.colorNode = finalColor;
            this.opacityNode = opacity;
        } else {
            // No heightmap — flat blue placeholder
            this.colorNode = vec3(0.15, 0.35, 0.65);
            this.opacityNode = float(0.5);
        }
    }
}
