import { vec3 } from 'three/tsl';
import { WaterMaterialNode } from '../WaterMaterialNode';

describe('WaterMaterialNode', () => {
    it('constructs with a controller and builds a node graph', () => {
        const mockController = {
            getSurfaceColorNode: jest.fn(() => vec3(0.1, 0.2, 0.3)),
        } as any;

        const material = new WaterMaterialNode({}, mockController);

        expect(material).toBeInstanceOf(WaterMaterialNode);
        expect(mockController.getSurfaceColorNode).toHaveBeenCalled();
        expect((material as any).colorNode).toBeDefined();
    });

    it('updates uniforms and rebuilds when inputs change', () => {
        const mockController = {
            getSurfaceColorNode: jest.fn(() => vec3(0.1, 0.2, 0.3)),
        } as any;

        const material = new WaterMaterialNode({}, mockController);
        material.updateInputs({ foamStrength: 0.5 });

        expect(mockController.getSurfaceColorNode).toHaveBeenCalledTimes(2);
    });
});
