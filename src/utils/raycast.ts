import {vec2, vec3} from 'gl-matrix';

export function rayCast(
    ro: vec3,
    rd: vec3,
    simres: number,
    HightMapCpuBuf: Float32Array,
    out: vec2
): void {
    out[0] = -10.0;
    out[1] = -10.0;
    let cur = ro;
    let step = 0.01;
    
    // Reusable temporary vectors to avoid allocations
    const curTexSpace = vec2.create();
    const scaledTexSpace = vec2.create();
    const rdscaled = vec3.create();
    
    for (let i = 0; i < 100; ++i) {
        curTexSpace[0] = (cur[0] + 0.50) / 1.0;
        curTexSpace[1] = (cur[2] + 0.50) / 1.0;
        scaledTexSpace[0] = curTexSpace[0] * simres;
        scaledTexSpace[1] = curTexSpace[1] * simres;
        vec2.floor(scaledTexSpace, scaledTexSpace);
        let hvalcoordinate = scaledTexSpace[1] * simres * 4 + scaledTexSpace[0] * 4 + 0;
        
        // Only access buffer if coordinate is valid
        if (hvalcoordinate >= 0 && hvalcoordinate < HightMapCpuBuf.length) {
            let hval = HightMapCpuBuf[hvalcoordinate];
            
            if (cur[1] < hval / simres) {
                out[0] = curTexSpace[0];
                out[1] = curTexSpace[1];
                break;
            }
        }
        
        rdscaled[0] = rd[0] * step;
        rdscaled[1] = rd[1] * step;
        rdscaled[2] = rd[2] * step;
        vec3.add(cur, cur, rdscaled);
    }
}

