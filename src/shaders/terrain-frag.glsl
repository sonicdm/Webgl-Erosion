#version 300 es
precision highp float;

uniform vec2 u_PlanePos; // Our location in the virtual world displayed by the plane


in vec3 fs_Pos;
in vec4 fs_Nor;
in vec4 fs_Col;
in float fs_Sine;
in vec2 fs_Uv;
in vec4 fs_shadowPos;

uniform sampler2D hightmap;
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
uniform float u_Time; // Time for steam effect animation
uniform float u_LavaSolidificationTemp; // Temperature threshold for solidification (default: 800.0 °C)
uniform float u_LavaInitialTemp; // Initial temperature for new lava (default: 1200.0 °C)
uniform float u_LavaAmbientTemp; // Ambient air temperature (default: 20.0 °C)
uniform int u_LavaEnabled; // Flag to enable/disable lava rendering (1 = enabled, 0 = disabled)


uniform mat4 u_sproj;
uniform mat4 u_sview;

vec3 calnor(vec2 uv){
    float eps = 1.f/u_SimRes;
    vec4 cur = texture(hightmap,uv);
    vec4 r = texture(hightmap,uv+vec2(eps,0.f));
    vec4 t = texture(hightmap,uv+vec2(0.f,eps));
    vec4 b = texture(hightmap,uv+vec2(0.f,-eps));
    vec4 l = texture(hightmap,uv+vec2(-eps,0.f));

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
    vec4 HC = texture(hightmap,fs_Uv);
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
    vec4 fH = texture(hightmap,fs_Uv);
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
        fcol = texture(hightmap,fs_Uv).xyz;
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
        // Show lava volume as color intensity with better scaling to show differences
        // Use different color ranges for different volume levels
        if (lavaVolume < 0.01) {
            fcol = vec3(lavaVolume * 100.0, 0.0, 0.0); // Red for small volumes
        } else if (lavaVolume < 0.1) {
            fcol = vec3(1.0, lavaVolume * 10.0, 0.0); // Yellow for medium volumes
        } else {
            fcol = vec3(1.0, 1.0, lavaVolume * 2.0); // White for large volumes
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
        vec4 terrainData = texture(hightmap, fs_Uv);
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
        vec4 terrainData = texture(hightmap, fs_Uv);
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
        
        // Simplified flow pattern - only calculate if lava exists
        vec2 flowUv1 = fs_Uv + vec2(1.5, -1.5) * u_Time * 0.02;
        vec2 flowUv2 = fs_Uv + vec2(-0.5, 2.0) * u_Time * 0.01;
        float noise1 = fbm(flowUv1 * 2.0);
        float noise2 = fbm(flowUv2 * 2.0);
        float flowPattern = (noise1 + noise2 * 0.5) * 0.5;
        flowPattern = flowPattern * 0.3 + 0.7; // Scale to 0.7-1.0 range
        
        // Base colors - reduced brightness for hottest to avoid overexposure
        vec3 hottestLavaCol = vec3(0.9, 0.6, 0.2);  // Reduced brightness - orange-yellow
        vec3 hotLavaCol = vec3(0.9, 0.4, 0.05);     // Orange-red (reduced brightness)
        vec3 coolLavaCol = vec3(0.7, 0.15, 0.0);    // Deep orange-red
        vec3 coldestLavaCol = vec3(0.3, 0.03, 0.0); // Dark red (cooling)
        vec3 nearSolidCol = vec3(0.15, 0.01, 0.0);  // Very dark red-brown (near solidification)
        vec3 belowSolidCol = vec3(0.08, 0.005, 0.0); // Almost black (below solidification, still liquid)
        
        // Multi-stage color gradient based on solidification-normalized temp
        // This ensures color transitions happen at meaningful temperature points
        vec3 baseLavaCol;
        if (solidificationNorm > 0.75) {
            // Hottest range (above ~1100°C): bright yellow-orange
            float t = (solidificationNorm - 0.75) / 0.25;
            baseLavaCol = mix(hotLavaCol, hottestLavaCol, t);
        } else if (solidificationNorm > 0.5) {
            // Hot range (1000-1100°C): orange-red (typical lava color)
            float t = (solidificationNorm - 0.5) / 0.25;
            baseLavaCol = mix(coolLavaCol, hotLavaCol, t);
        } else if (solidificationNorm > 0.25) {
            // Cool range (900-1000°C): deep red to dark red
            float t = (solidificationNorm - 0.25) / 0.25;
            baseLavaCol = mix(coldestLavaCol, coolLavaCol, t);
        } else if (solidificationNorm > 0.0) {
            // Near solidification (800-900°C): very dark red-brown
            float t = solidificationNorm / 0.25;
            baseLavaCol = mix(nearSolidCol, coldestLavaCol, t);
        } else {
            // Below solidification but still liquid (ambient to 800°C): fade to almost black
            // Map from -1.0 (ambient) to 0.0 (solidification) smoothly
            float t = clamp((solidificationNorm + 1.0) / 1.0, 0.0, 1.0);
            baseLavaCol = mix(belowSolidCol, nearSolidCol, t);
        }
        
        // Apply flow pattern variation to color (like Three.js shader)
        vec3 lavaCol = baseLavaCol * flowPattern;
        
        // Add self-multiplication effect (color * color - 0.1) like Three.js shader
        vec3 multiplied = lavaCol * (flowPattern * 2.0) + (lavaCol * lavaCol - 0.1);
        lavaCol = mix(lavaCol, multiplied, 0.7);
        
        // Make deeper pools appear brighter (more volume = brighter, like real lava)
        float volumeBrightness = sqrt(lavaVolume) * 1.5;
        volumeBrightness = clamp(volumeBrightness, 0.5, 2.0);
        
        // Color overflow effect (matching Three.js lava shader)
        vec3 temp = lavaCol * volumeBrightness;
        
        // Three.js lava shader overflow logic:
        if (temp.r > 1.0) {
            float overflow = clamp(temp.r - 2.0, 0.0, 100.0);
            temp.b += overflow;
            temp.g += overflow;
        }
        if (temp.g > 1.0) {
            float overflow = temp.g - 1.0;
            temp.r += overflow;
            temp.b += overflow;
        }
        if (temp.b > 1.0) {
            float overflow = temp.b - 1.0;
            temp.r += overflow;
            temp.g += overflow;
        }
        
        lavaCol = clamp(temp, vec3(0.0), vec3(5.0));
        
        // Make lava completely opaque - replace surface color
        float lavaOpacity = 1.0;
        fcol = mix(fcol, lavaCol, lavaOpacity);
        
        // Add intense emissive glow
        float glowFactor = tempNorm * volumeBrightness * u_LavaGlowIntensity;
        glowFactor = clamp(glowFactor, 0.5, 3.0);
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
