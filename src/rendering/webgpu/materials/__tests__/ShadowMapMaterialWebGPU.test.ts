import { Color } from 'three';
import { ShadowMapMaterialWebGPU } from '../shadow/ShadowMapMaterialWebGPU';

describe('ShadowMapMaterialWebGPU', () => {
    it('constructs with defaults', () => {
        const material = new ShadowMapMaterialWebGPU();
        expect(material).toBeInstanceOf(ShadowMapMaterialWebGPU);
        expect(material.colorNode).toBeDefined();
    });

    it('updates uniform inputs', () => {
        const material = new ShadowMapMaterialWebGPU();
        material.updateInputs({ depthScale: 2, depthBias: 0.1, tint: new Color(1, 0, 0) });
        expect(material.colorNode).toBeDefined();
    });
});
