import { Color, Vector3 } from 'three';
import { TerrainDebugMode, TerrainDebugViewNode } from '../TerrainDebugViewNode';

describe('TerrainDebugViewNode', () => {
    it('returns sediment color for sediment mode', () => {
        const sediment = new Color(0.1, 0.2, 0.3);
        const color = TerrainDebugViewNode.evaluate({
            debugMode: TerrainDebugMode.Sediment,
            sediment,
        });
        expect(color.r).toBeCloseTo(0.1, 3);
        expect(color.g).toBeCloseTo(0.2, 3);
        expect(color.b).toBeCloseTo(0.3, 3);
    });

    it('maps velocity magnitude into a gradient', () => {
        const color = TerrainDebugViewNode.evaluate({
            debugMode: TerrainDebugMode.VelocityMagnitude,
            velocity: new Vector3(5, 0, 0),
        });
        expect(color.r).toBeGreaterThan(color.g);
        expect(color.r).toBeGreaterThan(color.b);
    });

    it('returns rock material colors for rock debug mode', () => {
        const color = TerrainDebugViewNode.evaluate({
            debugMode: TerrainDebugMode.RockMaterial,
            rock: 1,
        });
        expect(color.r).toBeGreaterThan(0.1);
        expect(color.g).toBeGreaterThan(0.1);
        expect(color.b).toBeGreaterThan(0.1);
    });
});
