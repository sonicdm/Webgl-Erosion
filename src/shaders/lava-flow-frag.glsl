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

    // When t = 1 (very hot) -> visc ≈ 1; when t = 0 (cold) -> visc ≈ maxSlowdown.
    const float maxSlowdown = 20.0;
    float visc = mix(maxSlowdown, 1.0, t);

    // Global lava vs water slowdown: even hot lava is slower than water.
    const float lavaSlowFactor = 3.0;
    float effectivePipeLen = pipelen * lavaSlowFactor;

    // Calculate height differences for flow (terrain height + lava height)
    // Check if neighbors have solidified rock (no active lava but rock material present)
    // Allow fresh lava to flow over solidified rock by treating it as having zero lava height
    
    // Top neighbor
    vec4 topLava = texture(readLava, curuv + vec2(0.0f, div));
    float topLavaVolume = topLava.x;
    float topRockVal = top.z; // Rock material in terrain B channel
    bool topIsSolidifiedRock = topRockVal > 0.1 && topLavaVolume < 0.001;
    float topEffectiveLava = topIsSolidifiedRock ? 0.0 : topLavaVolume;
    
    // Right neighbor
    vec4 rightLava = texture(readLava, curuv + vec2(div, 0.0f));
    float rightLavaVolume = rightLava.x;
    float rightRockVal = right.z;
    bool rightIsSolidifiedRock = rightRockVal > 0.1 && rightLavaVolume < 0.001;
    float rightEffectiveLava = rightIsSolidifiedRock ? 0.0 : rightLavaVolume;
    
    // Bottom neighbor
    vec4 bottomLava = texture(readLava, curuv + vec2(0.0f, -div));
    float bottomLavaVolume = bottomLava.x;
    float bottomRockVal = bottom.z;
    bool bottomIsSolidifiedRock = bottomRockVal > 0.1 && bottomLavaVolume < 0.001;
    float bottomEffectiveLava = bottomIsSolidifiedRock ? 0.0 : bottomLavaVolume;
    
    // Left neighbor
    vec4 leftLava = texture(readLava, curuv + vec2(-div, 0.0f));
    float leftLavaVolume = leftLava.x;
    float leftRockVal = left.z;
    bool leftIsSolidifiedRock = leftRockVal > 0.1 && leftLavaVolume < 0.001;
    float leftEffectiveLava = leftIsSolidifiedRock ? 0.0 : leftLavaVolume;
    
    // Use effective lava volume in height calculations
    // Calculate raw height differences (can be negative if uphill)
    float Htopout_raw = (curTerrain.x + lavaVolume) - (top.x + topEffectiveLava);
    float Hrightout_raw = (curTerrain.x + lavaVolume) - (right.x + rightEffectiveLava);
    float Hbottomout_raw = (curTerrain.x + lavaVolume) - (bottom.x + bottomEffectiveLava);
    float Hleftout_raw = (curTerrain.x + lavaVolume) - (left.x + leftEffectiveLava);

    // Only allow downhill flow; clamp to non-negative like water
    float Htopout = max(0.0f, Htopout_raw);
    float Hrightout = max(0.0f, Hrightout_raw);
    float Hbottomout = max(0.0f, Hbottomout_raw);
    float Hleftout = max(0.0f, Hleftout_raw);

    // Very thin lava sheets barely move.
    float minFlowVolume = 0.005;
    
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
        // Water-like flux, slowed by viscosity and global lava factor.
        ftopout    = max(0.0f, curFlux.x + (u_timestep * g * u_PipeArea * Htopout)    / (effectivePipeLen * visc));
        frightout  = max(0.0f, curFlux.y + (u_timestep * g * u_PipeArea * Hrightout)  / (effectivePipeLen * visc));
        fbottomout = max(0.0f, curFlux.z + (u_timestep * g * u_PipeArea * Hbottomout) / (effectivePipeLen * visc));
        fleftout   = max(0.0f, curFlux.w + (u_timestep * g * u_PipeArea * Hleftout)   / (effectivePipeLen * visc));
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
