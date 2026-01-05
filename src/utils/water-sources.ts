import {vec2} from 'gl-matrix';

// Water source structure
export interface WaterSource {
    position: vec2;  // Position on terrain (UV coordinates)
    size: number;    // Source radius
    strength: number; // Water emission strength
}

// Maximum number of water sources
export const MAX_WATER_SOURCES = 16;

// Array to store multiple water sources
export let waterSources: WaterSource[] = [];

// Functions to manage water sources
export function addWaterSource(position: vec2, size: number, strength: number): boolean {
    if (waterSources.length < MAX_WATER_SOURCES) {
        const newSource: WaterSource = {
            position: vec2.clone(position),
            size: size,
            strength: strength
        };
        waterSources.push(newSource);
        return true;
    }
    return false;
}

export function removeWaterSource(index: number): void {
    if (index >= 0 && index < waterSources.length) {
        waterSources.splice(index, 1);
    }
}

export function removeNearestWaterSource(position: vec2): boolean {
    if (waterSources.length === 0) return false;
    
    let nearestIndex = 0;
    let nearestDist = Number.MAX_VALUE;
    
    for (let i = 0; i < waterSources.length; i++) {
        const dist = vec2.distance(waterSources[i].position, position);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestIndex = i;
        }
    }
    
    waterSources.splice(nearestIndex, 1);
    return true;
}

export function clearAllWaterSources(): void {
    waterSources = [];
}

export function getWaterSourceCount(): number {
    return waterSources.length;
}

