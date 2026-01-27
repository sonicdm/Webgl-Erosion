export function setTerrainType(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainType");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setTerrainDebug(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainDebug");
    if (loc !== -1) {
        gl.uniform1i(loc, t);
    }
}

export function setTerrainScale(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainScale");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setTerrainHeight(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_TerrainHeight");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setRndTerrain(gl: WebGL2RenderingContext, prog: WebGLProgram, r: number): void {
    const loc = gl.getUniformLocation(prog, "u_RndTerrain");
    if (loc !== -1) {
        gl.uniform1i(loc, r);
    }
}

