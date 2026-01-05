import {vec2, vec3} from 'gl-matrix';

export function rayCast(
    ro: vec3,
    rd: vec3,
    simres: number,
    HightMapCpuBuf: Float32Array
): vec2 {
    let res = vec2.fromValues(-10.0, -10.0);
    let cur = ro;
    let step = 0.01;
    
    for (let i = 0; i < 100; ++i) {
        let curTexSpace = vec2.fromValues((cur[0] + 0.50) / 1.0, (cur[2] + 0.50) / 1.0);
        let scaledTexSpace = vec2.fromValues(curTexSpace[0] * simres, curTexSpace[1] * simres);
        vec2.floor(scaledTexSpace, scaledTexSpace);
        let hvalcoordinate = scaledTexSpace[1] * simres * 4 + scaledTexSpace[0] * 4 + 0;
        let hval = HightMapCpuBuf[hvalcoordinate];
        
        if (cur[1] < hval / simres) {
            res = curTexSpace;
            break;
        }
        
        let rdscaled = vec3.fromValues(rd[0] * step, rd[1] * step, rd[2] * step);
        vec3.add(cur, cur, rdscaled);
    }
    
    return res;
}

