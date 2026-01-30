import { Texture, Vector2 } from 'three';
import { BilateralBlurMaterialWebGPU } from '../postprocessing/BilateralBlurMaterialWebGPU';

describe('BilateralBlurMaterialWebGPU', () => {
    it('constructs with textures', () => {
        const material = new BilateralBlurMaterialWebGPU({
            colorTexture: new Texture(),
            depthTexture: new Texture(),
            texelSize: new Vector2(1, 1),
        });
        expect(material).toBeInstanceOf(BilateralBlurMaterialWebGPU);
        expect(material.colorNode).toBeDefined();
    });

    it('updates inputs', () => {
        const material = new BilateralBlurMaterialWebGPU();
        material.updateInputs({ radius: 4, depthSigma: 2, colorSigma: 1 });
        expect(material.colorNode).toBeDefined();
    });
});
