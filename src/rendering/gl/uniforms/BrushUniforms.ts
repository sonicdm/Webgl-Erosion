import {vec2} from 'gl-matrix';
import {gl} from '../../../globals';

export function setBrushType(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_BrushType");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setBrushSize(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_BrushSize");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setBrushStrength(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_BrushStrength");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setBrushOperation(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_BrushOperation");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setBrushPos(prog: WebGLProgram, t: vec2): void {
    const loc = gl.getUniformLocation(prog, "u_BrushPos");
    if (loc !== -1) {
        gl.uniform2fv(loc, t);
    }
}

export function setBrushPressed(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_BrushPressed");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

