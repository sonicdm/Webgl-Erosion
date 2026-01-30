import { NodeMaterial } from 'three/webgpu';
import { clamp, float, mix, uniform, vec3 } from 'three/tsl';
import { TerrainShaderNodeController } from '../../shader-nodes/terrain/TerrainShaderNodeController';
import { TerrainSamplingInputs } from '../../shader-nodes/terrain/TerrainSamplingNode';

export interface TerrainBaseMaterialInputs extends TerrainSamplingInputs {
    snowRange?: number;
    forestRange?: number;
    terrainPalette?: number;
    shadowCoord?: any;
    shadowStrength?: number;
    flowTrace?: number;
    sedimentTrace?: number;
}

export class TerrainBaseMaterialWebGPU extends NodeMaterial {
    private controller: TerrainShaderNodeController;
    private snowRangeUniform: any;
    private forestRangeUniform: any;
    private terrainPaletteUniform: any;
    private shadowStrengthUniform: any;
    private flowTraceUniform: any;
    private sedimentTraceUniform: any;
    private inputs: TerrainBaseMaterialInputs;

    constructor(
        inputs: TerrainBaseMaterialInputs = {},
        controller: TerrainShaderNodeController = new TerrainShaderNodeController()
    ) {
        super();
        this.controller = controller;
        this.inputs = { ...inputs };
        this.snowRangeUniform = uniform(inputs.snowRange ?? 1);
        this.forestRangeUniform = uniform(inputs.forestRange ?? 1);
        this.terrainPaletteUniform = uniform(inputs.terrainPalette ?? 0);
        this.shadowStrengthUniform = uniform(inputs.shadowStrength ?? 0.5);
        this.flowTraceUniform = uniform(inputs.flowTrace ?? 1);
        this.sedimentTraceUniform = uniform(inputs.sedimentTrace ?? 1);

        this.buildGraph(this.inputs);
    }

    updateInputs(inputs: Partial<TerrainBaseMaterialInputs>): void {
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
        if (inputs.shadowStrength !== undefined) {
            this.shadowStrengthUniform.value = inputs.shadowStrength;
        }
        if (inputs.flowTrace !== undefined) {
            this.flowTraceUniform.value = inputs.flowTrace;
        }
        if (inputs.sedimentTrace !== undefined) {
            this.sedimentTraceUniform.value = inputs.sedimentTrace;
        }
        this.buildGraph(this.inputs);
    }

    getTerrainNodeController(): TerrainShaderNodeController {
        return this.controller;
    }

    private buildGraph(inputs: TerrainBaseMaterialInputs): void {
        const sampling = this.controller.getSamplingNode(inputs);
        const palette = this.controller.getPaletteNode({
            height: sampling.height,
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
            strength: this.shadowStrengthUniform,
        });

        let color = palette.color.mul(shadow.shadowFactor);

        const flowTraceEnabled = this.flowTraceUniform.equal(float(0));
        const flowTraceColor = mix(color, vec3(0.94, 0.9, 0.55), clamp(sampling.sedimentBlend, 0, 1));
        color = flowTraceEnabled.select(flowTraceColor, color);

        const sedimentTraceEnabled = this.sedimentTraceUniform.equal(float(0));
        const sedimentTraceColor = mix(color, sampling.sediment, clamp(sampling.sedimentBlend, 0, 1));
        color = sedimentTraceEnabled.select(sedimentTraceColor, color);

        this.colorNode = color;
    }
}
