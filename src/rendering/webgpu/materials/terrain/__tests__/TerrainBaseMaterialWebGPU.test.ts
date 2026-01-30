import { Texture } from 'three';
import { float, vec2, vec3 } from 'three/tsl';
import { TerrainBaseMaterialWebGPU } from '../TerrainBaseMaterialWebGPU';

describe('TerrainBaseMaterialWebGPU', () => {
    it('constructs with minimal textures', () => {
        const material = new TerrainBaseMaterialWebGPU({
            heightmap: new Texture(),
            normalMap: new Texture(),
        });
        expect(material).toBeInstanceOf(TerrainBaseMaterialWebGPU);
        expect(material.colorNode).toBeDefined();
    });

    it('uses the terrain node controller', () => {
        const sampling = {
            height: float(0),
            normal: vec3(0, 1, 0),
            rock: float(0),
            uv: vec2(0, 0),
            sedimentBlend: float(0),
            sediment: vec3(0, 0, 0),
        } as any;
        const mockController = {
            getSamplingNode: jest.fn(() => sampling),
            getPaletteNode: jest.fn(() => ({ color: vec3(0.2, 0.2, 0.2) })),
            getShadowNode: jest.fn(() => ({ shadowFactor: float(1) })),
        } as any;

        const material = new TerrainBaseMaterialWebGPU({}, mockController);
        expect(material.getTerrainNodeController()).toBe(mockController);
        expect(mockController.getSamplingNode).toHaveBeenCalled();
        expect(mockController.getPaletteNode).toHaveBeenCalled();
        expect(mockController.getShadowNode).toHaveBeenCalled();
    });
});
