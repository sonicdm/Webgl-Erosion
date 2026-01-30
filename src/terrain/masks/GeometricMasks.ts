/**
 * Geometric terrain masks.
 * Basic geometric shapes for masking terrain.
 */

import { TerrainMask, maskRegistry } from '../TerrainMask';
import { TerrainMaskMetadata, TerrainMaskParams, TerrainOptions, Heightmap } from '../types';

/**
 * No mask - passes through unchanged.
 */
export class NoMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'none',
        name: 'Off',
        category: 'geometric',
        description: 'No mask applied',
        params: []
    };

    getValue(_x: number, _y: number, _params?: TerrainMaskParams): number {
        return 1;
    }

    getDefaultParams(): TerrainMaskParams {
        return {};
    }
}

/**
 * Circle/Sphere mask - circular gradient from center.
 */
export class CircleMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'circle',
        name: 'Sphere',
        category: 'geometric',
        description: 'Circular gradient from center',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.5, min: 0.1, max: 1, description: 'Radius' },
            { name: 'falloff', type: 'number', default: 1.0, min: 0.1, max: 5, description: 'Edge falloff power' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.5, falloff = 1.0 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = Math.max(0, 1 - dist / (radius as number));
        return Math.pow(t, falloff as number);
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.5, falloff: 1.0 };
    }
}

/**
 * Square mask - square gradient from center.
 */
export class SquareMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'square',
        name: 'Square',
        category: 'geometric',
        description: 'Square gradient from center',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'size', type: 'number', default: 0.8, min: 0.1, max: 1, description: 'Size' },
            { name: 'falloff', type: 'number', default: 1.0, min: 0.1, max: 5, description: 'Edge falloff power' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, size = 0.8, falloff = 1.0 } = this.mergeParams(params);
        const dx = Math.abs(x - (centerX as number)) * 2;
        const dy = Math.abs(y - (centerY as number)) * 2;
        const dist = Math.max(dx, dy);
        const t = Math.max(0, 1 - dist / (size as number));
        return Math.pow(t, falloff as number);
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, size: 0.8, falloff: 1.0 };
    }
}

/**
 * Ring mask - donut/ring shape with smooth bands.
 */
export class RingMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'ring',
        name: 'Ring',
        category: 'geometric',
        description: 'Ring/donut shape with smooth bands',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'innerRadius', type: 'number', default: 0.2, min: 0, max: 0.9, description: 'Inner radius' },
            { name: 'outerRadius', type: 'number', default: 0.5, min: 0.1, max: 1, description: 'Outer radius' },
            { name: 'falloff', type: 'number', default: 1.0, min: 0.1, max: 5, description: 'Edge falloff' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, innerRadius = 0.2, outerRadius = 0.5, falloff = 1.0 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy);

        const inner = innerRadius as number;
        const outer = outerRadius as number;
        const width = outer - inner;

        if (dist < inner || dist > outer) {
            const distFromRing = dist < inner ? inner - dist : dist - outer;
            const t = Math.max(0, 1 - distFromRing / (width * 0.5));
            return Math.pow(t, falloff as number);
        }

        return 1;
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, innerRadius: 0.2, outerRadius: 0.5, falloff: 1.0 };
    }
}

/**
 * Cross mask - cross pattern from center.
 */
export class CrossMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'cross',
        name: 'Cross',
        category: 'geometric',
        description: 'Cross pattern from center',
        params: [
            { name: 'thickness', type: 'number', default: 0.2, min: 0.05, max: 0.5, description: 'Arm thickness' },
            { name: 'falloff', type: 'number', default: 1.0, min: 0.1, max: 5, description: 'Edge falloff' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { thickness = 0.2, falloff = 1.0 } = this.mergeParams(params);
        const cx = Math.abs(x - 0.5) * 2;
        const cy = Math.abs(y - 0.5) * 2;
        const thick = thickness as number;

        // Distance from nearest cross arm
        const distX = Math.max(0, cx - thick);
        const distY = Math.max(0, cy - thick);
        const dist = Math.min(distX, distY);

        const t = Math.max(0, 1 - dist / thick);
        return Math.pow(t, falloff as number);
    }

    getDefaultParams(): TerrainMaskParams {
        return { thickness: 0.2, falloff: 1.0 };
    }
}

// Register geometric masks
maskRegistry.register(new NoMask());
maskRegistry.register(new CircleMask());
maskRegistry.register(new SquareMask());
maskRegistry.register(new RingMask());
maskRegistry.register(new CrossMask());
