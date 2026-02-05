/**
 * Edge terrain masks.
 * Modify terrain at edges for island or wall effects.
 */

import { TerrainMask, maskRegistry } from '../TerrainMask';
import { TerrainMaskMetadata, TerrainMaskParams, TerrainOptions, Heightmap } from '../types';
import { EaseInOut } from '../easing';

/**
 * Box edge mask - affects rectangular edges.
 */
export class BoxEdgeMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'box-edge',
        name: 'Box Edge',
        category: 'edge',
        description: 'Affects rectangular edges of terrain',
        params: [
            { name: 'distance', type: 'number', default: 0.15, min: 0.01, max: 0.5, description: 'Edge distance' },
            { name: 'direction', type: 'select', default: 'down', options: [
                { label: 'Down (Island)', value: 'down' },
                { label: 'Up (Wall)', value: 'up' }
            ], description: 'Edge direction' },
            { name: 'top', type: 'boolean', default: true, description: 'Affect top edge' },
            { name: 'bottom', type: 'boolean', default: true, description: 'Affect bottom edge' },
            { name: 'left', type: 'boolean', default: true, description: 'Affect left edge' },
            { name: 'right', type: 'boolean', default: true, description: 'Affect right edge' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const {
            distance = 0.15,
            direction = 'down',
            top = true,
            bottom = true,
            left = true,
            right = true
        } = this.mergeParams(params);

        const d = distance as number;
        let minDist = 1.0;

        // Check distance from each enabled edge
        if (top) minDist = Math.min(minDist, y / d);
        if (bottom) minDist = Math.min(minDist, (1 - y) / d);
        if (left) minDist = Math.min(minDist, x / d);
        if (right) minDist = Math.min(minDist, (1 - x) / d);

        minDist = Math.min(1, minDist);
        const eased = EaseInOut(minDist);

        return direction === 'down' ? eased : 1 - eased + eased;
    }

    getDefaultParams(): TerrainMaskParams {
        return {
            distance: 0.15,
            direction: 'down',
            top: true,
            bottom: true,
            left: true,
            right: true
        };
    }
}

/**
 * Radial edge mask - affects edges based on distance from center.
 */
export class RadialEdgeMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'radial-edge',
        name: 'Radial Edge',
        category: 'edge',
        description: 'Affects edges based on distance from center',
        params: [
            { name: 'innerRadius', type: 'number', default: 0.3, min: 0, max: 0.9, description: 'Inner radius (no effect)' },
            { name: 'outerRadius', type: 'number', default: 0.5, min: 0.1, max: 1.0, description: 'Outer radius (full effect)' },
            { name: 'direction', type: 'select', default: 'down', options: [
                { label: 'Down (Island)', value: 'down' },
                { label: 'Up (Wall)', value: 'up' }
            ], description: 'Edge direction' },
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const {
            innerRadius = 0.3,
            outerRadius = 0.5,
            direction = 'down',
            centerX = 0.5,
            centerY = 0.5
        } = this.mergeParams(params);

        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy);

        const inner = innerRadius as number;
        const outer = outerRadius as number;

        if (dist <= inner) {
            return 1;
        }

        if (dist >= outer) {
            return direction === 'down' ? 0 : 1;
        }

        const t = (dist - inner) / (outer - inner);
        const eased = EaseInOut(t);

        return direction === 'down' ? 1 - eased : eased;
    }

    getDefaultParams(): TerrainMaskParams {
        return {
            innerRadius: 0.3,
            outerRadius: 0.5,
            direction: 'down',
            centerX: 0.5,
            centerY: 0.5
        };
    }
}

// Register edge masks
maskRegistry.register(new BoxEdgeMask());
maskRegistry.register(new RadialEdgeMask());
