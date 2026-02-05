import { Texture } from 'three';
import { CompositeMaterialWebGPU } from '../postprocessing/CompositeMaterialWebGPU';

describe('CompositeMaterialWebGPU', () => {
    it('constructs with textures', () => {
        const material = new CompositeMaterialWebGPU({
            colorTexture: new Texture(),
            depthTexture: new Texture(),
            mixFactor: 0.5,
        });
        expect(material).toBeInstanceOf(CompositeMaterialWebGPU);
        expect((material as any).colorNode).toBeDefined();
    });

    it('updates mix factor', () => {
        const material = new CompositeMaterialWebGPU();
        material.updateInputs({ mixFactor: 0.75 });
        expect((material as any).colorNode).toBeDefined();
    });
});
