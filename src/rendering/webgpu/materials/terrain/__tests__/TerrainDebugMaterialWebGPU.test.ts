import { float, vec2, vec3 } from 'three/tsl';
import { TerrainDebugMaterialWebGPU } from '../TerrainDebugMaterialWebGPU';

describe('TerrainDebugMaterialWebGPU', () => {
    it('constructs with debug mode', () => {
        const material = new TerrainDebugMaterialWebGPU({ debugMode: 2 });
        expect(material).toBeInstanceOf(TerrainDebugMaterialWebGPU);
        expect(material.getDebugModeValue()).toBe(2);
    });

    it('routes through TerrainDebugViewNode via controller', () => {
        const sampling = {
            height: float(0),
            normal: vec3(0, 1, 0),
            rock: float(0),
            uv: vec2(0, 0),
        } as any;
        const mockController = {
            getSamplingNode: jest.fn(() => sampling),
            getDebugViewNode: jest.fn(() => ({ color: vec3(1, 0, 0) })),
        } as any;

        const material = new TerrainDebugMaterialWebGPU({ debugMode: 1 }, mockController);
        expect(mockController.getSamplingNode).toHaveBeenCalled();
        expect(mockController.getDebugViewNode).toHaveBeenCalled();

        material.updateInputs({ debugMode: 4 });
        expect(material.getDebugModeValue()).toBe(4);
        expect(mockController.getDebugViewNode).toHaveBeenCalledTimes(2);
    });
});
