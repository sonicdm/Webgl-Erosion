/**
 * Comprehensive lava simulation diagnostics.
 * Reads back actual GPU texture data and reports statistics about the lava mass:
 * heights, temperatures, viscosity, flux magnitudes, velocities, layer volumes, etc.
 */

import { readHeightmapFromTexture } from './webgpu-terrain-readback';
import type { WebGPUTexturePool } from '../simulation/WebGPUTexturePool';

interface LavaDiagnostics {
    device: GPUDevice | null;
    pool: WebGPUTexturePool | null;
    simres: number;
    controls: any;
}

const state: LavaDiagnostics = {
    device: null,
    pool: null,
    simres: 0,
    controls: null,
};

/** Call once after GPU init to wire up diagnostics. */
export function initLavaDiagnostics(
    device: GPUDevice,
    pool: WebGPUTexturePool,
    simres: number,
    getControls: () => any
): void {
    state.device = device;
    state.pool = pool;
    state.simres = simres;
    state.controls = getControls;

    // Extend __lavaDebug with the diagnose function
    const existing = (window as any).__lavaDebug || {};
    (window as any).__lavaDebug = {
        ...existing,
        diagnose: () => runDiagnose(),
        diagnoseFull: () => runDiagnose(true),
    };
    console.log('[LavaDiag] Diagnostics ready. Use __lavaDebug.diagnose() in console.');
}

interface TexStats {
    min: number;
    max: number;
    sum: number;
    nonZeroCount: number;
    totalCount: number;
    avg: number;
    avgNonZero: number;
    sampleValues: { x: number; y: number; val: number }[];
}

function computeStats(
    buffer: Float32Array,
    simres: number,
    channelOffset: number,
    channels: number = 4
): TexStats {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let nonZeroCount = 0;
    const totalCount = simres * simres;
    const sampleValues: { x: number; y: number; val: number }[] = [];

    // Track the max-value cell for sampling
    let maxX = 0, maxY = 0;

    for (let y = 0; y < simres; y++) {
        for (let x = 0; x < simres; x++) {
            const idx = (y * simres + x) * channels + channelOffset;
            const v = buffer[idx];
            if (v < min) min = v;
            if (v > max) { max = v; maxX = x; maxY = y; }
            sum += v;
            if (Math.abs(v) > 0.0001) nonZeroCount++;
        }
    }

    // Sample: max cell + a few nearby cells
    if (nonZeroCount > 0) {
        sampleValues.push({ x: maxX, y: maxY, val: buffer[(maxY * simres + maxX) * channels + channelOffset] });
        // Sample cardinal neighbors of max
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
            const sx = maxX + dx;
            const sy = maxY + dy;
            if (sx >= 0 && sx < simres && sy >= 0 && sy < simres) {
                sampleValues.push({ x: sx, y: sy, val: buffer[(sy * simres + sx) * channels + channelOffset] });
            }
        }
    }

    return {
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 0 : max,
        sum,
        nonZeroCount,
        totalCount,
        avg: sum / totalCount,
        avgNonZero: nonZeroCount > 0 ? sum / nonZeroCount : 0,
        sampleValues,
    };
}

function fmt(n: number, decimals: number = 6): string {
    return n.toFixed(decimals);
}

async function runDiagnose(full: boolean = false): Promise<void> {
    if (!state.device || !state.pool) {
        console.error('[LavaDiag] Not initialized. Call initLavaDiagnostics first.');
        return;
    }

    const { device, pool, simres } = state;
    const controls = typeof state.controls === 'function' ? state.controls() : state.controls;
    const pixelCount = simres * simres;

    console.log('='.repeat(80));
    console.log('[LavaDiag] === LAVA SIMULATION DIAGNOSTIC REPORT ===');
    console.log(`[LavaDiag] SimRes: ${simres} | Pixels: ${pixelCount}`);
    console.log('='.repeat(80));

    // Print current control values
    console.log('[LavaDiag] --- CONTROL VALUES ---');
    console.log(`  flowStrength=${controls.lavaFlowStrength}  viscScale=${controls.lavaViscosityScale}  yieldStress=${controls.lavaYieldStress}`);
    console.log(`  coolingRate=${controls.lavaCoolingRate}  propCooling=${controls.lavaProportionalCooling}  solidThresh=${controls.lavaSolidificationThreshold}`);
    console.log(`  coolificationRate=${controls.lavaCoolificationRate}  basaltificationRate=${controls.lavaBasaltificationRate}`);
    console.log(`  flowIters=${controls.lavaFlowIterations}  momentum=${controls.lavaMomentum}  depthBoost=${controls.lavaDepthBoost}`);
    console.log(`  emissionTemp=${controls.lavaEmissionTemp}  crustStrength=${controls.lavaCrustStrength}  crustGrowth=${controls.lavaCrustGrowthRate}`);
    console.log(`  thermalErosionRate=${controls.lavaThermalErosionRate}  maxErosionPerStep=${controls.lavaMaxErosionPerStep}`);
    console.log(`  timestep=${controls.timestep}  pipeLen=${controls.pipelen}  pipeArea=${controls.pipeAra}`);

    // Read back all lava-related textures
    const lavaBuf = new Float32Array(pixelCount * 4);
    const coolLavaBuf = new Float32Array(pixelCount * 4);
    const basaltBuf = new Float32Array(pixelCount * 4);
    const fluxBuf = new Float32Array(pixelCount * 4);
    const flux2Buf = new Float32Array(pixelCount * 4);
    const velBuf = new Float32Array(pixelCount * 4);
    const terrainBuf = new Float32Array(pixelCount * 4);

    try {
        await Promise.all([
            readHeightmapFromTexture(device, pool.readLavaTexture, lavaBuf),
            readHeightmapFromTexture(device, pool.readCoolLavaTexture, coolLavaBuf),
            readHeightmapFromTexture(device, pool.readBasaltTexture, basaltBuf),
            readHeightmapFromTexture(device, pool.readLavaFluxTexture, fluxBuf),
            readHeightmapFromTexture(device, pool.readLavaFlux2Texture, flux2Buf),
            readHeightmapFromTexture(device, pool.readLavaVelTexture, velBuf),
            readHeightmapFromTexture(device, pool.readTerrainTexture, terrainBuf),
        ]);
    } catch (err) {
        console.error('[LavaDiag] GPU readback failed:', err);
        return;
    }

    // === LAVA TEXTURE (R=height, G=temp, B=viscosity, A=crust) ===
    const hStats = computeStats(lavaBuf, simres, 0);
    const tStats = computeStats(lavaBuf, simres, 1);
    const vStats = computeStats(lavaBuf, simres, 2);
    const cStats = computeStats(lavaBuf, simres, 3);

    console.log('\n[LavaDiag] --- MOBILE LAVA (readLava) ---');
    console.log(`  HEIGHT:  min=${fmt(hStats.min)} max=${fmt(hStats.max)} avg=${fmt(hStats.avg)} avgNZ=${fmt(hStats.avgNonZero)} nonZero=${hStats.nonZeroCount} totalVol=${fmt(hStats.sum)}`);
    console.log(`  TEMP:    min=${fmt(tStats.min)} max=${fmt(tStats.max)} avg=${fmt(tStats.avg)} avgNZ=${fmt(tStats.avgNonZero)} nonZero=${tStats.nonZeroCount}`);
    console.log(`  VISC:    min=${fmt(vStats.min)} max=${fmt(vStats.max)} avg=${fmt(vStats.avg)} avgNZ=${fmt(vStats.avgNonZero)} nonZero=${vStats.nonZeroCount}`);
    console.log(`  CRUST:   min=${fmt(cStats.min)} max=${fmt(cStats.max)} avg=${fmt(cStats.avg)} avgNZ=${fmt(cStats.avgNonZero)} nonZero=${cStats.nonZeroCount}`);

    if (hStats.sampleValues.length > 0) {
        console.log('  Samples near peak lava:');
        for (const s of hStats.sampleValues) {
            const idx = (s.y * simres + s.x) * 4;
            console.log(`    (${s.x},${s.y}): h=${fmt(lavaBuf[idx])} T=${fmt(lavaBuf[idx + 1])} visc=${fmt(lavaBuf[idx + 2])} crust=${fmt(lavaBuf[idx + 3])}`);
        }
    }

    // === COOL LAVA ===
    const clStats = computeStats(coolLavaBuf, simres, 0);
    console.log('\n[LavaDiag] --- COOL LAVA (readCoolLava) ---');
    console.log(`  HEIGHT:  min=${fmt(clStats.min)} max=${fmt(clStats.max)} avg=${fmt(clStats.avg)} avgNZ=${fmt(clStats.avgNonZero)} nonZero=${clStats.nonZeroCount} totalVol=${fmt(clStats.sum)}`);

    // === BASALT ===
    const bStats = computeStats(basaltBuf, simres, 0);
    console.log('\n[LavaDiag] --- BASALT (readBasalt) ---');
    console.log(`  HEIGHT:  min=${fmt(bStats.min)} max=${fmt(bStats.max)} avg=${fmt(bStats.avg)} avgNZ=${fmt(bStats.avgNonZero)} nonZero=${bStats.nonZeroCount} totalVol=${fmt(bStats.sum)}`);

    // === TOTAL VOLUME ===
    const totalLavaVol = hStats.sum + clStats.sum + bStats.sum;
    console.log('\n[LavaDiag] --- TOTAL LAVA MASS ---');
    console.log(`  mobile=${fmt(hStats.sum)}  coolLava=${fmt(clStats.sum)}  basalt=${fmt(bStats.sum)}  TOTAL=${fmt(totalLavaVol)}`);
    console.log(`  mobileCells=${hStats.nonZeroCount}  coolCells=${clStats.nonZeroCount}  basaltCells=${bStats.nonZeroCount}`);

    // === FLUX (directions 0-3: N, NE, E, SE) ===
    const f0 = computeStats(fluxBuf, simres, 0); // N
    const f1 = computeStats(fluxBuf, simres, 1); // NE
    const f2 = computeStats(fluxBuf, simres, 2); // E
    const f3 = computeStats(fluxBuf, simres, 3); // SE

    console.log('\n[LavaDiag] --- LAVA FLUX (readLavaFlux: N,NE,E,SE) ---');
    console.log(`  N:  min=${fmt(f0.min)} max=${fmt(f0.max)} sum=${fmt(f0.sum)} nonZero=${f0.nonZeroCount}`);
    console.log(`  NE: min=${fmt(f1.min)} max=${fmt(f1.max)} sum=${fmt(f1.sum)} nonZero=${f1.nonZeroCount}`);
    console.log(`  E:  min=${fmt(f2.min)} max=${fmt(f2.max)} sum=${fmt(f2.sum)} nonZero=${f2.nonZeroCount}`);
    console.log(`  SE: min=${fmt(f3.min)} max=${fmt(f3.max)} sum=${fmt(f3.sum)} nonZero=${f3.nonZeroCount}`);

    // === FLUX2 (directions 4-7: S, SW, W, NW) ===
    const f4 = computeStats(flux2Buf, simres, 0); // S
    const f5 = computeStats(flux2Buf, simres, 1); // SW
    const f6 = computeStats(flux2Buf, simres, 2); // W
    const f7 = computeStats(flux2Buf, simres, 3); // NW

    console.log('\n[LavaDiag] --- LAVA FLUX2 (readLavaFlux2: S,SW,W,NW) ---');
    console.log(`  S:  min=${fmt(f4.min)} max=${fmt(f4.max)} sum=${fmt(f4.sum)} nonZero=${f4.nonZeroCount}`);
    console.log(`  SW: min=${fmt(f5.min)} max=${fmt(f5.max)} sum=${fmt(f5.sum)} nonZero=${f5.nonZeroCount}`);
    console.log(`  W:  min=${fmt(f6.min)} max=${fmt(f6.max)} sum=${fmt(f6.sum)} nonZero=${f6.nonZeroCount}`);
    console.log(`  NW: min=${fmt(f7.min)} max=${fmt(f7.max)} sum=${fmt(f7.sum)} nonZero=${f7.nonZeroCount}`);

    const totalFluxOut = f0.sum + f1.sum + f2.sum + f3.sum + f4.sum + f5.sum + f6.sum + f7.sum;
    const maxFluxAny = Math.max(f0.max, f1.max, f2.max, f3.max, f4.max, f5.max, f6.max, f7.max);
    console.log(`  TOTAL OUTFLUX SUM: ${fmt(totalFluxOut)}  MAX SINGLE DIRECTION: ${fmt(maxFluxAny)}`);

    // === VELOCITY (R=velX, G=velY, B=speed) ===
    const vxStats = computeStats(velBuf, simres, 0);
    const vyStats = computeStats(velBuf, simres, 1);
    const spStats = computeStats(velBuf, simres, 2);

    console.log('\n[LavaDiag] --- LAVA VELOCITY (readLavaVel) ---');
    console.log(`  VelX:  min=${fmt(vxStats.min)} max=${fmt(vxStats.max)} avgNZ=${fmt(vxStats.avgNonZero)} nonZero=${vxStats.nonZeroCount}`);
    console.log(`  VelY:  min=${fmt(vyStats.min)} max=${fmt(vyStats.max)} avgNZ=${fmt(vyStats.avgNonZero)} nonZero=${vyStats.nonZeroCount}`);
    console.log(`  Speed: min=${fmt(spStats.min)} max=${fmt(spStats.max)} avgNZ=${fmt(spStats.avgNonZero)} nonZero=${spStats.nonZeroCount}`);

    // === TERRAIN (R=height, G=water) — for context ===
    const thStats = computeStats(terrainBuf, simres, 0);
    console.log('\n[LavaDiag] --- TERRAIN (readTerrain) ---');
    console.log(`  HEIGHT: min=${fmt(thStats.min)} max=${fmt(thStats.max)} avg=${fmt(thStats.avg)}`);

    // === Derived: viscFactor and effective flow at peak lava cell ===
    if (hStats.sampleValues.length > 0) {
        const peakX = hStats.sampleValues[0].x;
        const peakY = hStats.sampleValues[0].y;
        const idx = (peakY * simres + peakX) * 4;
        const h = lavaBuf[idx];
        const T = lavaBuf[idx + 1];
        const visc = lavaBuf[idx + 2];
        const crust = lavaBuf[idx + 3];
        const viscFactor = 1.0 / (1.0 + visc * controls.lavaViscosityScale);
        const hotBoost = 1.0 + Math.max(0, Math.min(T - 0.5, 0.5)) * 4.0;
        const coolingYield = Math.max(0, visc - 0.6);
        const yieldThreshold = controls.lavaYieldStress * coolingYield;

        console.log('\n[LavaDiag] --- DERIVED VALUES AT PEAK LAVA ---');
        console.log(`  Peak cell: (${peakX}, ${peakY})`);
        console.log(`  h=${fmt(h)} T=${fmt(T)} visc=${fmt(visc)} crust=${fmt(crust)}`);
        console.log(`  viscFactor=${fmt(viscFactor)} (1/(1+visc*viscScale))`);
        console.log(`  hotBoost=${fmt(hotBoost)} (1+clamp(T-0.5,0,0.5)*4)`);
        console.log(`  coolingYield=${fmt(coolingYield)} yieldThreshold=${fmt(yieldThreshold)}`);
        console.log(`  effectiveFlow = flowStr*viscFactor*hotBoost = ${fmt(controls.lavaFlowStrength * viscFactor * hotBoost)}`);
        console.log(`  maxOut (80% of h) = ${fmt(h * 0.8)}`);

        // Show terrain beneath peak lava
        const tIdx = (peakY * simres + peakX) * 4;
        const terrH = terrainBuf[tIdx];
        const water = terrainBuf[tIdx + 1];
        const cl = coolLavaBuf[(peakY * simres + peakX) * 4];
        const ba = basaltBuf[(peakY * simres + peakX) * 4];
        const surfaceH = terrH + ba + cl + water + h;
        console.log(`  terrain=${fmt(terrH)} water=${fmt(water)} coolLava=${fmt(cl)} basalt=${fmt(ba)}`);
        console.log(`  surfaceHeight=${fmt(surfaceH)} (terrain+basalt+coolLava+water+lava)`);

        // Check some neighbor dh values
        console.log('  Neighbor dh values:');
        for (const [dx, dy, label] of [[0, 1, 'N'], [1, 0, 'E'], [0, -1, 'S'], [-1, 0, 'W']] as [number, number, string][]) {
            const nx = peakX + dx;
            const ny = peakY + dy;
            if (nx >= 0 && nx < simres && ny >= 0 && ny < simres) {
                const nIdx = (ny * simres + nx) * 4;
                const nTerrH = terrainBuf[nIdx];
                const nWater = terrainBuf[nIdx + 1];
                const nCl = coolLavaBuf[(ny * simres + nx) * 4];
                const nBa = basaltBuf[(ny * simres + nx) * 4];
                const nLavaH = lavaBuf[nIdx];
                const nSurfH = nTerrH + nBa + nCl + nWater + nLavaH;
                const dh = surfaceH - nSurfH;
                console.log(`    ${label}: nSurf=${fmt(nSurfH)} dh=${fmt(dh)} nLava=${fmt(nLavaH)} nTerr=${fmt(nTerrH)} nCool=${fmt(nCl)} nBasalt=${fmt(nBa)}`);
            }
        }
    }

    // === Distribution: how many cells in each temperature band ===
    const tempBands = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const tempBandCounts = new Array(tempBands.length).fill(0);
    const tempBandVolume = new Array(tempBands.length).fill(0);
    for (let i = 0; i < pixelCount; i++) {
        const h = lavaBuf[i * 4];
        const T = lavaBuf[i * 4 + 1];
        if (h > 0.0001) {
            for (let b = tempBands.length - 1; b >= 0; b--) {
                if (T >= tempBands[b]) {
                    tempBandCounts[b]++;
                    tempBandVolume[b] += h;
                    break;
                }
            }
        }
    }
    console.log('\n[LavaDiag] --- TEMPERATURE DISTRIBUTION ---');
    for (let b = 0; b < tempBands.length; b++) {
        const lo = tempBands[b];
        const hi = b < tempBands.length - 1 ? tempBands[b + 1] : 1.01;
        if (tempBandCounts[b] > 0) {
            console.log(`  T=[${lo.toFixed(1)}-${hi.toFixed(2)}): cells=${tempBandCounts[b]} volume=${fmt(tempBandVolume[b])}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('[LavaDiag] Diagnostic complete.');
    console.log('='.repeat(80));
}
