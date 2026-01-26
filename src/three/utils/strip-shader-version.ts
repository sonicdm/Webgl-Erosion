/**
 * Strips #version directive from shader source
 * Three.js automatically adds #version 300 es when using RawShaderMaterial with glslVersion: THREE.GLSL3
 * So we must strip it from the source to avoid duplicates
 */
export function stripShaderVersion(shaderSource: string): string {
  // Remove #version directive at the start of the shader (with optional whitespace)
  // Matches: #version 300 es, #version 300es, #version 300 es\n, etc.
  return shaderSource.replace(/^\s*#version\s+\d+\s+es\s*\n?/i, '').trim();
}
