import {vec2} from 'gl-matrix';

// Cache for uniform locations per program
const uniformLocationCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation>>();

function getCachedUniformLocation(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
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

export function setBrushType(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushType");
    if (loc !== null && loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setBrushSize(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushSize");
    if (loc !== null && loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setBrushStrength(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushStrength");
    if (loc !== null && loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setBrushOperation(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushOperation");
    if (loc !== null && loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setBrushPos(gl: WebGL2RenderingContext, prog: WebGLProgram, t: vec2): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushPos");
    if (loc !== null && loc !== -1) {
        gl.uniform2fv(loc, t);
    }
}

export function setBrushPressed(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = getCachedUniformLocation(gl, prog, "u_BrushPressed");
    if (loc !== null && loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

