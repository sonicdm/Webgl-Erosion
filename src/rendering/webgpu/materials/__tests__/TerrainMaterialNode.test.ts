import { float, vec2, vec3 } from 'three/tsl';
import { TerrainMaterialNode } from '../TerrainMaterialNode';

describe('TerrainMaterialNode', () => {
    it('constructs with a controller and builds a node graph', () => {
        const sampling = {
            height: float(0),
            normal: vec3(0, 1, 0),
            rock: float(0),
            uv: vec2(0, 0),
        } as any;
        const mockController = {
            getSamplingNode: jest.fn(() => sampling),
            getPaletteNode: jest.fn(() => ({ color: vec3(1, 0, 0) })),
            getShadowNode: jest.fn(() => ({ shadowFactor: float(1) })),
        } as any;

        const material = new TerrainMaterialNode({}, mockController);

        expect(material).toBeInstanceOf(TerrainMaterialNode);
        expect(mockController.getSamplingNode).toHaveBeenCalled();
        expect(mockController.getPaletteNode).toHaveBeenCalled();
        expect(mockController.getShadowNode).toHaveBeenCalled();
        expect((material as any).colorNode).toBeDefined();
    });

    it('updates uniforms and rebuilds when inputs change', () => {
        const sampling = {
            height: float(0),
            normal: vec3(0, 1, 0),
            rock: float(0),
            uv: vec2(0, 0),
        } as any;
        const mockController = {
            getSamplingNode: jest.fn(() => sampling),
            getPaletteNode: jest.fn(() => ({ color: vec3(0.2, 0.2, 0.2) })),
            getShadowNode: jest.fn(() => ({ shadowFactor: float(1) })),
        } as any;

        const material = new TerrainMaterialNode({}, mockController);
        material.updateInputs({ snowRange: 0.5, forestRange: 0.2, terrainPalette: 2 });

        expect(mockController.getSamplingNode).toHaveBeenCalledTimes(2);
        expect(mockController.getPaletteNode).toHaveBeenCalledTimes(2);
        expect(mockController.getShadowNode).toHaveBeenCalledTimes(2);
    });
});
