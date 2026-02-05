import { float, vec3 } from 'three/tsl';
import { SceneDepthMaterialWebGPU } from '../depth/SceneDepthMaterialWebGPU';

describe('SceneDepthMaterialWebGPU', () => {
    it('constructs with defaults', () => {
        const material = new SceneDepthMaterialWebGPU();
        expect(material).toBeInstanceOf(SceneDepthMaterialWebGPU);
        expect((material as any).colorNode).toBeDefined();
    });

    it('uses the terrain shader controller for sampling', () => {
        const mockController = {
            getSamplingNode: jest.fn(() => ({
                sceneDepth: float(0.5),
                uv: vec3(0, 0, 0),
            })),
        } as any;
        const material = new SceneDepthMaterialWebGPU({}, mockController);

        expect(mockController.getSamplingNode).toHaveBeenCalled();
        material.updateInputs({ depthScale: 2 });
        expect(mockController.getSamplingNode).toHaveBeenCalledTimes(2);
    });
});
