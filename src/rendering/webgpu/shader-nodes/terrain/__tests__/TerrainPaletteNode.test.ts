import { TerrainPaletteNode } from '../TerrainPaletteNode';

describe('TerrainPaletteNode', () => {
    it('selects forest colors for low heights', () => {
        const color = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 1,
            rock: 0,
            snowRange: 1,
            forestRange: 1,
            terrainPalette: 0,
        });
        expect(color.r).toBeCloseTo(0.148, 2);
        expect(color.g).toBeCloseTo(0.365, 2);
        expect(color.b).toBeCloseTo(0.016, 2);
    });

    it('selects mountain colors for high heights', () => {
        const color = TerrainPaletteNode.evaluate({
            height: 1000,
            normalY: 1,
            rock: 0,
            snowRange: 1,
            forestRange: 1,
            terrainPalette: 0,
        });
        expect(color.r).toBeCloseTo(0.99, 2);
        expect(color.g).toBeCloseTo(0.99, 2);
        expect(color.b).toBeCloseTo(0.99, 2);
    });

    it('adjusts palette selection when terrainPalette changes', () => {
        const color = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 1,
            rock: 0,
            snowRange: 1,
            forestRange: 1,
            terrainPalette: 1,
        });
        expect(color.r).toBeCloseTo(0.99, 2);
    });

    it('responds to forest and snow ranges', () => {
        const lowForest = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.5,
            rock: 0,
            snowRange: 1,
            forestRange: 1,
            terrainPalette: 0,
        });
        const highForest = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.5,
            rock: 0,
            snowRange: 1,
            forestRange: 4,
            terrainPalette: 0,
        });
        expect(highForest.r).toBeGreaterThan(lowForest.r);

        const lowSnow = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.2,
            rock: 0,
            snowRange: 1,
            forestRange: 1,
            terrainPalette: 0,
        });
        const highSnow = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.2,
            rock: 0,
            snowRange: 4,
            forestRange: 1,
            terrainPalette: 0,
        });
        expect(highSnow.r).toBeLessThan(lowSnow.r);
    });
});
