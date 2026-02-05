import { TerrainPaletteNode } from '../TerrainPaletteNode';

describe('TerrainPaletteNode', () => {
    it('selects forest colors for low heights', () => {
        const color = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 1,
            rock: 0,
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
            terrainPalette: 1,
        });
        expect(color.r).toBeCloseTo(0.99, 2);
    });

    it('responds to slopeRockAmount and snowLine', () => {
        const lowSlope = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.5,
            rock: 0,
            terrainPalette: 0,
            slopeRockAmount: 1,
        });
        const highSlope = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.5,
            rock: 0,
            terrainPalette: 0,
            slopeRockAmount: 4,
        });
        expect(highSlope.r).toBeGreaterThan(lowSlope.r);

        const defaultSnow = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.2,
            rock: 0,
            terrainPalette: 0,
            snowLine: 0.70,
        });
        const lowerSnow = TerrainPaletteNode.evaluate({
            height: 0,
            normalY: 0.2,
            rock: 0,
            terrainPalette: 0,
            snowLine: 0.30,
        });
        // Lower snow line means more snow at same height → brighter
        expect(lowerSnow.r).toBeGreaterThanOrEqual(defaultSnow.r);
    });
});
