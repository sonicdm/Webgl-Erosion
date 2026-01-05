import {gl} from '../../../globals';

export function setTerrainType(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainType");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setTerrainDebug(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainDebug");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setTerrainScale(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainScale");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setTerrainHeight(prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainHeight");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setRndTerrain(prog: WebGLProgram, r: number): void {
    const loc = gl.getUniformLocation(prog, "u_RndTerrain");
    if (loc !== -1) {
        gl.uniform1i(loc, r);
    }
}

