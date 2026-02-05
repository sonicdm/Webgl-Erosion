/**
 * Easing functions for terrain generation.
 * These functions transform values from [0,1] to [0,1] with various curves.
 */

import { EasingFunction } from './types';

/**
 * Linear interpolation (no easing).
 * f(x) = x
 */
export const Linear: EasingFunction = (t: number): number => t;

/**
 * Quadratic ease-in (starts slow, accelerates).
 * f(x) = x²
 */
export const EaseIn: EasingFunction = (t: number): number => t * t;

/**
 * Quadratic ease-out (starts fast, decelerates).
 * f(x) = -x(x-2) = 2x - x²
 */
export const EaseOut: EasingFunction = (t: number): number => -t * (t - 2);

/**
 * Cubic ease-in-out (smooth S-curve).
 * f(x) = x²(3 - 2x) = 3x² - 2x³
 */
export const EaseInOut: EasingFunction = (t: number): number => t * t * (3 - 2 * t);

/**
 * Inverse ease-in-out (starts and ends fast, slow in middle).
 * f(x) = 0.5 * (2x - 1)³ + 0.5
 */
export const InEaseOut: EasingFunction = (t: number): number => {
    const shifted = 2 * t - 1;
    return 0.5 * shifted * shifted * shifted + 0.5;
};

/**
 * Weak ease-in (gentler acceleration).
 * f(x) = x^1.55
 */
export const EaseInWeak: EasingFunction = (t: number): number => Math.pow(t, 1.55);

/**
 * Strong ease-in (aggressive acceleration).
 * f(x) = x^7
 */
export const EaseInStrong: EasingFunction = (t: number): number => Math.pow(t, 7);

/**
 * Quintic ease-in-out (smoother S-curve).
 * f(x) = 6x⁵ - 15x⁴ + 10x³
 */
export const SmoothStep: EasingFunction = (t: number): number => {
    return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Sine ease-in (gentle sine-based acceleration).
 * f(x) = 1 - cos(x * π/2)
 */
export const SineIn: EasingFunction = (t: number): number => {
    return 1 - Math.cos(t * Math.PI * 0.5);
};

/**
 * Sine ease-out (gentle sine-based deceleration).
 * f(x) = sin(x * π/2)
 */
export const SineOut: EasingFunction = (t: number): number => {
    return Math.sin(t * Math.PI * 0.5);
};

/**
 * Sine ease-in-out (gentle S-curve).
 * f(x) = 0.5 * (1 - cos(x * π))
 */
export const SineInOut: EasingFunction = (t: number): number => {
    return 0.5 * (1 - Math.cos(t * Math.PI));
};

/**
 * Exponential ease-in.
 * f(x) = 2^(10(x-1)) for x > 0, else 0
 */
export const ExpoIn: EasingFunction = (t: number): number => {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
};

/**
 * Exponential ease-out.
 * f(x) = 1 - 2^(-10x) for x < 1, else 1
 */
export const ExpoOut: EasingFunction = (t: number): number => {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

/**
 * Collection of all easing functions for GUI selection.
 */
export const EasingFunctions: Record<string, EasingFunction> = {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    InEaseOut,
    EaseInWeak,
    EaseInStrong,
    SmoothStep,
    SineIn,
    SineOut,
    SineInOut,
    ExpoIn,
    ExpoOut
};

/**
 * Get an easing function by name.
 * @param name Name of the easing function
 * @returns The easing function or Linear if not found
 */
export function getEasing(name: string): EasingFunction {
    return EasingFunctions[name] || Linear;
}
