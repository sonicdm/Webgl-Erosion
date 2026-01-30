/**
 * Type declarations for three/tsl (TSL/NodeMaterial).
 * @types/three may not include the 'three/tsl' subpath; this allows Jest/TS to resolve it.
 * Overloads and any used so TSL node code (vec4(0), vec3(x), etc.) type-checks.
 */
declare module 'three/tsl' {
    export function float(value: number): any;
    export function vec2(x: number, y: number): any;
    export function vec3(x: number, y: number, z: number): any;
    export function vec3(v: any): any;
    export function vec3(u: any, v: number): any;
    export function vec4(x: number, y: number, z: number, w: number): any;
    export function vec4(x: number): any;
    export function vec4(v: any, w: number): any;
    export function texture(sampler: any, uv?: any): any;
    export function uv(): any;
    export function clamp(x: any, min: any, max: any): any;
    export function mix(x: any, y: any, t: any): any;
    export function pow(x: any, y: any): any;
    export function abs(x: any): any;
    export function length(x: any): any;
    export function dot(a: any, b: any): any;
    export function normalize(x: any): any;
    export function uniform(value: any): any;
    export function depth(value?: any): any;
    export function sub(a: any, b: any): any;
    const __all: Record<string, any>;
    export default __all;
}
