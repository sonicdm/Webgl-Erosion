/**
 * Gradient terrain masks.
 * Linear and radial gradients for masking terrain.
 */

import { TerrainMask, maskRegistry } from '../TerrainMask';
import { TerrainMaskMetadata, TerrainMaskParams } from '../types';

/**
 * Linear slope mask - diagonal gradient.
 */
export class SlopeMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'slope',
        name: 'Slope',
        category: 'gradient',
        description: 'Linear diagonal gradient',
        params: [
            { name: 'directionX', type: 'number', default: 1.0, min: -1, max: 1, description: 'Gradient direction X' },
            { name: 'directionY', type: 'number', default: 1.0, min: -1, max: 1, description: 'Gradient direction Y' },
            { name: 'offset', type: 'number', default: 0, min: -1, max: 1, description: 'Gradient offset' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { directionX = 1.0, directionY = 1.0, offset = 0 } = this.mergeParams(params);
        const dx = directionX as number;
        const dy = directionY as number;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return 1;

        const ndx = dx / len;
        const ndy = dy / len;
        const value = (x * ndx + y * ndy + (offset as number)) * 0.5 + 0.5;
        return Math.max(0, Math.min(1, value));
    }

    getDefaultParams(): TerrainMaskParams {
        return { directionX: 1.0, directionY: 1.0, offset: 0 };
    }
}

/**
 * Radial gradient mask - smooth falloff from center.
 */
export class RadialGradientMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'radial-gradient',
        name: 'Radial Gradient',
        category: 'gradient',
        description: 'Smooth radial falloff from center',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.7, min: 0.1, max: 1.5, description: 'Gradient radius' },
            { name: 'exponent', type: 'number', default: 2.0, min: 0.5, max: 5, description: 'Falloff exponent' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.7, exponent = 2.0 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = dist / (radius as number);
        return Math.max(0, 1 - Math.pow(t, exponent as number));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.7, exponent: 2.0 };
    }
}

/**
 * Corner mask - gradient from corner.
 */
export class CornerMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'corner',
        name: 'Corner',
        category: 'gradient',
        description: 'Gradient from corner (highest in bottom-left)',
        params: [
            { name: 'corner', type: 'select', default: 'bottom-left', options: [
                { label: 'Bottom-Left', value: 'bottom-left' },
                { label: 'Bottom-Right', value: 'bottom-right' },
                { label: 'Top-Left', value: 'top-left' },
                { label: 'Top-Right', value: 'top-right' }
            ], description: 'Which corner is highest' },
            { name: 'exponent', type: 'number', default: 1.0, min: 0.5, max: 3, description: 'Falloff exponent' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { corner = 'bottom-left', exponent = 1.0 } = this.mergeParams(params);

        let cx: number, cy: number;
        switch (corner) {
            case 'bottom-right':
                cx = x; cy = 1 - y;
                break;
            case 'top-left':
                cx = 1 - x; cy = y;
                break;
            case 'top-right':
                cx = x; cy = y;
                break;
            case 'bottom-left':
            default:
                cx = 1 - x; cy = 1 - y;
                break;
        }

        return Math.pow(cx * cy, exponent as number);
    }

    getDefaultParams(): TerrainMaskParams {
        return { corner: 'bottom-left', exponent: 1.0 };
    }
}

/**
 * Diagonal mask - stripe along diagonal.
 */
export class DiagonalMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'diagonal',
        name: 'Diagonal',
        category: 'gradient',
        description: 'Diagonal stripe pattern',
        params: [
            { name: 'thickness', type: 'number', default: 0.3, min: 0.1, max: 1.0, description: 'Stripe thickness' },
            { name: 'direction', type: 'select', default: 'ascending', options: [
                { label: 'Ascending (\\)', value: 'ascending' },
                { label: 'Descending (/)', value: 'descending' }
            ], description: 'Diagonal direction' },
            { name: 'falloff', type: 'number', default: 1.0, min: 0.5, max: 3, description: 'Edge falloff' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { thickness = 0.3, direction = 'ascending', falloff = 1.0 } = this.mergeParams(params);

        const d = direction === 'descending' ? Math.abs(x + y - 1) : Math.abs(x - y);
        const halfThick = (thickness as number) * 0.5;

        if (d <= halfThick) {
            return 1;
        }

        const t = Math.max(0, 1 - (d - halfThick) / halfThick);
        return Math.pow(t, falloff as number);
    }

    getDefaultParams(): TerrainMaskParams {
        return { thickness: 0.3, direction: 'ascending', falloff: 1.0 };
    }
}

// Register gradient masks
maskRegistry.register(new SlopeMask());
maskRegistry.register(new RadialGradientMask());
maskRegistry.register(new CornerMask());
maskRegistry.register(new DiagonalMask());
