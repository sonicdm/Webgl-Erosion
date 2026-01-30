import { Texture } from 'three';
import { TerrainSamplingNode } from '../TerrainSamplingNode';

describe('TerrainSamplingNode', () => {
    it('returns a complete sampling result with defaults', () => {
        const node = new TerrainSamplingNode();
        const result = node.build({});

        expect(result).toHaveProperty('heightSample');
        expect(result).toHaveProperty('normalSample');
        expect(result).toHaveProperty('sedimentSample');
        expect(result).toHaveProperty('velocitySample');
        expect(result).toHaveProperty('fluxSample');
        expect(result).toHaveProperty('terrainFluxSample');
        expect(result).toHaveProperty('maxSlippageSample');
        expect(result).toHaveProperty('sedimentBlendSample');
        expect(result).toHaveProperty('shadowSample');
        expect(result).toHaveProperty('sceneDepthSample');
        expect(result).toHaveProperty('brushPreviewSample');
        expect(result.uv).toBeDefined();
    });

    it('handles partial texture inputs', () => {
        const node = new TerrainSamplingNode();
        const result = node.build({
            heightmap: new Texture(),
            normalMap: new Texture(),
        });

        expect(result.heightSample).toBeDefined();
        expect(result.normalSample).toBeDefined();
        expect(result.sedimentSample).toBeDefined();
        expect(result.shadowSample).toBeDefined();
    });
});
