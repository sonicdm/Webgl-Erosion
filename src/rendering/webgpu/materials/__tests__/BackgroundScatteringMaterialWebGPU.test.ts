import { vec3 } from 'three/tsl';
import { BackgroundScatteringMaterialWebGPU } from '../postprocessing/BackgroundScatteringMaterialWebGPU';

describe('BackgroundScatteringMaterialWebGPU', () => {
    it('constructs with a controller', () => {
        const mockController = {
            getBackgroundColorNode: jest.fn(() => vec3(0.2, 0.4, 0.6)),
        } as any;

        const material = new BackgroundScatteringMaterialWebGPU({}, mockController);
        expect(material).toBeInstanceOf(BackgroundScatteringMaterialWebGPU);
        expect(mockController.getBackgroundColorNode).toHaveBeenCalled();
        expect((material as any).colorNode).toBeDefined();
    });
});
