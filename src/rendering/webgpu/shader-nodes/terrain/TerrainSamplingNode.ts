import { Texture } from 'three';
import { texture, uv, vec3, vec4 } from 'three/tsl';

export interface TerrainSamplingInputs {
    uv?: any;
    heightmap?: Texture;
    normalMap?: Texture;
    sedimentMap?: Texture;
    velocityMap?: Texture;
    fluxMap?: Texture;
    terrainFluxMap?: Texture;
    maxSlippageMap?: Texture;
    sedimentBlendMap?: Texture;
    shadowMap?: Texture;
    sceneDepthMap?: Texture;
    brushPreviewMap?: Texture;
}

export interface TerrainSamplingResult {
    uv: any;
    heightSample: any;
    height: any;
    water: any;
    rock: any;
    baseRockHeight: any;
    normalSample: any;
    normal: any;
    sedimentSample: any;
    sediment: any;
    velocitySample: any;
    velocity: any;
    fluxSample: any;
    flux: any;
    terrainFluxSample: any;
    terrainFlux: any;
    maxSlippageSample: any;
    maxSlippage: any;
    sedimentBlendSample: any;
    sedimentBlend: any;
    shadowSample: any;
    shadowDepth: any;
    sceneDepthSample: any;
    sceneDepth: any;
    brushPreviewSample: any;
}

export class TerrainSamplingNode {
    build(inputs: TerrainSamplingInputs): TerrainSamplingResult {
        const uvNode = inputs.uv ?? uv();
        const heightSample = this.sample(inputs.heightmap, uvNode, vec4(0));
        const normalSample = this.sample(inputs.normalMap, uvNode, vec4(vec3(0, 1, 0), 1));
        const sedimentSample = this.sample(inputs.sedimentMap, uvNode, vec4(0));
        const velocitySample = this.sample(inputs.velocityMap, uvNode, vec4(0));
        const fluxSample = this.sample(inputs.fluxMap, uvNode, vec4(0));
        const terrainFluxSample = this.sample(inputs.terrainFluxMap, uvNode, vec4(0));
        const maxSlippageSample = this.sample(inputs.maxSlippageMap, uvNode, vec4(0));
        const sedimentBlendSample = this.sample(inputs.sedimentBlendMap, uvNode, vec4(0));
        const shadowSample = this.sample(inputs.shadowMap, uvNode, vec4(1));
        const sceneDepthSample = this.sample(inputs.sceneDepthMap, uvNode, vec4(0));
        const brushPreviewSample = this.sample(inputs.brushPreviewMap, uvNode, vec4(0));

        return {
            uv: uvNode,
            heightSample,
            height: heightSample.x,
            water: heightSample.y,
            rock: heightSample.z,
            baseRockHeight: heightSample.w,
            normalSample,
            normal: normalSample.xyz,
            sedimentSample,
            sediment: sedimentSample.xyz,
            velocitySample,
            velocity: velocitySample.xyz,
            fluxSample,
            flux: fluxSample.xyz,
            terrainFluxSample,
            terrainFlux: terrainFluxSample.xyz,
            maxSlippageSample,
            maxSlippage: maxSlippageSample.xyz,
            sedimentBlendSample,
            sedimentBlend: sedimentBlendSample.x,
            shadowSample,
            shadowDepth: shadowSample.x,
            sceneDepthSample,
            sceneDepth: sceneDepthSample.x,
            brushPreviewSample,
        };
    }

    private sample(map: Texture | undefined, uvNode: any, fallback: any): any {
        return map ? texture(map, uvNode) : fallback;
    }
}
