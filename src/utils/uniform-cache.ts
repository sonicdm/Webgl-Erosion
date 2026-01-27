// Global cache for uniform locations per program
const uniformLocationCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

/**
 * Get a cached uniform location. This avoids expensive getUniformLocation calls.
 * @param gl The WebGL2 rendering context
 * @param prog The WebGL program
 * @param name The uniform name
 * @returns The uniform location, or null if not found
 */
export function getCachedUniformLocation(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let progCache = uniformLocationCache.get(prog);
    if (!progCache) {
        progCache = new Map();
        uniformLocationCache.set(prog, progCache);
    }
    
    if (!progCache.has(name)) {
        const loc = gl.getUniformLocation(prog, name);
        progCache.set(name, loc);
        return loc;
    }
    
    return progCache.get(name)!;
}

