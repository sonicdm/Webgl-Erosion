#version 300 es
precision highp float;

uniform sampler2D readTerrain;

uniform float u_Time;
uniform float raindeg;
uniform float u_SimRes; // Simulation resolution for neighbor sampling

uniform vec4 u_MouseWorldPos;
uniform vec3 u_MouseWorldDir;
uniform float u_BrushSize;
uniform float u_BrushStrength;
uniform int u_BrushType;
uniform int u_BrushPressed;
uniform vec2 u_BrushPos;
uniform int u_BrushOperation;
uniform int u_RainErosion;
uniform float u_RainErosionStrength;
uniform float u_RainErosionDropSize;
uniform float u_FlattenTargetHeight; // Target height for flatten brush (will be set from center)
uniform vec2 u_SlopeStartPos; // Start position for slope brush
uniform vec2 u_SlopeEndPos; // End position for slope brush
uniform int u_SlopeActive; // 0 = not active, 1 = start set, 2 = end set

uniform int u_SourceCount;
uniform vec2 u_SourcePositions[16];  // Max 16 sources
uniform float u_SourceSizes[16];
uniform float u_SourceStrengths[16];

layout (location = 0) out vec4 writeTerrain;

#define OCTAVES 6

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
            amplitude *= .53;
      }
      return value;
}


//generic noise from https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

float noise(vec3 p){
      vec3 a = floor(p);
      vec3 d = p - a;
      d = d * d * (3.0 - 2.0 * d);

      vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
      vec4 k1 = perm(b.xyxy);
      vec4 k2 = perm(k1.xyxy + b.zzww);

      vec4 c = k2 + a.zzzz;
      vec4 k3 = perm(c);
      vec4 k4 = perm(c + 1.0);

      vec4 o1 = fract(k3 * (1.0 / 41.0));
      vec4 o2 = fract(k4 * (1.0 / 41.0));

      vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
      vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

      return o4.y * d.y + o4.x * (1.0 - d.y);
}

//float random (in vec2 st) {
//      return fract(sin(dot(st.xy,
//      vec2(12.9898,78.233)))*
//      43758.5453123);
//}

in vec2 fs_Pos;


struct BrushTmp{
      float bStrength;
      float bSize;
      vec2 bPos;
};

void main() {

      vec2 curuv = 0.5f*fs_Pos+0.5f;
      vec3 sand = vec3(214.f/255.f,164.f/255.f,96.f/255.f);
      vec3 watercol = vec3(0.1,0.3,0.8);


      float addterrain = 0.0;
      float addwater = 0.0;
      float amount = 0.0006 * u_BrushStrength;
      float aw = fbm(curuv*10.0 + vec2(sin(u_Time * 35.0), cos(u_Time*115.0)));
      float div = 1.0 / u_SimRes; // Pixel size in UV space
      
      // Read current terrain
      vec4 cur = texture(readTerrain, curuv);
      float currentHeight = cur.x;
      
      // normal water brush
      if(u_BrushType != 0){
            vec3 ro = u_MouseWorldPos.xyz;
            vec3 rd = u_MouseWorldDir;
            vec2 pointOnPlane = u_BrushPos;
            float pdis2fragment = distance(pointOnPlane, curuv);
            if (pdis2fragment < 0.01 * u_BrushSize){
                  float dens = (0.01 * u_BrushSize - pdis2fragment * 0.5) / (0.01 * u_BrushSize);
                  dens = max(0.0, dens); // Clamp density

                  if(u_BrushType == 1 && u_BrushPressed == 1){
                        // Shift Terrain - Elevate with primary button, lower with secondary (Alt+brush)
                        // u_BrushOperation: 0 = primary (elevate), 1 = secondary (lower)
                        addterrain =  amount * 1.0 * 280.0;
                        addterrain = u_BrushOperation == 0 ? addterrain : -addterrain;
                  }else if(u_BrushType == 2 && u_BrushPressed == 1){
                        // Water brush
                        addwater =  amount * dens * 200.0;
                        addwater *= aw;
                        addwater = u_BrushOperation == 0 ? addwater : -addwater;
                  }else if(u_BrushType == 3 && u_BrushPressed == 1){
                        // Rock brush - will be handled in output to set B channel
                  }else if(u_BrushType == 4 && u_BrushPressed == 1){
                        // Soften Terrain - gentle smoothing (primary button only)
                        if (u_BrushOperation == 0) {
                              vec4 top = texture(readTerrain, curuv + vec2(0.0, div));
                              vec4 right = texture(readTerrain, curuv + vec2(div, 0.0));
                              vec4 bottom = texture(readTerrain, curuv + vec2(0.0, -div));
                              vec4 left = texture(readTerrain, curuv + vec2(-div, 0.0));
                              
                              float avgHeight = (top.x + right.x + bottom.x + left.x) / 4.0;
                              float smoothAmount = dens * u_BrushStrength * 0.1; // Smoothing strength
                              addterrain = (avgHeight - currentHeight) * smoothAmount;
                        }
                  }else if(u_BrushType == 5 && u_BrushPressed == 1){
                        // Flatten Terrain - secondary button (Alt) sets target, primary flattens
                        // Only flatten when primary button is pressed (brushOperation == 0)
                        // Alt+click (brushOperation == 1) should NOT flatten, just set target in JS
                        if (u_BrushOperation == 0) {
                              // Primary button: flatten to target height
                              float targetHeight = u_FlattenTargetHeight;
                              float flattenAmount = dens * u_BrushStrength * 0.2; // Flattening strength
                              addterrain = (targetHeight - currentHeight) * flattenAmount;
                        }
                        // When Alt is pressed (brushOperation == 1), don't do anything - JS will set target
                  }else if(u_BrushType == 6 && u_BrushPressed == 1){
                        // Slope Terrain - click sets end point, Alt+click sets start point
                        // Once both points are set (u_SlopeActive == 2), create slope between them
                        // Only apply when brush is pressed AND near the slope line
                        if (u_SlopeActive == 2) {
                              // Both points are set - create slope from start to end
                              vec2 slopeDir = u_SlopeEndPos - u_SlopeStartPos;
                              float slopeLength = length(slopeDir);
                              
                              if (slopeLength > 0.001) {
                                    // Normalize direction
                                    vec2 slopeDirNorm = normalize(slopeDir);
                                    
                                    // Project brush position onto the slope line to see where we are along it
                                    vec2 brushToStart = u_BrushPos - u_SlopeStartPos;
                                    float brushProjDist = dot(brushToStart, slopeDirNorm);
                                    
                                    // Project current fragment position onto the slope line
                                    vec2 toCurrent = curuv - u_SlopeStartPos;
                                    float projDist = dot(toCurrent, slopeDirNorm);
                                    
                                    // Get heights at start and end points
                                    vec4 startTerrain = texture(readTerrain, u_SlopeStartPos);
                                    vec4 endTerrain = texture(readTerrain, u_SlopeEndPos);
                                    float startHeight = startTerrain.x;
                                    float endHeight = endTerrain.x;
                                    
                                    // Calculate target height based on position along slope
                                    float t = clamp(projDist / slopeLength, 0.0, 1.0);
                                    float targetHeight = mix(startHeight, endHeight, t);
                                    
                                    // Check if current fragment is within brush radius of the brush position
                                    float distToBrush = distance(curuv, u_BrushPos);
                                    float brushRadius = 0.01 * u_BrushSize;
                                    
                                    // Only apply slope when fragment is within brush radius
                                    if (distToBrush < brushRadius) {
                                          // Calculate density based on distance from brush center
                                          float dens = (brushRadius - distToBrush) / brushRadius;
                                          dens = max(0.0, dens);
                                          
                                          // Apply slope with moderate strength - lower than before to avoid over-correction
                                          float slopeAmount = dens * u_BrushStrength * 0.3;
                                          addterrain = (targetHeight - currentHeight) * slopeAmount;
                                    }
                              }
                        }
                  }

            }

      }

      // rain erosion
      if(u_RainErosion == 1 && mod(u_Time, 5.0) == 1.0 ){
            float smallradius = 0.025  * u_RainErosionDropSize;
            float rdx = random(vec2(30.0, cos(u_Time)));
            float rdy = random(vec2(u_Time, 10.0));
            float rdr = random(vec2(20.0,u_Time * 10.0));

            float str = 1.0;
            if(mod(u_Time, 20.0) == 1.0) str = 9.0;

            float dis2small = distance(vec2(rdx, rdy), curuv);
            if (dis2small < smallradius ){
                  addwater +=  0.06 * u_RainErosionStrength* (1.0 + 5.0 * rdr);
            }



      }

//                  if(mod(u_Time, 10.0) == 1.0)
//                  addwater += 0.006 * aw;


      // permanent water source brush - handle multiple sources
      for(int i = 0; i < u_SourceCount; i++){
            vec2 pointOnPlane = u_SourcePositions[i];
            float pdis2fragment = distance(pointOnPlane, curuv);
            float sourceSize = u_SourceSizes[i];
            float sourceStrength = u_SourceStrengths[i];
            
            if (pdis2fragment < 0.01 * sourceSize){
                  float dens = (0.01 * sourceSize - pdis2fragment) / (0.01 * sourceSize);
                  float sourceAmount = 0.0006 * sourceStrength;
                  float sourceWater = sourceAmount * dens * 280.0;
                  float aw = fbm(curuv*200.0 + vec2(sin(u_Time * 5.0), cos(u_Time*15.0)));
                  sourceWater *= aw;
                  addwater += sourceWater;
            }
      }






      // cur already declared at top of main()
      float rain = raindeg;



      float epsilon = 0.000001f;


      float nrain = noise(vec3(curuv * 100.0, u_Time));
      nrain = fbm(curuv*1.0 + vec2(sin(u_Time * 5.0), cos(u_Time*15.0)));

      rain = nrain/100.0;

//      if(mod(u_Time, 10.0) <= 1.0){
//            rain = 0.0f;
//            addwater = 0.0f;
//      }

      //if(mod(u_Time,100.0)!=9.0)
      rain = 0.0f;

      epsilon = 0.0f;
//      if(curuv.x<maxx && curuv.x>minx && curuv.y<maxy&&curuv.y>miny){
//            rain += 0.001;
//      }
//      else{
//            rain = raindeg;
//      }


      // Handle rock material placement (store in B channel: 1.0 = rock, 0.0 = normal terrain)
      float rockMaterial = cur.z;
      float baseRockSurfaceHeight = cur.w; // A channel stores base rock surface height
      
      // Check for rock brush - handle it in the same brush check block for consistency
      if(u_BrushType == 3 && u_BrushPressed == 1){
            vec2 pointOnPlane = u_BrushPos;
            float pdis2fragment = distance(pointOnPlane, curuv);
            if (pdis2fragment < 0.01 * u_BrushSize){
                  float dens = (0.01 * u_BrushSize - pdis2fragment * 0.5) / (0.01 * u_BrushSize);
                  // Use a much stronger mix factor for rock placement - make it clearly visible
                  // Clamp dens to ensure it's positive and meaningful
                  dens = max(0.0, dens);
                  float mixFactor = dens * u_BrushStrength * 2.0; // Strong multiplier for immediate effect
                  mixFactor = min(mixFactor, 1.0); // Clamp to 1.0
                  if(u_BrushOperation == 0){
                        // Add rock material - use max to ensure it increases
                        float oldRockMaterial = rockMaterial;
                        rockMaterial = max(rockMaterial, mix(rockMaterial, 1.0, mixFactor));
                        
                        // If we're placing rock (and rock material is significant), reset base rock surface height
                        // This makes the new rock surface the base, even if there was sediment on top
                        // Reset whenever we're painting rock, not just when it increases (handles already-high rock)
                        if(rockMaterial > 0.5 && mixFactor > 0.01){
                              // Calculate final height after terrain modifications
                              float finalHeight = min(max(cur.x + addterrain, -0.10),2000.30);
                              // Reset base rock surface to current height - new rock becomes the base
                              baseRockSurfaceHeight = finalHeight;
                        }
                  } else {
                        // Remove rock material - use min to ensure it decreases
                        rockMaterial = min(rockMaterial, mix(rockMaterial, 0.0, mixFactor));
                        // If rock is removed, clear the base rock surface height
                        if(rockMaterial < 0.1){
                              baseRockSurfaceHeight = 0.0;
                        }
                  }
            }
      }
      
      writeTerrain = vec4(min(max(cur.x + addterrain, -0.10),2000.30),max(cur.y+rain * raindeg + addwater, 0.0f),rockMaterial,baseRockSurfaceHeight);
}