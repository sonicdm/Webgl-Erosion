import {vec2} from 'gl-matrix';

// Lava source structure
export interface LavaSource {
    position: vec2;  // Position on terrain (UV coordinates)
    size: number;    // Source radius
    strength: number; // Lava emission strength
}

// Maximum number of lava sources
export const MAX_LAVA_SOURCES = 16;

// Array to store multiple lava sources
export let lavaSources: LavaSource[] = [];

// Functions to manage lava sources
export function addLavaSource(position: vec2, size: number, strength: number): boolean {
    if (lavaSources.length < MAX_LAVA_SOURCES) {
        const newSource: LavaSource = {
            position: vec2.clone(position),
            size: size,
            strength: strength
        };
        lavaSources.push(newSource);
        return true;
    }
    return false;
}

export function removeLavaSource(index: number): void {
    if (index >= 0 && index < lavaSources.length) {
        lavaSources.splice(index, 1);
    }
}

export function removeNearestLavaSource(position: vec2): boolean {
    if (lavaSources.length === 0) return false;
    
    let nearestIndex = 0;
    let nearestDist = Number.MAX_VALUE;
    
    for (let i = 0; i < lavaSources.length; i++) {
        const dist = vec2.distance(lavaSources[i].position, position);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestIndex = i;
        }
    }
    
    lavaSources.splice(nearestIndex, 1);
    return true;
}

export function clearAllLavaSources(): void {
    lavaSources = [];
}

export function getLavaSourceCount(): number {
    return lavaSources.length;
}

