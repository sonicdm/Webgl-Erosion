@group(0) @binding(0) var readTerrain: texture_2d<f32>;
@group(0) @binding(1) var readVelocity: texture_2d<f32>;
@group(0) @binding(2) var readSediment: texture_2d<f32>;
@group(0) @binding(3) var writeTerrain: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var writeSediment: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var writeTerrainNormal: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var writeVelocity: texture_storage_2d<rgba32float, write>;

struct Uniforms {
    u_SimRes: f32,
    u_PipeLen: f32,
    u_Ks: f32,
    u_Kc: f32,
    u_Kd: f32,
    u_timestep: f32,
    u_Time: f32,
    u_RockErosionResistance: f32,
    u_BasaltErosionResistance: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};

@group(0) @binding(7) var<uniform> uniforms: Uniforms;
@group(0) @binding(8) var readBasalt: texture_2d<f32>;

fn calnor(coord: vec2<i32>) -> vec3<f32> {
    let r = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
    let t = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
    let b = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
    let l = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
    var nor = vec3<f32>(l.x - r.x, 2.0, t.x - b.x);
    nor = normalize(nor);
    return nor;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(global_id.xy);
    let div = 1.0 / uniforms.u_SimRes;

    var Kc = uniforms.u_Kc;
    var Ks = uniforms.u_Ks;
    var Kd = uniforms.u_Kd;

    let curTerrain = textureLoad(readTerrain, coord, 0);
    var rockMaterialValue = curTerrain.z;
    let isRock = rockMaterialValue > 0.1;
    var baseRockSurfaceHeight = curTerrain.w;
    if (isRock && baseRockSurfaceHeight < 0.001) {
        baseRockSurfaceHeight = curTerrain.x;
    }

    let rockStrength = clamp((rockMaterialValue - 0.1) / 0.9, 0.0, 1.0);
    var rockFactor = select(1.0, 1.0 - uniforms.u_RockErosionResistance * rockStrength, isRock);

    // Basalt erosion resistance: porous/brittle volcanic rock (less resistant than dense rock)
    let basaltHeight = textureLoad(readBasalt, coord, 0).r;
    let hasBasalt = basaltHeight > 0.01;
    if (hasBasalt) {
        let basaltStrength = clamp(basaltHeight * 10.0, 0.0, 1.0);
        rockFactor *= (1.0 - uniforms.u_BasaltErosionResistance * basaltStrength);
    }

    let hasSedimentOnRock = isRock && curTerrain.x > baseRockSurfaceHeight + 0.001;
    var neighborRockFactor = 1.0;
    var capacityBoost = 1.0;
    let wasRecentlyRock = curTerrain.z > 0.05;

    if (!isRock && !wasRecentlyRock) {
        let topTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
        let rightTerrain = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
        let bottomTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
        let leftTerrain = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
        var rockNeighbors = 0;
        if (topTerrain.z > 0.1) { rockNeighbors++; }
        if (rightTerrain.z > 0.1) { rockNeighbors++; }
        if (bottomTerrain.z > 0.1) { rockNeighbors++; }
        if (leftTerrain.z > 0.1) { rockNeighbors++; }
        if (rockNeighbors > 0) {
            neighborRockFactor = 1.0 + f32(rockNeighbors) * 0.5;
            capacityBoost = 1.0 + f32(rockNeighbors) * 0.3;
        }
    }

    var effectiveCapacityRockFactor = select(rockFactor, 1.0, hasSedimentOnRock);
    Ks *= neighborRockFactor;
    Kc *= capacityBoost;
    Kc *= effectiveCapacityRockFactor;

    let nor = calnor(coord);
    let slopeSin = abs(sqrt(1.0 - nor.y * nor.y));

    let curvel = textureLoad(readVelocity, coord, 0);
    let curSediment = textureLoad(readSediment, coord, 0);
    let velo = length(curvel.xy);
    let slope = max(0.1, abs(slopeSin));
    let sedicap = Kc * slope * velo;

    var cursedi = curSediment.x;
    var hight = curTerrain.x;
    var outsedi = curSediment.x;
    var heightChange = 0.0;
    var originalRockMaterial = curTerrain.z;

    if (sedicap > cursedi) {
        let erodingSedimentLayer = hasSedimentOnRock && hight > baseRockSurfaceHeight;
        let effectiveRockFactor = select(rockFactor, 1.0, erodingSedimentLayer);
        var changesedi = (sedicap - cursedi) * (Ks * effectiveRockFactor);
        hight = hight - changesedi;
        heightChange = -changesedi;
        if (hasSedimentOnRock && hight <= baseRockSurfaceHeight) {
            baseRockSurfaceHeight = hight;
        }
        let sedimentOutputFactor = select(effectiveCapacityRockFactor, 1.0, erodingSedimentLayer);
        outsedi = outsedi + changesedi * sedimentOutputFactor;
        if (rockMaterialValue > 0.1 && changesedi > 0.0 && !erodingSedimentLayer) {
            let conversionRate = min(changesedi * 0.05, originalRockMaterial * 0.01);
            originalRockMaterial = max(0.0, originalRockMaterial - conversionRate);
        }
    } else {
        var changesedi = (cursedi - sedicap) * Kd;
        if (isRock && baseRockSurfaceHeight < 0.001) {
            baseRockSurfaceHeight = curTerrain.x;
        }
        hight = hight + changesedi;
        heightChange = changesedi;
        outsedi = outsedi - changesedi;
    }

    var finalRockMaterial = originalRockMaterial;
    let waterLevel = curTerrain.y;
    let waterVelocity = length(curvel.xy);
    let currentTotalHeight = hight + waterLevel;
    let canSpreadRock = waterLevel < 0.1 && waterVelocity < 0.5;

    if (!isRock && heightChange < 0.0 && canSpreadRock && !wasRecentlyRock) {
        let topTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, 1), 0);
        let rightTerrain = textureLoad(readTerrain, coord + vec2<i32>(1, 0), 0);
        let bottomTerrain = textureLoad(readTerrain, coord + vec2<i32>(0, -1), 0);
        let leftTerrain = textureLoad(readTerrain, coord + vec2<i32>(-1, 0), 0);
        var lowestContiguousRockHeight = 999999.0;
        var bestRockValue = 0.0;
        var contiguousRockCount = 0u;

        if (topTerrain.z > 0.5) {
            if (topTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = topTerrain.x;
                bestRockValue = topTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (rightTerrain.z > 0.5) {
            if (rightTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = rightTerrain.x;
                bestRockValue = rightTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (bottomTerrain.z > 0.5) {
            if (bottomTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = bottomTerrain.x;
                bestRockValue = bottomTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }
        if (leftTerrain.z > 0.5) {
            if (leftTerrain.x < lowestContiguousRockHeight) {
                lowestContiguousRockHeight = leftTerrain.x;
                bestRockValue = leftTerrain.z;
            }
            contiguousRockCount = contiguousRockCount + 1u;
        }

        let originalTerrainHeight = curTerrain.x;
        if (contiguousRockCount > 0u && originalTerrainHeight > lowestContiguousRockHeight) {
            let depthBelowContiguousEdge = lowestContiguousRockHeight - hight;
            var lowestRockTotalHeight = 999999.0;
            if (topTerrain.z > 0.5) {
                let rockTotalHeight = topTerrain.x + topTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (rightTerrain.z > 0.5) {
                let rockTotalHeight = rightTerrain.x + rightTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (bottomTerrain.z > 0.5) {
                let rockTotalHeight = bottomTerrain.x + bottomTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            if (leftTerrain.z > 0.5) {
                let rockTotalHeight = leftTerrain.x + leftTerrain.y;
                lowestRockTotalHeight = min(lowestRockTotalHeight, rockTotalHeight);
            }
            let isBelowWaterSurface = currentTotalHeight < lowestRockTotalHeight + 0.3;
            if (depthBelowContiguousEdge >= 0.2 && !isBelowWaterSurface) {
                let erosionAmount = abs(heightChange);
                let effectiveDepth = depthBelowContiguousEdge - 0.2;
                let depthFactor = clamp(effectiveDepth * 2.0, 0.0, 1.0);
                let spreadFactor = min(erosionAmount * 0.5 * (1.0 + depthFactor * 0.2), 0.01);
                let currentRockValue = curTerrain.z;
                let newRockValue = max(currentRockValue, mix(currentRockValue, 1.0, spreadFactor));
                let rockMaterialAdded = newRockValue - currentRockValue;
                if (rockMaterialAdded > 0.0) {
                    let sedimentConsumed = rockMaterialAdded * outsedi * 0.5;
                    outsedi = max(0.0, outsedi - sedimentConsumed);
                    let heightAdjustment = rockMaterialAdded * effectiveDepth * 0.05 * 1.1;
                    hight = hight + heightAdjustment;
                }
                finalRockMaterial = newRockValue;
                baseRockSurfaceHeight = hight;
            }
        }
    }

    if (finalRockMaterial > 0.5 && baseRockSurfaceHeight < 0.001) {
        baseRockSurfaceHeight = hight;
    }

    textureStore(writeTerrainNormal, coord, vec4<f32>(vec3<f32>(abs(slopeSin)), 1.0));
    textureStore(writeSediment, coord, vec4<f32>(outsedi, 0.0, 0.0, 1.0));
    textureStore(writeTerrain, coord, vec4<f32>(hight, curTerrain.y, finalRockMaterial, baseRockSurfaceHeight));
    textureStore(writeVelocity, coord, curvel);
}
