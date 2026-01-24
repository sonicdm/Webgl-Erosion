#version 300 es
precision highp float;

uniform sampler2D readTerrain; // R: height, G: water, B: rock, A: base rock surface
uniform sampler2D readLava;    // R: lava volume, G: temperature in Celsius
uniform sampler2D readLavaFlux;

uniform float u_SimRes;
uniform float u_PipeLen;
uniform float u_timestep;
uniform float u_PipeArea;

// Lava physics parameters
uniform float u_LavaViscosityPreExp;      // Pre-exponential factor A (default: 1e-5)
uniform float u_LavaActivationEnergy;     // Activation energy E_a (default: 200000 J/mol)
uniform float u_LavaDensity;               // Density (default: 2700 kg/m³)
uniform float u_LavaGasConstant;          // Gas constant R = 8.314 J/(mol·K)
uniform float u_LavaSolidificationTemp;  // Temperature threshold for solidification (default: 800.0 °C)
uniform float u_LavaInitialTemp;         // Initial temperature for new lava (default: 1200.0 °C)

// Lava sources (to prevent stacking at source locations)
uniform int u_LavaSourceCount;
uniform vec2 u_LavaSourcePositions[16];
uniform float u_LavaSourceSizes[16];

layout (location = 0) out vec4 writeLavaFlux;

in vec2 fs_Pos;

void main() {
    vec2 curuv = 0.5f * fs_Pos + 0.5f;
    float div = 1.0f / u_SimRes;
    float g = 0.80; // Use same gravity constant as water for consistency
    float pipelen = u_PipeLen;

    vec4 top = texture(readTerrain, curuv + vec2(0.0f, div));
    vec4 right = texture(readTerrain, curuv + vec2(div, 0.0f));
    vec4 bottom = texture(readTerrain, curuv + vec2(0.0f, -div));
    vec4 left = texture(readTerrain, curuv + vec2(-div, 0.0f));

    vec4 curTerrain = texture(readTerrain, curuv);
    vec4 curLava = texture(readLava, curuv);
    vec4 curFlux = texture(readLavaFlux, curuv);

    float lavaVolume = curLava.x;
    float lavaTemp = curLava.y; // Temperature in Celsius

    // Temperature-dependent viscosity:
    // Normalize between solidification and initial temps using uniforms (Celsius values from GUI).
    float T_solid = u_LavaSolidificationTemp;
    float T_hot   = u_LavaInitialTemp;
    float t = clamp((lavaTemp - T_solid) / max(T_hot - T_solid, 1.0), 0.0, 1.0);
    float tempNorm = t;

    // When t = 1 (very hot) -> visc ≈ 1; when t = 0 (cold) -> visc ≈ maxSlowdown.
    const float maxSlowdown = 3.0;
    float visc = mix(maxSlowdown, 1.0, t);
    
    // Global lava vs water slowdown: even hot lava is slower than water.
    const float lavaSlowFactor = 1.1;
    float effectivePipeLen = pipelen * lavaSlowFactor;

    // Calculate height differences for flow (terrain height + lava height)
    // CRITICAL: Hot lava can ALWAYS flow over solidified rock - treat it as completely passable
    // This prevents thin rock barriers from blocking flow
    
    // Top neighbor
    vec4 topLava = texture(readLava, curuv + vec2(0.0f, div));
    float topLavaVolume = topLava.x;
    float topLavaTemp = topLava.y;
    float topRockVal = top.z; // Rock material in terrain B channel
    bool topIsSolidifiedRock = topRockVal > 0.1 && topLavaVolume < 0.001;
    // If neighbor is solidified rock AND current cell is hot, treat as passable (zero height)
    // Hot lava can always push through/over cold rock barriers
    bool currentIsHot = lavaTemp > u_LavaSolidificationTemp + 50.0;
    float topEffectiveLava = (topIsSolidifiedRock && currentIsHot) ? 0.0 : topLavaVolume;
    
    // Right neighbor
    vec4 rightLava = texture(readLava, curuv + vec2(div, 0.0f));
    float rightLavaVolume = rightLava.x;
    float rightRockVal = right.z;
    bool rightIsSolidifiedRock = rightRockVal > 0.1 && rightLavaVolume < 0.001;
    float rightEffectiveLava = (rightIsSolidifiedRock && currentIsHot) ? 0.0 : rightLavaVolume;
    
    // Bottom neighbor
    vec4 bottomLava = texture(readLava, curuv + vec2(0.0f, -div));
    float bottomLavaVolume = bottomLava.x;
    float bottomRockVal = bottom.z;
    bool bottomIsSolidifiedRock = bottomRockVal > 0.1 && bottomLavaVolume < 0.001;
    float bottomEffectiveLava = (bottomIsSolidifiedRock && currentIsHot) ? 0.0 : bottomLavaVolume;
    
    // Left neighbor
    vec4 leftLava = texture(readLava, curuv + vec2(-div, 0.0f));
    float leftLavaVolume = leftLava.x;
    float leftRockVal = left.z;
    bool leftIsSolidifiedRock = leftRockVal > 0.1 && leftLavaVolume < 0.001;
    float leftEffectiveLava = (leftIsSolidifiedRock && currentIsHot) ? 0.0 : leftLavaVolume;
    
    // Calculate neighbor temperatures for direction-dependent viscosity
    // This allows hot lava to push through cooled edges by using the minimum viscosity
    float topTemp = topLava.y;
    float rightTemp = rightLava.y;
    float bottomTemp = bottomLava.y;
    float leftTemp = leftLava.y;
    
    float topT = clamp((topTemp - T_solid) / max(T_hot - T_solid, 1.0), 0.0, 1.0);
    float rightT = clamp((rightTemp - T_solid) / max(T_hot - T_solid, 1.0), 0.0, 1.0);
    float bottomT = clamp((bottomTemp - T_solid) / max(T_hot - T_solid, 1.0), 0.0, 1.0);
    float leftT = clamp((leftTemp - T_solid) / max(T_hot - T_solid, 1.0), 0.0, 1.0);
    
    float topVisc = mix(maxSlowdown, 1.0, topT);
    float rightVisc = mix(maxSlowdown, 1.0, rightT);
    float bottomVisc = mix(maxSlowdown, 1.0, bottomT);
    float leftVisc = mix(maxSlowdown, 1.0, leftT);
    
    // Use minimum viscosity between current cell and neighbor (allows hot lava to push through cooled edges)
    // BUT: if current cell is hotter, ignore neighbor viscosity to allow flow through cold barriers
    // Lowered threshold from 0.3 to 0.15 to be more lenient - allows flow even when temperature difference is smaller
    float tempDiffTop = tempNorm - topT;
    float tempDiffRight = tempNorm - rightT;
    float tempDiffBottom = tempNorm - bottomT;
    float tempDiffLeft = tempNorm - leftT;
    
    // Also check if current cell has significantly more volume (pressure from accumulated mass)
    // This allows thick hot lava to push through thin cold barriers
    float volumeDiffTop = lavaVolume - topLavaVolume;
    float volumeDiffRight = lavaVolume - rightLavaVolume;
    float volumeDiffBottom = lavaVolume - bottomLavaVolume;
    float volumeDiffLeft = lavaVolume - leftLavaVolume;
    
    // ALWAYS favor hot over cold: use the lower viscosity (hotter = more fluid)
    // Hot lava always flows better than cold lava
    float viscTop;
    if (tempDiffTop > 0.0) {
        // Current cell is hotter - use current cell's viscosity (allows hot to push through cold)
        viscTop = visc;
    } else if (tempDiffTop < 0.0) {
        // Neighbor is hotter - use neighbor's viscosity (hot flows better)
        viscTop = topVisc;
    } else {
        // Same temperature - use minimum (most fluid)
        viscTop = min(visc, topVisc);
    }
    
    float viscRight;
    if (tempDiffRight > 0.0) {
        viscRight = visc;
    } else if (tempDiffRight < 0.0) {
        viscRight = rightVisc;
    } else {
        viscRight = min(visc, rightVisc);
    }
    
    float viscBottom;
    if (tempDiffBottom > 0.0) {
        viscBottom = visc;
    } else if (tempDiffBottom < 0.0) {
        viscBottom = bottomVisc;
    } else {
        viscBottom = min(visc, bottomVisc);
    }
    
    float viscLeft;
    if (tempDiffLeft > 0.0) {
        viscLeft = visc;
    } else if (tempDiffLeft < 0.0) {
        viscLeft = leftVisc;
    } else {
        viscLeft = min(visc, leftVisc);
    }

    // Check if this cell is at or near a lava source location (computed early so later logic can use it)
    bool isAtSource = false;
    int sourceCount = min(u_LavaSourceCount, 16); // Clamp to max array size
    for(int i = 0; i < sourceCount; i++) {
        vec2 sourcePos = u_LavaSourcePositions[i];
        float sourceSize = u_LavaSourceSizes[i];
        float distToSource = distance(sourcePos, curuv);
        float sourceRadius = 0.015 * sourceSize; // Slightly larger radius to catch nearby cells
        if (distToSource < sourceRadius) {
            isAtSource = true;
            break;
        }
    }
    
    // Use effective lava volume in height calculations and add pressure/momentum
    // Strengthened pressure to help push through cold barriers and enable stacking
    float pressureScale = 3.0; // Increased from 2.0 to 3.0 - stronger push for overflow
    float volumePressure = lavaVolume * (1.0 + lavaVolume * 0.5); // Stronger quadratic scaling for thick lava
    float tempPressure = 1.0 + tempNorm * 2.0; // Hot lava has more energy (increased from 1.5)
    float densityFactor = u_LavaDensity / 1000.0; // Lava is 2.7x denser than water
    float pressurePush = pressureScale * volumePressure * tempPressure * densityFactor;
    
    if (isAtSource) { 
        pressurePush += lavaVolume * 1.0; // Stronger source push
    }
    
    // Neighbor pressure should also scale with their volume/temp
    float neighborPressureTop = pressureScale * topEffectiveLava * (0.5 + topT * 0.5) * densityFactor;
    float neighborPressureRight = pressureScale * rightEffectiveLava * (0.5 + rightT * 0.5) * densityFactor;
    float neighborPressureBottom = pressureScale * bottomEffectiveLava * (0.5 + bottomT * 0.5) * densityFactor;
    float neighborPressureLeft = pressureScale * leftEffectiveLava * (0.5 + leftT * 0.5) * densityFactor;

    // Improved momentum: full 4D flux, temperature/volume dependent
    // This helps hot, thick lava break through cold barriers
    float sourceMomentumBoost = isAtSource ? 1.0 : 0.0;
    float fluxMagnitude = length(curFlux); // Full 4D magnitude
    float momentumTerm = fluxMagnitude * 1.5 * (1.0 + tempNorm) * (1.0 + lavaVolume * 0.3);
    momentumTerm = min(5.0, momentumTerm + sourceMomentumBoost); // Increased cap from 1.5 to 5.0

    // Calculate raw height differences (can be negative if uphill), with pressure and momentum
    // For pooling: if neighbor has existing lava (pool), allow flow into it even if slightly uphill
    // This allows cooler lava to flow into and stack on top of existing pools
    float poolAllowanceTop = (topLavaVolume > 0.05) ? 0.02 : 0.0; // Allow slight uphill flow into pools
    float poolAllowanceRight = (rightLavaVolume > 0.05) ? 0.02 : 0.0;
    float poolAllowanceBottom = (bottomLavaVolume > 0.05) ? 0.02 : 0.0;
    float poolAllowanceLeft = (leftLavaVolume > 0.05) ? 0.02 : 0.0;
    
    float Htopout_raw = (curTerrain.x + lavaVolume + pressurePush + momentumTerm) - (top.x + topEffectiveLava + neighborPressureTop) + poolAllowanceTop;
    float Hrightout_raw = (curTerrain.x + lavaVolume + pressurePush + momentumTerm) - (right.x + rightEffectiveLava + neighborPressureRight) + poolAllowanceRight;
    float Hbottomout_raw = (curTerrain.x + lavaVolume + pressurePush + momentumTerm) - (bottom.x + bottomEffectiveLava + neighborPressureBottom) + poolAllowanceBottom;
    float Hleftout_raw = (curTerrain.x + lavaVolume + pressurePush + momentumTerm) - (left.x + leftEffectiveLava + neighborPressureLeft) + poolAllowanceLeft;

    // Yield + limited uphill allowance: treat lava as having a small yield strength that drops with heat.
    float yield = mix(0.02, 0.0, tempNorm); // colder = higher yield
    float uphillAllowance = 0.03 * lavaVolume + 0.03 * tempNorm;
    Htopout_raw = Htopout_raw > yield ? (Htopout_raw + uphillAllowance) : 0.0;
    Hrightout_raw = Hrightout_raw > yield ? (Hrightout_raw + uphillAllowance) : 0.0;
    Hbottomout_raw = Hbottomout_raw > yield ? (Hbottomout_raw + uphillAllowance) : 0.0;
    Hleftout_raw = Hleftout_raw > yield ? (Hleftout_raw + uphillAllowance) : 0.0;

    // Lateral bypass: redistribute blocked pressure to open directions
    float maxDown = max(max(Htopout_raw, Hrightout_raw), max(Hbottomout_raw, Hleftout_raw));
    float minRaw = min(min(Htopout_raw, Hrightout_raw), min(Hbottomout_raw, Hleftout_raw));
    if (maxDown > 0.0 && minRaw < 0.0) {
        float lateralPush = 0.3 * abs(minRaw); // fraction of blocked pressure redistributed
        if (Htopout_raw > 0.0)    Htopout_raw    += lateralPush;
        if (Hrightout_raw > 0.0)  Hrightout_raw  += lateralPush;
        if (Hbottomout_raw > 0.0) Hbottomout_raw += lateralPush;
        if (Hleftout_raw > 0.0)   Hleftout_raw   += lateralPush;
    }

    // Only allow downhill flow; clamp to non-negative like water
    float Htopout = max(0.0f, Htopout_raw);
    float Hrightout = max(0.0f, Hrightout_raw);
    float Hbottomout = max(0.0f, Hbottomout_raw);
    float Hleftout = max(0.0f, Hleftout_raw);

    // Very thin lava sheets barely move.
    float minFlowVolume = 0.0;
    
    // Check if ALL directions are uphill (true depression/pool)
    // This allows lava to stack/fold on top of itself when flowing into existing pools
    bool allDirectionsUphill = Htopout_raw <= 0.0f && Hrightout_raw <= 0.0f && Hbottomout_raw <= 0.0f && Hleftout_raw <= 0.0f;
    
    // Declare flux variables
    float ftopout;
    float frightout;
    float fbottomout;
    float fleftout;
    
    if (lavaVolume < minFlowVolume) {
        // Too little lava to flow meaningfully; let it pool.
        ftopout = 0.0f;
        frightout = 0.0f;
        fbottomout = 0.0f;
        fleftout = 0.0f;
    } else {
        // Normal flow: accumulate flux downhill, but block uphill directions
        // This allows gooey lava to flow into existing pools and stack on top
        float fluxAccumulationRate = 1.1 + tempNorm * 0.6 + (isAtSource ? 0.5 : 0.0); // hotter/source lava accelerates flux buildup
        
        // For thicker lava (> 0.05 volume), allow flux accumulation even in depressions
        // Lowered threshold to allow more lava to flow through depressions
        // Thin lava (< 0.05) will pool in depressions (allDirectionsUphill check)
        float thickLavaThreshold = 0.02; // Lowered further to allow more flow
        bool allowFlowInDepression = lavaVolume > thickLavaThreshold || isAtSource || tempNorm > 0.4; // hot or source lava can push out of pools
        
        // Match water's behavior EXACTLY: no artificial damping, just natural flux accumulation
        // Water uses: max(0.f, curFlux.x + (u_timestep*g*u_PipeArea*Htopout)/effectivePipeLen)
        // When Htopout is negative (uphill), flux naturally decays. When positive (downhill), flux accumulates.
        // This allows volume to build up in pools when fin > fout (handled by update shader)
        
        // For thick lava in depressions, allow slight overflow (negative height difference)
        float overflowThreshold = 0.0;
        if (allDirectionsUphill && allowFlowInDepression && lavaVolume > thickLavaThreshold) {
            // Thick lava can overflow from depressions
            overflowThreshold = -0.1 * lavaVolume - 0.02;
        }
        
        // Match water exactly: curFlux + new flux term (no artificial damping)
        // The fluxAccumulationRate accounts for viscosity/temperature effects
        // When Htopout_raw is negative (uphill), the term is negative, and max(0.0f, ...) clamps it
        // This allows flux to persist and decay naturally, enabling volume to accumulate in pools
        ftopout    = max(0.0f, curFlux.x + fluxAccumulationRate * (u_timestep * g * u_PipeArea * (Htopout_raw - overflowThreshold))    / (effectivePipeLen * viscTop));
        frightout  = max(0.0f, curFlux.y + fluxAccumulationRate * (u_timestep * g * u_PipeArea * (Hrightout_raw - overflowThreshold))  / (effectivePipeLen * viscRight));
        fbottomout = max(0.0f, curFlux.z + fluxAccumulationRate * (u_timestep * g * u_PipeArea * (Hbottomout_raw - overflowThreshold)) / (effectivePipeLen * viscBottom));
        fleftout   = max(0.0f, curFlux.w + fluxAccumulationRate * (u_timestep * g * u_PipeArea * (Hleftout_raw - overflowThreshold))   / (effectivePipeLen * viscLeft));
    }

    float lavaOut = u_timestep * (ftopout + frightout + fbottomout + fleftout);
    
    // Rescale outflow flux so that outflow doesn't exceed current lava volume
    float k = min(1.0f, (lavaVolume * u_PipeLen * u_PipeLen) / max(lavaOut, 0.0001f));
    
    ftopout *= k;
    frightout *= k;
    fbottomout *= k;
    fleftout *= k;

    // Boundary conditions - prevent flow off edges
    if(curuv.x <= div) fleftout = 0.0f;
    if(curuv.x >= 1.0f - 2.0f * div) frightout = 0.0f;
    if(curuv.y <= div) ftopout = 0.0f;
    if(curuv.y >= 1.0f - 2.0f * div) fbottomout = 0.0f;

    writeLavaFlux = vec4(ftopout, frightout, fbottomout, fleftout);
}
