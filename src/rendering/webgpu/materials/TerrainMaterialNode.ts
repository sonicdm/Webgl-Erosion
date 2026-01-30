import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, normalLocal, positionLocal, texture, uniform, uv, vec3 } from 'three/tsl';
import { TerrainShaderNodeController } from '../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../shader-nodes/terrain/TerrainSamplingNode';

export interface TerrainMaterialNodeInputs extends TerrainSamplingInputs {
    snowRange?: number;
    forestRange?: number;
    terrainPalette?: number;
    shadowCoord?: any;
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
        this.simresUniform = inputs.simres != null ? uniform(inputs.simres) : null;

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
        this.buildGraph(this.inputs);
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    private buildGraph(inputs: TerrainMaterialNodeInputs): void {
        // Vertex displacement along surface normal (avoids parallax/rectangle when rotating)
        if (inputs.heightmap && this.simresUniform) {
            const vertexHeight = texture(inputs.heightmap, uv()).x;
            const displacementY = vertexHeight.div(this.simresUniform);
            this.positionNode = positionLocal.add(normalLocal.mul(displacementY));
        }

        const sampling = this.controller.getSamplingNode(inputs);
        // GLSL terrain-frag uses yval = fH.x * 4; palette expects 0–600 range
        const heightForPalette = sampling.height.mul(float(4));
        const palette = this.controller.getPaletteNode({
            height: heightForPalette,
            normal: sampling.normal,
            rock: sampling.rock,
            snowRange: this.snowRangeUniform,
            forestRange: this.forestRangeUniform,
            terrainPalette: this.terrainPaletteUniform,
        });
        const shadowCoord = inputs.shadowCoord ?? vec3(sampling.uv, float(1));
        const shadow = this.controller.getShadowNode({
            shadowMap: inputs.shadowMap,
            shadowCoord,
        });

        this.colorNode = palette.color.mul(shadow.shadowFactor);
    }
}
