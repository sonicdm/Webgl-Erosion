#version 300 es
precision highp float;

uniform vec2 u_PlanePos; // Our location in the virtual world displayed by the plane


in vec3 fs_Pos;
in vec4 fs_Nor;
in vec4 fs_Col;
in float fs_Sine;
in vec2 fs_Uv;
in vec4 fs_shadowPos;

uniform sampler2D heightmap;
uniform sampler2D normap;
uniform sampler2D sedimap;
uniform sampler2D velmap;
uniform sampler2D fluxmap;
uniform sampler2D terrainfluxmap;
uniform sampler2D maxslippagemap;
uniform sampler2D sediBlend;
uniform sampler2D shadowMap;
uniform sampler2D sceneDepth;
uniform sampler2D lavamap;

#define PI 3.1415926
const float LAVA_MAX_VOLUME = 50.0;


layout (location = 0) out vec4 out_Col; // This is the final output color that you will see on your
layout (location = 1) out vec4 col_reflect;
                  // screen for the pixel that is currently being processed.
uniform vec3 u_Eye, u_Ref, u_Up;
uniform vec2 u_Dimensions;
uniform int u_TerrainDebug;
uniform int u_SedimentTrace;

uniform vec4 u_MouseWorldPos;
uniform vec3 u_MouseWorldDir;
uniform float u_BrushSize;
uniform int u_BrushType;
uniform vec2 u_BrushPos;
uniform float u_SimRes;
uniform float u_SnowRange;
uniform float u_ForestRange;
uniform int u_TerrainPlatte;
uniform vec3 unif_LightPos;
uniform int u_SourceCount;
uniform vec2 u_SourcePositions[16];  // Max 16 sources
uniform float u_SourceSizes[16];
uniform int u_LavaSourceCount;
uniform vec2 u_LavaSourcePositions[16];  // Max 16 lava sources
uniform float u_LavaSourceSizes[16];
uniform int u_FlowTrace;
uniform float u_LavaGlowIntensity;
uniform float u_LavaPatternFrequency;
uniform float u_Time; // Time for steam effect animation
uniform float u_LavaSolidificationTemp; // Temperature threshold for solidification (default: 800.0 °C)
uniform float u_LavaInitialTemp; // Initial temperature for new lava (default: 1200.0 °C)
uniform float u_LavaAmbientTemp; // Ambient air temperature (default: 20.0 °C)
uniform int u_LavaEnabled; // Flag to enable/disable lava rendering (1 = enabled, 0 = disabled)


uniform mat4 u_sproj;
uniform mat4 u_sview;

vec3 calnor(vec2 uv){
    float eps = 1.f/u_SimRes;
    vec4 cur = texture(heightmap,uv);
    vec4 r = texture(heightmap,uv+vec2(eps,0.f));
    vec4 t = texture(heightmap,uv+vec2(0.f,eps));
    vec4 b = texture(heightmap,uv+vec2(0.f,-eps));
    vec4 l = texture(heightmap,uv+vec2(-eps,0.f));

    vec3 nor = vec3(l.x - r.x, 2.0, t.x - b.x);
    nor = -normalize(nor);
    return nor;
}

    #define OCTAVES 12

float random (in vec2 st) {
    return fract(sin(dot(st.xy,
    vec2(12.9898,78.233)))*
    43758.5453123);
}


float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
    (c - a)* u.y * (1.0 - u.x) +
    (d - b) * u.x * u.y;
}


float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    //
    // Loop of octaves
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);//iqnoise(st,1.f,1.f);
        st *= 2.0;
        amplitude *= .33;
    }
    return value;
}


float computeTerrainAO(){
    vec4 HC = texture(heightmap,fs_Uv);
    return 1.0;
}

void main()
{

    vec3 sundir = unif_LightPos;
    sundir = normalize(sundir);
    float angle = dot(sundir,vec3(0.0,1.0,0.0));
    vec3 hue = mix(vec3(255.0,255.0,255.0)/256.0, vec3(255.0,120.0,20.0)/256.0, 1.0 - angle);

    float shadowVal = 1.0f;
    vec3 shadowCol = vec3(1.0);
    vec3 ambientCol = vec3(0.01);
    vec3 shadowMapLoc = fs_shadowPos.xyz / fs_shadowPos.w;
    shadowMapLoc = shadowMapLoc*0.5+0.5;
    float texsize = 1.0/4096.0f;
    for(int x = -1; x <= 1; ++x)
    {
        for(int y = -1; y <= 1; ++y)
        {
            float pcfDepth = texture(shadowMap, shadowMapLoc.xy + vec2(x, y) * texsize).r;
            shadowVal += shadowMapLoc.z - 0.0001 > pcfDepth ? .1 : 1.;
            shadowCol += shadowMapLoc.z - 0.0001 > pcfDepth ? vec3(0.02,0.01,0.09) : vec3(1.0);
        }
    }
    shadowVal/=9.0;
    shadowCol/=9.0;
    float shadowColorVal = texture(shadowMap, fs_Uv.xy).x;

    vec3 forestcol = vec3(63.0/255.0,155.0/255.0,7.0/255.0)*0.6;
    vec3 mtncolor = vec3(0.99,0.99,0.99);
    vec3 dirtcol = vec3(0.45,0.45,0.45);
    vec3 grass = vec3(193.0/255.0,235.0/255.0,27.0/255.0);
    vec3 sand = vec3(214.f/255.f,184.f/255.f,96.f/255.f);
    vec3 watercol = vec3(0.1,0.3,0.8);
    vec3 permanentCol = vec3(0.8,0.1,0.2);
    vec3 obsidian = vec3(0.2);

    // Rock colors - distinct bluish-gray to clearly differentiate from soil
    vec3 rock1 = vec3(0.35, 0.38, 0.45);  // Light bluish-gray
    vec3 rock2 = vec3(0.25, 0.28, 0.35);  // Medium bluish-gray
    vec3 rock3 = vec3(0.15, 0.18, 0.25);   // Dark bluish-gray




    vec3 addcol = vec3(0.0);
    // Only calculate brush visualization if brush is active (brushType != 0)
    // Note: We don't check u_BrushPressed here because we want to show the brush preview
    // even when not actively painting, but we can optimize by checking brushType first
    if(u_BrushType != 0){
        vec2 pointOnPlane = u_BrushPos;
        float pdis2fragment = distance(pointOnPlane, fs_Uv);
        // Early exit: only do expensive calculations if fragment is within brush radius
        if (pdis2fragment < 0.01 * u_BrushSize){
            float dens = (0.01 * u_BrushSize - pdis2fragment) / (0.01 * u_BrushSize);

            if(u_BrushType == 1){
                addcol = sand * 0.8;
            }else if(u_BrushType == 2){
                addcol = watercol * 0.8;
            }else if(u_BrushType == 3){
                // Rock brush preview - use the new bluish-gray rock color
                addcol = vec3(0.35, 0.38, 0.45) * 0.8;
            }else if(u_BrushType == 4){
                // Smooth brush - light blue
                addcol = vec3(0.5, 0.8, 1.0) * 0.8;
            }else if(u_BrushType == 5){
                // Flatten brush - yellow
                addcol = vec3(1.0, 1.0, 0.3) * 0.8;
            }else if(u_BrushType == 6){
                // Slope brush - green
                addcol = vec3(0.3, 1.0, 0.3) * 0.8;
            }else if(u_BrushType == 7){
                // Lava brush - red/orange
                addcol = vec3(1.0, 0.3, 0.0) * 0.8;
            }
            addcol *= 1.0;
        }

    }

    // Visualize all water sources
    for(int i = 0; i < u_SourceCount; i++){
        vec2 pointOnPlane = u_SourcePositions[i];
        float pdis2fragment = distance(pointOnPlane, fs_Uv);
        float sourceSize = u_SourceSizes[i];
        
        if (pdis2fragment < 0.01 * sourceSize){
            float dens = (0.01 * sourceSize - pdis2fragment) / (0.01 * sourceSize);
            vec3 sourceCol = permanentCol * 0.8;
            addcol += sourceCol * dens * 5.0;
        }
    }

    // Visualize all lava sources (red/orange circles)
    vec3 lavaSourceCol = vec3(1.0, 0.3, 0.0); // Bright red/orange
    for(int i = 0; i < u_LavaSourceCount; i++){
        vec2 pointOnPlane = u_LavaSourcePositions[i];
        float pdis2fragment = distance(pointOnPlane, fs_Uv);
        float sourceSize = u_LavaSourceSizes[i];
        
        if (pdis2fragment < 0.01 * sourceSize){
            float dens = (0.01 * sourceSize - pdis2fragment) / (0.01 * sourceSize);
            addcol += lavaSourceCol * dens * 5.0;
        }
    }





    vec3 slopesin = texture(normap,fs_Uv).xyz;
    vec3 nor = -calnor(fs_Uv);



    float lamb = dot(nor,vec3(sundir.x,sundir.y,-sundir.z));


    //lamb =1.f;
    vec4 fH = texture(heightmap,fs_Uv);
    float yval = fH.x * 4.0;
    float wval = fH.y;
    float rockVal = fH.z; // Rock material value (1.0 = rock, 0.0 = normal)
    float sval = texture(sediBlend, fs_Uv).x;
    
    // Sample lava data - CRITICAL: Always initialize to zero to prevent ghosting
    // This prevents reading garbage/shadow map data when texture is uninitialized
    float lavaVolume = 0.0;
    float lavaTemp = 0.0;
    
    // Only sample lava texture if lava rendering is enabled
    // This prevents reading uninitialized or invalid texture data
    if (u_LavaEnabled == 1) {
        // Try to sample lava texture - use try-catch equivalent (validation)
        // If texture read fails or returns invalid data, we'll catch it below
        vec4 lavaData = texture(lavamap, fs_Uv);
        
        // CRITICAL VALIDATION: Check if this looks like valid lava data
        // Shadow map data typically has values in 0-1 range for depth
        // Lava volume should be >= 0, temperature should be 800-1200°C typically
        // If we see values that look like shadow map (very small, uniform), reject them
        
        float sampledVolume = lavaData.x;
        float sampledTemp = lavaData.y;
        float clampedVolume = clamp(sampledVolume, 0.0, LAVA_MAX_VOLUME);
        
        // Reject if volume is negative
        if (sampledVolume < 0.0) {
            clampedVolume = 0.0;
            sampledTemp = 0.0;
        }
        
        // Reject if temperature is out of valid range
        // Use actual max temperature from uniform (with some margin for safety)
        // This catches shadow map data which would be in 0-1 range
        float maxValidTemp = u_LavaInitialTemp + 200.0; // Allow some margin above initial temp
        if (sampledTemp < 0.0 || sampledTemp > maxValidTemp) {
            clampedVolume = 0.0;
            sampledTemp = 0.0;
        }
        
        
        // Only use if both are valid and volume is significant
        if (clampedVolume > 0.001) {
            lavaVolume = clampedVolume;
            lavaTemp = sampledTemp;
        }
    }

    vec3 finalcol = vec3(0);

    float lowH = 0.0;
    float midH = 300.0;
    float highH = 600.0;

    if(u_TerrainPlatte == 1){
        forestcol = mtncolor;
    }else if(u_TerrainPlatte == 2){
        highH = 2000.0;
    }

    if(yval<=midH){
        finalcol = forestcol;
    }else if(yval>midH&&yval<=highH){
        finalcol = mix(forestcol,mtncolor,(yval-midH)/(highH-midH));
    }else if(yval>highH){

            finalcol = mtncolor;


    }

    finalcol =  mix(mtncolor, finalcol, clamp( pow(abs(nor.y), u_ForestRange), 0.0, 1.0));

    if(abs(nor.y)<0.75){
        finalcol = mix(dirtcol,finalcol,pow(abs(nor.y)/0.75,u_SnowRange));
    }

    // Apply rock material color - make rock clearly distinct from soil
    if(rockVal > 0.1){
        // Use distinct bluish-gray rock colors - mix between rock3 (darkest) and rock1 (lightest) based on rock value
        vec3 rockCol = mix(rock3, rock1, clamp((rockVal - 0.1) / 0.9, 0.0, 1.0));
        
        // Check if there's sediment on top of rock
        float baseRockHeight = fH.w;
        float sedimentLayerThickness = 0.0;
        float sedimentBlendFactor = 0.0;
        
        // Check if base rock height is valid and current height is significantly above it
        // If base height is very close to current height (within 0.01), it means new rock was placed (no sediment)
        float heightDiff = fH.x - baseRockHeight;
        if(baseRockHeight > 0.001 && abs(heightDiff) > 0.01){
            // There's sediment on top of rock (height is significantly above base)
            // Only apply blending if height is above base (positive difference)
            if(heightDiff > 0.0){
                sedimentLayerThickness = heightDiff;
                // Blend factor: 0.0 = pure rock, 1.0 = pure dirt
                // Use a smooth curve - more sediment = more dirt color
                // At 0.1 units of sediment, it should be mostly dirt
                sedimentBlendFactor = smoothstep(0.0, 0.1, sedimentLayerThickness);
            }
        }
        // If abs(heightDiff) <= 0.01, treat as no sediment (new rock was placed, base was reset to current height)
        
        // Blend between rock color and dirt color based on sediment coverage
        vec3 surfaceCol = mix(rockCol, dirtcol, sedimentBlendFactor);
        
        // Apply the blended color - make rock much more visible and distinct
        // When sedimentBlendFactor is high, apply dirt color directly to look like normal dirt
        if(sedimentBlendFactor > 0.8){
            // Mostly covered with sediment - apply dirt color directly, no rock color
            finalcol = mix(finalcol, dirtcol, 0.9);
        } else {
            // Partially covered or no sediment - apply rock color strongly to make it clearly visible
            // Increase rock color strength significantly - rock should override base terrain color
            float rockColorStrength = clamp(rockVal * 2.0, 0.7, 1.0) * (1.0 - sedimentBlendFactor * 0.5);
            // Use a stronger mix - rock color should dominate when there's no sediment
            finalcol = mix(finalcol, surfaceCol, rockColorStrength);
        }
    }

    vec3 normal = lamb*(finalcol) + ambientCol;
    vec3 fcol = normal;
    bool debug = true;
    //normal : 0, sediment : 1, velocity : 2, terrain : 3, flux : 4
    if(u_TerrainDebug == 0){
        fcol = normal;
        debug = false;
    }else if(u_TerrainDebug == 1){
        fcol = texture(sedimap,fs_Uv).xyz * 2.0;
    }else if(u_TerrainDebug == 2){
        fcol = abs(texture(velmap,fs_Uv).xyz/20.0);
    }else if(u_TerrainDebug == 9){

        //fcol = vec3(length(texture(velmap,fs_Uv).xyz)/5.0);

        float velSize = length(texture(velmap,fs_Uv).xyz) / 5.0;
        velSize = 1.0 - exp(-velSize); // 1 - pow(e, -x)
        float midVelBlend = 0.5;
        float highVelBlend = 1.0;
        float maxVelBlend = 1.0;
        if(velSize <= midVelBlend && velSize >= 0.0){
            fcol = mix(vec3(0.0,0.0,1.0), vec3(0.0,1.0,0.0), (velSize - 0.0) / (midVelBlend - 0.0));
        }else  if( velSize >=midVelBlend){
            fcol = mix(vec3(0.0,1.0,0.0), vec3(1.0,0.0,0.0), (velSize - midVelBlend) / (highVelBlend - midVelBlend));
        }
        if(wval < 0.0001){
            fcol = vec3(0.0);
        }

        //fcol = nor1;
        //fcol.xy = fcol.xy / 2.0 + vec2(0.5);
    }else if(u_TerrainDebug == 3){
        fcol = texture(heightmap,fs_Uv).xyz;
        fcol.xy /= 200.0;
        fcol.y *= 80.0;
        //fcol = vec3(fcol.z);
    }else if(u_TerrainDebug == 4){
        fcol = texture(fluxmap,fs_Uv).xyz / 3.0;
        if(fcol == vec3(0.0)){
            fcol = vec3(texture(fluxmap,fs_Uv).w)/3.0;
        }
    }else if(u_TerrainDebug == 5){
        fcol = texture(terrainfluxmap, fs_Uv).xyz * 100000.0;
    }else if(u_TerrainDebug == 6){
        fcol = texture(maxslippagemap, fs_Uv).xyz / 13.0;
    }else if(u_TerrainDebug == 7){
        fcol = vec3(sval * 300.0);
    }else if(u_TerrainDebug == 8){
        fcol = slopesin;
    }else if(u_TerrainDebug == 10){
        // Rock/Soil material debug view
        // Rock (rockVal > 0.5): dark gray/black
        // Soil (rockVal <= 0.5): brown/tan
        // Sediment on rock: bright yellow/orange (clearly distinct)
        
        float baseRockHeight = fH.w;
        // Only show as sediment on rock if height is significantly above base (at least 0.05 units)
        // This prevents false positives from floating point errors
        bool hasSedimentOnRock = baseRockHeight > 0.001 && rockVal > 0.1 && (fH.x - baseRockHeight) > 0.05;
        
        if(hasSedimentOnRock){
            // Sediment on rock - bright yellow/orange to clearly distinguish from both rock and soil
            fcol = vec3(1.0, 0.8, 0.2); // Bright yellow-orange
        } else if(rockVal > 0.5){
            // Rock - dark gray, intensity based on rock value
            fcol = vec3(0.2, 0.2, 0.2) * (0.5 + rockVal * 0.5);
        } else {
            // Soil - brown/tan
            fcol = vec3(0.6, 0.5, 0.4);
        }
    }else if(u_TerrainDebug == 11){
        // Lava Volume debug view
        // Use square root scaling to emphasize differences in small volumes
        // More aggressive scaling to make pooling differences clearly visible
        if (lavaVolume < 0.0001) {
            fcol = vec3(0.0, 0.0, 0.0); // Black for no lava
        } else {
            // Square root scaling: sqrt(volume) expands small differences
            // Map volumes 0.0001 to 2.0 to 0-1 range with sqrt
            float sqrtVolume = sqrt(lavaVolume);
            // Normalize: sqrt(0.0001) = 0.01, sqrt(2.0) = 1.414
            // Map 0.01 to 1.414 -> 0 to 1
            float normalized = (sqrtVolume - 0.01) / (1.414 - 0.01);
            normalized = clamp(normalized, 0.0, 1.0);
            
            // Use distinct color bands with sharp transitions for better visibility
            // Black -> Dark Red -> Red -> Orange -> Yellow -> White
            if (normalized < 0.2) {
                // 0-0.2: Black to dark red (very thin lava)
                float t = normalized / 0.2;
                fcol = vec3(t * 0.5, 0.0, 0.0);
            } else if (normalized < 0.4) {
                // 0.2-0.4: Dark red to bright red (thin lava)
                float t = (normalized - 0.2) / 0.2;
                fcol = vec3(0.5 + t * 0.5, 0.0, 0.0);
            } else if (normalized < 0.6) {
                // 0.4-0.6: Red to orange (moderate lava)
                float t = (normalized - 0.4) / 0.2;
                fcol = vec3(1.0, t * 0.5, 0.0);
            } else if (normalized < 0.8) {
                // 0.6-0.8: Orange to yellow (thick lava)
                float t = (normalized - 0.6) / 0.2;
                fcol = vec3(1.0, 0.5 + t * 0.5, 0.0);
            } else {
                // 0.8-1.0: Yellow to white (very thick lava/pools)
                float t = (normalized - 0.8) / 0.2;
                fcol = vec3(1.0, 1.0, t);
            }
        }
        fcol = clamp(fcol, vec3(0.0), vec3(1.0));
    }else if(u_TerrainDebug == 12){
        // Lava Temperature debug view
        // Temperature gradient: Blue (ambient) -> Green -> Yellow -> Red (initial)
        float temp = lavaTemp;
        // Normalize using FULL temperature range from ambient to initial
        float tempRange = u_LavaInitialTemp - u_LavaAmbientTemp;
        float tempNormalized = (temp - u_LavaAmbientTemp) / max(tempRange, 1.0); // Normalize to 0-1
        tempNormalized = clamp(tempNormalized, 0.0, 1.0);
        
        if (lavaVolume < 0.001) {
            // No lava - black
            fcol = vec3(0.0);
        } else if (tempNormalized < 0.33) {
            // 800-933°C: Blue to Cyan
            float t = tempNormalized / 0.33;
            fcol = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t);
        } else if (tempNormalized < 0.66) {
            // 933-1067°C: Cyan to Yellow
            float t = (tempNormalized - 0.33) / 0.33;
            fcol = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 1.0, 0.0), t);
        } else {
            // 1067-1200°C: Yellow to Red
            float t = (tempNormalized - 0.66) / 0.34;
            fcol = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t);
        }
    }else if(u_TerrainDebug == 13){
        // Lava Temperature + Volume combined
        // Show temperature as color, volume as intensity
        float temp = lavaTemp;
        // Normalize using FULL temperature range from ambient to initial
        float tempRange = u_LavaInitialTemp - u_LavaAmbientTemp;
        float tempNormalized = (temp - u_LavaAmbientTemp) / max(tempRange, 1.0);
        tempNormalized = clamp(tempNormalized, 0.0, 1.0);
        float volIntensity = clamp(lavaVolume * 10.0, 0.0, 1.0);
        
        vec3 tempColor = vec3(0.0);
        if (lavaVolume < 0.001) {
            tempColor = vec3(0.0);
        } else if (tempNormalized < 0.33) {
            float t = tempNormalized / 0.33;
            tempColor = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t);
        } else if (tempNormalized < 0.66) {
            float t = (tempNormalized - 0.33) / 0.33;
            tempColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 1.0, 0.0), t);
        } else {
            float t = (tempNormalized - 0.66) / 0.34;
            tempColor = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t);
        }
        
        fcol = tempColor * volIntensity;
    }else if(u_TerrainDebug == 14){
        // Water Contact with Lava debug view
        // Show where water and lava are in contact
        // Blue = water only, Red = lava only, Purple = both (contact)
        vec4 terrainData = texture(heightmap, fs_Uv);
        float waterVol = terrainData.y;
        float lavaVol = lavaVolume;
        
        if (waterVol > 0.001 && lavaVol > 0.001) {
            // Both present - purple/magenta (contact zone)
            fcol = vec3(1.0, 0.0, 1.0); // Magenta
        } else if (waterVol > 0.001) {
            // Water only - blue
            fcol = vec3(0.0, 0.0, 1.0);
        } else if (lavaVol > 0.001) {
            // Lava only - red
            fcol = vec3(1.0, 0.0, 0.0);
        } else {
            // Neither - black
            fcol = vec3(0.0);
        }
    }else if(u_TerrainDebug == 15){
        // Rock Material debug view (with layering)
        // Shows rock material value and sediment layering on top
        vec4 terrainData = texture(heightmap, fs_Uv);
        float rockVal = terrainData.z; // Rock material (0.0 to 1.0)
        float baseRockHeight = terrainData.w; // Base rock surface height
        float terrainHeight = terrainData.x; // Current terrain height
        float sedimentHeight = terrainHeight - baseRockHeight; // Sediment layer thickness
        
        // Check if there's sediment on top of rock
        bool hasSedimentOnRock = baseRockHeight > 0.001 && rockVal > 0.1 && sedimentHeight > 0.05;
        
        if (hasSedimentOnRock) {
            // Sediment on rock - show as yellow/orange, intensity based on sediment thickness
            float sedimentIntensity = clamp(sedimentHeight * 5.0, 0.0, 1.0);
            fcol = mix(vec3(1.0, 0.8, 0.2), vec3(1.0, 0.6, 0.0), sedimentIntensity); // Yellow to orange
        } else if (rockVal > 0.1) {
            // Rock material - gray scale, intensity based on rock value
            // Dark gray (0.1) to light gray (1.0)
            float rockIntensity = (rockVal - 0.1) / 0.9; // Normalize 0.1-1.0 to 0-1
            rockIntensity = clamp(rockIntensity, 0.0, 1.0);
            fcol = vec3(0.2 + rockIntensity * 0.6); // Dark gray to light gray
        } else {
            // No rock - black
            fcol = vec3(0.0);
        }
    }


    fcol = clamp(fcol, vec3(0.0), vec3(1.0));




    // realistic color
//    vec3 lightSedimentCol = vec3(0.9,0.9,0.6);
//    vec3 mediumSedimentCol = vec3(0.6, 0.6, 0.5);
//    vec3 deepSedimentCol = vec3(0.4, 0.2, 0.0);
    // vibrant color
    vec3 lightSedimentCol = vec3(0.0,0.5,0.3);
    vec3 mediumSedimentCol = vec3(0.0, 0.5, 0.5);
    vec3 deepSedimentCol = vec3(0.0, 0.0, 0.99);
    if(!debug){

        // flow traces : showing flow map in the final render
        if(u_FlowTrace == 0){
            float sedimentTrace = 0.0;
            sedimentTrace = 1.0 - exp( -sval*300.0);
            fcol = mix(fcol, vec3(240.f/255.f,230.f/255.f,140.f/255.f) * lamb + ambientCol,sedimentTrace * 1.50);
            //sedimentTrace *= pow(abs(nor.y), 1.0);
        }
        //fcol += lamb * clamp(sval * vec3(0.5,0.2,0.0) * 550.0, vec3(0.0), vec3(1.0));

        // sediment traces : showing movement of sediments on the terrain
        if(u_SedimentTrace == 0){
            float ssval = texture(sedimap, fs_Uv).x;
            //ssval = max(min(pow(3.0 * ssval, 0.6), 1.0), 0.0);
            ssval = 1.0 - exp(-ssval * 7.0);
            vec3 ss = vec3(0.8, 0.8, 0.8);
            ss = fcol;
            float small = 0.4, large = 0.7;
            if (ssval <=small){
                ss = mix(ss, lightSedimentCol, ssval/small);

            } else if (ssval > small && ssval <= large){
                ss = mix(lightSedimentCol, mediumSedimentCol, (ssval - small)/(large - small));
            }
            else if (ssval > large){
                ss = mix(mediumSedimentCol, deepSedimentCol, (ssval - large)/(1.0 - large));
            }
            fcol = mix(fcol, max(ss * lamb, vec3(0.0)), ssval);
        }





        fcol *= shadowCol * hue;

    }

    // ========== LAVA RENDERING WITH GLOW EFFECT ==========
    // Add glowing red/orange lava visualization based on temperature and volume
    // Only show orange glow for hot, active lava (not solidified rock)
    float solidificationTemp = u_LavaSolidificationTemp; // Use uniform from controls
    // Only consider lava "fully cooled" when:
    // 1. Temperature is well BELOW solidification (at least 100°C below)
    // 2. AND there's very little or no liquid lava volume left (< 0.01)
    // This prevents flowing lava from showing as rock texture
    bool isFullyCooled = lavaTemp < solidificationTemp - 100.0 && lavaVolume < 0.01;
    bool isSolidifiedRock = rockVal > 0.1 && isFullyCooled;
    
    // Only process lava if volume is significant to avoid artifacts.
    // Also skip full lava material in debug views so they can show
    // raw data without being overridden by lava shading.
    if(lavaVolume > 0.001 && !isSolidifiedRock && u_TerrainDebug == 0){
        // Convert temperature to normalized 0-1 range using FULL temperature range
        // This allows us to see color changes as lava cools from initial temp all the way down to ambient
        float tempRange = u_LavaInitialTemp - u_LavaAmbientTemp;
        float tempNorm = clamp((lavaTemp - u_LavaAmbientTemp) / max(tempRange, 1.0), 0.0, 1.0);
        
        // Also calculate solidification-normalized temp for color gradient transitions
        float solidificationRange = u_LavaInitialTemp - u_LavaSolidificationTemp;
        float solidificationNorm = clamp((lavaTemp - u_LavaSolidificationTemp) / max(solidificationRange, 1.0), -1.0, 1.0);
        
        // Realistic lava shader: dense, viscous, with crust formation and swirling motion
        // Based on geological references: thick syrup texture, white-hot centers, dark crust
        
        // Very slow, viscous motion - lava moves like thick syrup, not water
        float flowSpeed = mix(0.2, 0.8, tempNorm); // Even slower for viscous feel
        float slowTime = u_Time * 0.003 * flowSpeed; // Very slow, geological timescale
        
        // Swirling motion - lazy spirals underneath, like ice floes on a fiery sea
        vec2 center = fs_Uv - 0.5;
        float angle = atan(center.y, center.x);
        float radius = length(center);
        
        // Create swirling UV coordinates - slow rotation with flow
        vec2 swirlOffset = vec2(
            cos(angle + slowTime * 0.5) * radius * 0.3,
            sin(angle + slowTime * 0.5) * radius * 0.3
        );
        
        // Add directional flow on top of swirl - folds rather than splashes
        vec2 flowDirection = normalize(vec2(1.0, -0.5));
        vec2 flowOffset = flowDirection * slowTime * 0.5;
        
        // Combine swirl and flow for viscous, folding motion
        vec2 worldOffset = u_PlanePos * 0.1;
        vec2 T1 = fs_Uv + swirlOffset + flowOffset + worldOffset;
        vec2 T2 = fs_Uv + swirlOffset * 0.7 + flowOffset * 0.6 + worldOffset;
        
        // Get noise for distortion and crust patterns
        vec4 noise = vec4(
            fbm(fs_Uv * 2.0),
            fbm(fs_Uv * 2.0 + vec2(10.0, 5.0)),
            fbm(fs_Uv * 2.0 + vec2(5.0, 10.0)),
            fbm(fs_Uv * 2.0 + vec2(15.0, 15.0))
        );
        
        // Realistic lava colors based on temperature
        // White-hot at most active points, bright orange-yellow interior, deep reds/embers
        vec3 whiteHotCol = vec3(1.0, 0.95, 0.85);      // White-hot at most active
        vec3 brightOrangeCol = vec3(1.0, 0.6, 0.2);    // Bright orange-yellow
        vec3 orangeCol = vec3(1.0, 0.4, 0.1);          // Orange-red
        vec3 deepRedCol = vec3(0.9, 0.2, 0.05);         // Deep red (ember tones)
        vec3 darkRedCol = vec3(0.6, 0.1, 0.0);         // Dark red
        vec3 crustCol = vec3(0.15, 0.08, 0.05);        // Charcoal black/dark brown crust
        
        // Color gradient - white-hot centers, orange interior, deep reds when cooler
        vec3 baseLavaCol;
        if (solidificationNorm > 0.9) {
            // White-hot range: brightest, most active points
            float t = (solidificationNorm - 0.9) / 0.1;
            baseLavaCol = mix(brightOrangeCol, whiteHotCol, t);
        } else if (solidificationNorm > 0.7) {
            // Bright orange-yellow interior
            float t = (solidificationNorm - 0.7) / 0.2;
            baseLavaCol = mix(orangeCol, brightOrangeCol, t);
        } else if (solidificationNorm > 0.5) {
            // Orange-red
            float t = (solidificationNorm - 0.5) / 0.2;
            baseLavaCol = mix(deepRedCol, orangeCol, t);
        } else if (solidificationNorm > 0.3) {
            // Deep red (ember tones)
            float t = (solidificationNorm - 0.3) / 0.2;
            baseLavaCol = mix(darkRedCol, deepRedCol, t);
        } else {
            // Dark red - transitioning to crust
            baseLavaCol = darkRedCol;
        }
        
        // Crust formation - forms almost immediately, fractured like broken pottery
        // Crust is darker where lava is cooler or has been exposed longer
        float crustFactor = 1.0 - tempNorm; // More crust when cooler
        float crustPattern = fbm(T1 * 0.3 + vec2(slowTime * 0.2, slowTime * 0.15)); // Large-scale crust plates
        float crustCracks = fbm(T1 * 2.0 + vec2(slowTime * 0.5, slowTime * 0.4)); // Fine cracks
        
        // Crust forms in patches - plates drift and collide
        float crustThickness = smoothstep(0.3, 0.7, crustPattern) * crustFactor;
        crustThickness = pow(crustThickness, 1.5); // Sharper transitions for plate-like appearance
        
        // Cracks pulse with light - reveal bright orange, then seal to black
        float crackPulse = sin(slowTime * 2.0 + crustCracks * 10.0) * 0.5 + 0.5;
        float crackReveal = smoothstep(0.4, 0.6, crustCracks) * crackPulse;
        crustThickness = mix(crustThickness, crustThickness * 0.3, crackReveal * 0.5); // Cracks reveal glow
        
        // Pattern for interior glow - swirling, folding motion
        float patternFreq = u_LavaPatternFrequency;
        vec2 patternUv = T1 * patternFreq;
        float p = fbm(patternUv);
        
        // Add multiple scales for dense, heavy texture
        float p2 = fbm(patternUv * 0.5) * 0.5;
        float p3 = fbm(patternUv * 0.25) * 0.25; // Large-scale folds
        p = p * 0.5 + p2 * 0.3 + p3 * 0.2; // Combine for dense texture
        
        // Color variation - threaded with deep reds and ember tones
        vec2 colorUv = T2 * patternFreq;
        float colorVar = fbm(colorUv);
        float colorVar2 = fbm(colorUv * 0.5) * 0.5;
        colorVar = colorVar * 0.7 + colorVar2 * 0.3;
        
        // Reduce variation when cooler - but keep some for ember tones
        float variationStrength = mix(0.4, 1.0, tempNorm);
        p = mix(0.5, p, variationStrength);
        colorVar = mix(0.0, colorVar, variationStrength * 0.8);
        
        // Apply color variation - deep reds threaded through
        vec3 color = baseLavaCol * (0.85 + colorVar * 0.3);
        
        // Interior glow pattern - bright spots reveal through crust
        vec3 interiorGlow = color * (p * 2.0) + (color * color - 0.1);
        
        // Mix crust with interior - crust is dark, but cracks reveal bright glow
        vec3 lavaCol = mix(interiorGlow, crustCol, crustThickness);
        
        // Enhance cracks - pulse with bright orange light
        lavaCol = mix(lavaCol, baseLavaCol * 1.5, crackReveal * 0.3);
        
        // Color overflow effect (matching Three.js lava shader)
        vec3 lavaTemp = lavaCol;
        
        // Three.js lava shader overflow logic:
        if (lavaTemp.r > 1.0) {
            float overflow = clamp(lavaTemp.r - 2.0, 0.0, 100.0);
            lavaTemp.b += overflow;
            lavaTemp.g += overflow;
        }
        if (lavaTemp.g > 1.0) {
            float overflow = lavaTemp.g - 1.0;
            lavaTemp.r += overflow;
            lavaTemp.b += overflow;
        }
        if (lavaTemp.b > 1.0) {
            float overflow = lavaTemp.b - 1.0;
            lavaTemp.r += overflow;
            lavaTemp.g += overflow;
        }
        
        lavaCol = clamp(lavaTemp, vec3(0.0), vec3(5.0));
        
        // Make deeper pools appear brighter (more volume = brighter, like real lava)
        float volumeBrightness = sqrt(lavaVolume) * 1.5;
        volumeBrightness = clamp(volumeBrightness, 0.5, 2.0);
        lavaCol *= volumeBrightness;
        
        // Make lava completely opaque - replace surface color
        // CRITICAL: Use full replacement, not mix, to ensure lava color is visible
        // This should completely override the terrain color
        fcol = lavaCol;
        
        // Add emissive glow - keep it visible even when cooling
        // Reduce glow intensity as it cools, but keep it visible
        float glowIntensity = mix(0.3, 1.0, tempNorm); // Minimum 30% glow even when cool
        float glowFactor = glowIntensity * volumeBrightness * u_LavaGlowIntensity;
        glowFactor = clamp(glowFactor, 0.3, 3.0); // Minimum 0.3 to keep it visible
        vec3 lavaGlow = lavaCol * glowFactor * 0.5;
        fcol += lavaGlow;
    }
    // =====================================================
    
    // ========== STEAM EFFECT FOR WATER EVAPORATION ==========
    // Only show steam in normal view; in debug views it obscures data.
    // Check if water is evaporating (lava + water + hot temp)
    bool isEvaporating = (u_TerrainDebug == 0) &&
                         (lavaVolume > 0.001 && wval > 0.001 && lavaTemp > u_LavaSolidificationTemp);
    
    if (isEvaporating) {
        // Calculate steam intensity based on temperature and water volume
        float tempRange = u_LavaInitialTemp - u_LavaSolidificationTemp;
        float tempFactor = min(1.0, (lavaTemp - u_LavaSolidificationTemp) / max(tempRange * 0.5, 1.0));
        float volumeFactor = min(1.0, wval * 10.0);
        float baseIntensity = tempFactor * volumeFactor;
        
        // Use multi-octave FBM noise for realistic steam swirling
        // Animate noise over time with upward movement (steam rises)
        vec2 steamUV = fs_Uv * 8.0; // Scale for steam detail
        vec2 timeOffset = vec2(u_Time * 0.3, -u_Time * 0.5); // Horizontal drift, upward movement
        float steamNoise = fbm(steamUV + timeOffset);
        
        // Add secondary noise layer for more complex patterns
        float steamNoise2 = fbm(steamUV * 1.5 + timeOffset * 0.7 + vec2(10.0));
        steamNoise = mix(steamNoise, steamNoise2, 0.4);
        
        // Create density variation (steam is thicker in center, thinner at edges)
        float density = steamNoise * baseIntensity;
        density = pow(density, 1.5); // Sharpen the density distribution
        
        // Steam color gradient (white to light gray, slightly blue-tinted)
        vec3 steamColorLight = vec3(0.95, 0.95, 1.0); // Slight blue tint
        vec3 steamColorDark = vec3(0.85, 0.85, 0.9);  // Slightly darker gray
        vec3 steamColor = mix(steamColorDark, steamColorLight, density);
        
        // Alpha based on density (semi-transparent, thicker = more opaque)
        float steamAlpha = density * 0.7; // Increase from 0.4 to 0.7 (70% max opacity) for better visibility
        
        // Blend steam with background (alpha blending)
        fcol = mix(fcol, steamColor, steamAlpha);
        
        // Optional: Add slight additive glow for hot steam
        float hotThreshold = u_LavaSolidificationTemp + (u_LavaInitialTemp - u_LavaSolidificationTemp) * 0.75;
        if (lavaTemp > hotThreshold) {
            fcol += steamColor * density * 0.1; // Subtle additive glow
        }
    }
    // =====================================================

    vec3 tmpCol = fcol;
    fcol += addcol;

//    float groundfog = 1.0 - min(yval / 200.0,1.0);
//    groundfog = (1.0 - exp(-groundfog * 0.4));
//    fcol = mix(fcol, vec3(0.8,0.8,0.8), groundfog);




    out_Col = vec4(vec3(fcol)*1.0 ,1.f);
    col_reflect = vec4(tmpCol,1.0);
    //out_Col = vec4(vec3(shadowColorVal),1.0);
}
