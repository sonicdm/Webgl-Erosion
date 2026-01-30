/**
 * Influence terrain masks.
 * Geographic feature shapes ported from THREE.Terrain.Influences.
 */

import { TerrainMask, maskRegistry, InfluenceShapes } from '../TerrainMask';
import { TerrainMaskMetadata, TerrainMaskParams, TerrainOptions, Heightmap, BlendingMode } from '../types';
import { EaseInOut } from '../easing';

/**
 * Hill influence mask.
 */
export class HillMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'hill',
        name: 'Hill',
        category: 'influence',
        description: 'Smooth hill shape',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.3, min: 0.05, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.3 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1) return 0;

        // Hill shape function
        const t = (dist * 2) - 1; // Map [0,1] to [-1,1]
        return Math.max(0, InfluenceShapes.Hill(t));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.3 };
    }
}

/**
 * Valley influence mask (inverted hill).
 */
export class ValleyMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'valley',
        name: 'Valley',
        category: 'influence',
        description: 'Inverted hill (depression)',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.3, min: 0.05, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.3 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1) return 1;

        const t = (dist * 2) - 1;
        return 1 + InfluenceShapes.Valley(t);
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.3 };
    }
}

/**
 * Mesa influence mask (flat-topped plateau).
 */
export class MesaMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'mesa',
        name: 'Mesa',
        category: 'influence',
        description: 'Flat-topped plateau with exponential falloff',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.3, min: 0.05, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.3 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1.5) return 0;

        const t = (dist * 2) - 1;
        return Math.max(0, InfluenceShapes.Mesa(t));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.3 };
    }
}

/**
 * Dome influence mask (parabolic).
 */
export class DomeMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'dome',
        name: 'Dome',
        category: 'influence',
        description: 'Parabolic dome shape',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.4, min: 0.05, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.4 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1) return 0;

        const t = (dist * 2) - 1;
        return Math.max(0, InfluenceShapes.Dome(t));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.4 };
    }
}

/**
 * Volcano influence mask (with crater).
 */
export class VolcanoMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'volcano',
        name: 'Volcano',
        category: 'influence',
        description: 'Volcano shape with crater',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.35, min: 0.1, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.35 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1.2) return 0;

        const t = (dist * 2) - 1;
        return Math.max(0, InfluenceShapes.Volcano(t));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.35 };
    }
}

/**
 * Cone influence mask.
 */
export class ConeMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'cone',
        name: 'Cone',
        category: 'influence',
        description: 'Linear falloff cone shape',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'radius', type: 'number', default: 0.4, min: 0.05, max: 1, description: 'Radius' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, radius = 0.4 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const dist = Math.sqrt(dx * dx + dy * dy) / (radius as number);

        if (dist > 1) return 0;

        return Math.max(0, InfluenceShapes.Cone((dist * 2) - 1));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, radius: 0.4 };
    }
}

/**
 * Gaussian influence mask.
 */
export class GaussianMask extends TerrainMask {
    readonly metadata: TerrainMaskMetadata = {
        id: 'gaussian',
        name: 'Gaussian',
        category: 'influence',
        description: 'Gaussian bell curve shape',
        params: [
            { name: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center X' },
            { name: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, description: 'Center Y' },
            { name: 'sigma', type: 'number', default: 0.2, min: 0.05, max: 0.5, description: 'Standard deviation' }
        ]
    };

    getValue(x: number, y: number, params?: TerrainMaskParams): number {
        const { centerX = 0.5, centerY = 0.5, sigma = 0.2 } = this.mergeParams(params);
        const dx = x - (centerX as number);
        const dy = y - (centerY as number);
        const distSq = dx * dx + dy * dy;
        const s = sigma as number;

        return Math.exp(-distSq / (2 * s * s));
    }

    getDefaultParams(): TerrainMaskParams {
        return { centerX: 0.5, centerY: 0.5, sigma: 0.2 };
    }
}

// Register influence masks
maskRegistry.register(new HillMask());
maskRegistry.register(new ValleyMask());
maskRegistry.register(new MesaMask());
maskRegistry.register(new DomeMask());
maskRegistry.register(new VolcanoMask());
maskRegistry.register(new ConeMask());
maskRegistry.register(new GaussianMask());
