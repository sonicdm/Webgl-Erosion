import { TerrainSamplingInputs, TerrainSamplingNode, TerrainSamplingResult } from './TerrainSamplingNode';
import { TerrainPaletteInputs, TerrainPaletteNode, TerrainPaletteResult } from './TerrainPaletteNode';
import { TerrainDebugViewInputs, TerrainDebugViewNode, TerrainDebugViewResult } from './TerrainDebugViewNode';
import { TerrainShadowInputs, TerrainShadowNode, TerrainShadowResult } from './TerrainShadowNode';
import { createTerrainDetailNode, TerrainDetailUniforms, TerrainDetailResult } from './TerrainDetailNode';
import type { BiomeWeights } from './TerrainPaletteNode';

export class TerrainShaderNodeController {
    constructor(
        private samplingNode: TerrainSamplingNode = new TerrainSamplingNode(),
        private paletteNode: TerrainPaletteNode = new TerrainPaletteNode(),
        private debugViewNode: TerrainDebugViewNode = new TerrainDebugViewNode(),
        private shadowNode: TerrainShadowNode = new TerrainShadowNode()
    ) {}

    getSamplingNode(inputs: TerrainSamplingInputs): TerrainSamplingResult {
        return this.samplingNode.build(inputs);
    }

    getPaletteNode(inputs: TerrainPaletteInputs): TerrainPaletteResult {
        return this.paletteNode.build(inputs);
    }

    getDetailNode(uvCoord: any, biomeWeights: BiomeWeights, uniforms: TerrainDetailUniforms): TerrainDetailResult {
        return createTerrainDetailNode(uvCoord, biomeWeights, uniforms);
    }

    getDebugViewNode(inputs: TerrainDebugViewInputs): TerrainDebugViewResult {
        return this.debugViewNode.build(inputs);
    }

    getShadowNode(inputs: TerrainShadowInputs): TerrainShadowResult {
        return this.shadowNode.build(inputs);
    }
}
