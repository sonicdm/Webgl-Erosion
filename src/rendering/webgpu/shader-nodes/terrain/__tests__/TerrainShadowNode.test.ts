import { TerrainShadowNode } from '../TerrainShadowNode';

describe('TerrainShadowNode', () => {
    it('returns full light when not in shadow', () => {
        const factor = TerrainShadowNode.evaluate({
            shadowMapSample: 0.8,
            shadowCoordZ: 0.2,
            bias: 0.0,
            strength: 0.5,
        });
        expect(factor).toBeCloseTo(1, 3);
    });

    it('attenuates when in shadow', () => {
        const factor = TerrainShadowNode.evaluate({
            shadowMapSample: 0.2,
            shadowCoordZ: 0.6,
            bias: 0.0,
            strength: 0.5,
        });
        expect(factor).toBeCloseTo(0.5, 2);
    });

    it('handles missing shadow data', () => {
        const factor = TerrainShadowNode.evaluate({});
        expect(factor).toBeCloseTo(1, 3);
    });
});
