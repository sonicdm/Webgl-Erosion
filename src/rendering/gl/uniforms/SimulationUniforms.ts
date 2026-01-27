export function setSimres(gl: WebGL2RenderingContext, prog: WebGLProgram, res: number): void {
    const loc = gl.getUniformLocation(prog, "u_SimRes");
    if (loc !== -1) {
        gl.uniform1f(loc, res);
    }
}

export function setPipeLen(gl: WebGL2RenderingContext, prog: WebGLProgram, len: number): void {
    const loc = gl.getUniformLocation(prog, "u_PipeLen");
    if (loc !== -1) {
        gl.uniform1f(loc, len);
    }
}

export function setKs(gl: WebGL2RenderingContext, prog: WebGLProgram, k: number): void {
    const loc = gl.getUniformLocation(prog, "u_Ks");
    if (loc !== -1) {
        gl.uniform1f(loc, k);
    }
}

export function setKc(gl: WebGL2RenderingContext, prog: WebGLProgram, k: number): void {
    const loc = gl.getUniformLocation(prog, "u_Kc");
    if (loc !== -1) {
        gl.uniform1f(loc, k);
    }
}

export function setKd(gl: WebGL2RenderingContext, prog: WebGLProgram, k: number): void {
    const loc = gl.getUniformLocation(prog, "u_Kd");
    if (loc !== -1) {
        gl.uniform1f(loc, k);
    }
}

export function setRockErosionResistance(gl: WebGL2RenderingContext, prog: WebGLProgram, resistance: number): void {
    const loc = gl.getUniformLocation(prog, "u_RockErosionResistance");
    if (loc !== -1) {
        gl.uniform1f(loc, resistance);
    }
}

export function setTimestep(gl: WebGL2RenderingContext, prog: WebGLProgram, t: number): void {
    const loc = gl.getUniformLocation(prog, "u_timestep");
    if (loc !== -1) {
        gl.uniform1f(loc, t);
    }
}

export function setPipeArea(gl: WebGL2RenderingContext, prog: WebGLProgram, a: number): void {
    const loc = gl.getUniformLocation(prog, "u_PipeArea");
    if (loc !== -1) {
        gl.uniform1f(loc, a);
    }
}

