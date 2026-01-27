import {vec2, vec4, mat4, vec3} from 'gl-matrix';
import Drawable from './Drawable';
import * as TerrainUniforms from './uniforms/TerrainUniforms';
import * as BrushUniforms from './uniforms/BrushUniforms';
import * as SimulationUniforms from './uniforms/SimulationUniforms';

// WebGL constants
const GL_VERTEX_SHADER = 0x8B31;
const GL_FRAGMENT_SHADER = 0x8B30;
const GL_COMPILE_STATUS = 0x8B81;
const GL_LINK_STATUS = 0x8B82;
const GL_FLOAT = 0x1406;
const GL_UNSIGNED_INT = 0x1405;

var activeProgram: WebGLProgram = null;

export class Shader {
  shader: WebGLShader;
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, type: number, source: string) {
    this.gl = gl;
    this.shader = gl.createShader(type)!;
    gl.shaderSource(this.shader, source);
    gl.compileShader(this.shader);

    if (!gl.getShaderParameter(this.shader, GL_COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(this.shader);
    }
  }
};

class ShaderProgram {
  prog: WebGLProgram;
  private gl: WebGL2RenderingContext;

  attrPos: number;
  attrNor: number;
  attrCol: number;
  attrUv : number;

  unifModel: WebGLUniformLocation;
  unifModelInvTr: WebGLUniformLocation;
  unifViewProj: WebGLUniformLocation;
  unifColor: WebGLUniformLocation;
  unifPlanePos: WebGLUniformLocation;
  unifSpanwPos: WebGLUniformLocation;
  unifMouseWorldPos : WebGLUniformLocation;
  unifMouseWorldDir : WebGLUniformLocation;


  unifSimRes : WebGLUniformLocation;
  unifPipeLen : WebGLUniformLocation;
  unifKs : WebGLUniformLocation;
  unifKc : WebGLUniformLocation;
  unifKd : WebGLUniformLocation;
  unifRockErosionResistance : WebGLUniformLocation;
  unifTimestep : WebGLUniformLocation;
  unifPipeArea : WebGLUniformLocation;

  unifRef: WebGLUniformLocation;
  unifEye: WebGLUniformLocation;
  unifUp: WebGLUniformLocation;
  unifDimensions: WebGLUniformLocation;
  unifTime : WebGLUniformLocation;
  unifWaterTransparency : WebGLUniformLocation;

  unifRndTerrain : WebGLUniformLocation;
  unifTerrainType : WebGLUniformLocation;
  unifTerrainDebug : WebGLUniformLocation;
  unifTerrainScale : WebGLUniformLocation;
  unifTerrainHeight : WebGLUniformLocation;

  unifBrushType : WebGLUniformLocation;
  unifBrushSize : WebGLUniformLocation;
  unifBrushStrength : WebGLUniformLocation;
  unifBrushOperation : WebGLUniformLocation;
  unifBrushPressed : WebGLUniformLocation;
  unifBrusPos : WebGLUniformLocation;

  // Cache for uniform locations to avoid expensive getUniformLocation calls
  private uniformLocationCache: Map<string, WebGLUniformLocation> = new Map();

  constructor(gl: WebGL2RenderingContext, shaders: Array<Shader>) {
    this.gl = gl;
    this.prog = gl.createProgram()!;

    for (let shader of shaders) {
      gl.attachShader(this.prog, shader.shader);
    }
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, GL_LINK_STATUS)) {
      throw gl.getProgramInfoLog(this.prog);
    }

    this.attrPos = gl.getAttribLocation(this.prog, "vs_Pos");
    this.attrNor = gl.getAttribLocation(this.prog, "vs_Nor");
    this.attrCol = gl.getAttribLocation(this.prog, "vs_Col");
    this.attrUv  = gl.getAttribLocation(this.prog,"vs_Uv");
    this.unifModel      = gl.getUniformLocation(this.prog, "u_Model");
    this.unifModelInvTr = gl.getUniformLocation(this.prog, "u_ModelInvTr");
    this.unifViewProj   = gl.getUniformLocation(this.prog, "u_ViewProj");
    this.unifPlanePos   = gl.getUniformLocation(this.prog, "u_PlanePos");
    this.unifSpanwPos = gl.getUniformLocation(this.prog, "u_SpawnPos");
    this.unifMouseWorldPos =  gl.getUniformLocation(this.prog, "u_MouseWorldPos");
    this.unifMouseWorldDir = gl.getUniformLocation(this.prog, "u_MouseWorldDir");

    this.unifSimRes = gl.getUniformLocation(this.prog, "u_SimRes");
    this.unifPipeLen = gl.getUniformLocation(this.prog, "u_PipeLen");
    this.unifKs = gl.getUniformLocation(this.prog, "u_Ks");
    this.unifKc = gl.getUniformLocation(this.prog, "u_Kc");
    this.unifKd = gl.getUniformLocation(this.prog, "u_Kd");
    this.unifRockErosionResistance = gl.getUniformLocation(this.prog, "u_RockErosionResistance");
    this.unifTimestep = gl.getUniformLocation(this.prog, "u_timestep");
    this.unifPipeArea = gl.getUniformLocation(this.prog,"u_PipeArea");

    this.unifEye   = gl.getUniformLocation(this.prog, "u_Eye");
    this.unifRef   = gl.getUniformLocation(this.prog, "u_Ref");
    this.unifUp   = gl.getUniformLocation(this.prog, "u_Up");
    this.unifDimensions = gl.getUniformLocation(this.prog,"u_Dimensions");
    this.unifTime = gl.getUniformLocation(this.prog,"u_Time");
    this.unifWaterTransparency = gl.getUniformLocation(this.prog,"u_WaterTransparency");


    this.unifRndTerrain = gl.getUniformLocation(this.prog,"u_RndTerrain");
    this.unifTerrainType = gl.getUniformLocation(this.prog,"u_TerrainType");
    this.unifTerrainDebug = gl.getUniformLocation(this.prog,"u_TerrainDebug");
    this.unifTerrainScale = gl.getUniformLocation(this.prog,"u_TerrainScale");
    this.unifTerrainHeight = gl.getUniformLocation(this.prog,"u_TerrainHeight");

    this.unifBrushSize = gl.getUniformLocation(this.prog,"u_BrushSize");
    this.unifBrushType = gl.getUniformLocation(this.prog,"u_BrushType");
    this.unifBrushStrength = gl.getUniformLocation(this.prog,"u_BrushStrength");
    this.unifBrushOperation = gl.getUniformLocation(this.prog,"u_BrushOperation");
    this.unifBrushPressed = gl.getUniformLocation(this.prog,"u_BrushPressed");
    this.unifBrusPos = gl.getUniformLocation(this.prog,"u_BrushPos");
  }

  use() {
    if (activeProgram !== this.prog) {
      this.gl.useProgram(this.prog);
      activeProgram = this.prog;
    }
  }

  setModelMatrix(model: mat4) {
    this.use();
    if (this.unifModel !== -1) {
      this.gl.uniformMatrix4fv(this.unifModel, false, model);
    }

    if (this.unifModelInvTr !== -1) {
      let modelinvtr: mat4 = mat4.create();
      mat4.transpose(modelinvtr, model);
      mat4.invert(modelinvtr, modelinvtr);
      this.gl.uniformMatrix4fv(this.unifModelInvTr, false, modelinvtr);
    }
  }

  setViewProjMatrix(vp: mat4) {
    this.use();
    if (this.unifViewProj !== -1) {
      this.gl.uniformMatrix4fv(this.unifViewProj, false, vp);
    }
  }
  // Get uniform location with caching
  private getUniformLocation(name: string): WebGLUniformLocation | null {
    if (!this.uniformLocationCache.has(name)) {
      const loc = this.gl.getUniformLocation(this.prog, name);
      this.uniformLocationCache.set(name, loc);
      return loc;
    }
    return this.uniformLocationCache.get(name)!;
  }

  setInt(f : number, name : string){
    this.use();
    const loc = this.getUniformLocation(name);
    if (loc !== null && loc !== -1) {
      this.gl.uniform1i(loc, f);
    }
  }

  setFloat(f : number, name : string){
    this.use();
    const loc = this.getUniformLocation(name);
    if (loc !== null && loc !== -1) {
      this.gl.uniform1f(loc, f);
    }
  }
  setVec2(v : vec2, name : string){
    this.use();
    const loc = this.getUniformLocation(name);
    if (loc !== null && loc !== -1) {
      this.gl.uniform2fv(loc, v);
    }
  }
  setTime(t:number){
    this.use();
    if(this.unifTime!==-1){
      this.gl.uniform1f(this.unifTime,t);
    }
  }

  setWaterTransparency(t:number){
    this.use();
    if(this.unifWaterTransparency!==-1){
      this.gl.uniform1f(this.unifWaterTransparency,t);
    }
  }

    setDimensions(width: number, height: number) {
        this.use();
        if(this.unifDimensions !== -1) {
            this.gl.uniform2f(this.unifDimensions, width, height);
        }
    }

    setTerrainType(t:number){
    this.use();
    TerrainUniforms.setTerrainType(this.gl, this.prog, t);
    }

    setBrushType(t :number){
    this.use();
    BrushUniforms.setBrushType(this.gl, this.prog, t);
    }

    setBrushSize(t:number){
    this.use();
    BrushUniforms.setBrushSize(this.gl, this.prog, t);
    }

  setBrushStrength(t:number){
    this.use();
    BrushUniforms.setBrushStrength(this.gl, this.prog, t);
  }

    setBrushOperation(t :number){
      this.use();
      BrushUniforms.setBrushOperation(this.gl, this.prog, t);
    }

    setBrushPos(t:vec2){
    this.use();
    BrushUniforms.setBrushPos(this.gl, this.prog, t);
    }

  setBrushPressed(t :number){
    this.use();
    BrushUniforms.setBrushPressed(this.gl, this.prog, t);
  }

  setSourceCount(count: number) {
    this.use();
    const loc = this.getUniformLocation("u_SourceCount");
    if (loc !== null && loc !== -1) {
      this.gl.uniform1i(loc, count);
    }
  }

  setSourcePositions(positions: Float32Array) {
    this.use();
    const loc = this.getUniformLocation("u_SourcePositions");
    if (loc !== null && loc !== -1) {
      this.gl.uniform2fv(loc, positions);
    }
  }

  setSourceSizes(sizes: Float32Array) {
    this.use();
    const loc = this.getUniformLocation("u_SourceSizes");
    if (loc !== null && loc !== -1) {
      this.gl.uniform1fv(loc, sizes);
    }
  }

  setSourceStrengths(strengths: Float32Array) {
    this.use();
    const loc = this.getUniformLocation("u_SourceStrengths");
    if (loc !== -1) {
      this.gl.uniform1fv(loc, strengths);
    }
  }

  setTerrainDebug(t:number){
    this.use();
    TerrainUniforms.setTerrainDebug(this.gl, this.prog, t);
  }

  setTerrainScale(t : number){
    this.use();
    TerrainUniforms.setTerrainScale(this.gl, this.prog, t);
  }

  setTerrainHeight(t : number){
    this.use();
    TerrainUniforms.setTerrainHeight(this.gl, this.prog, t);
  }


  setSpawnPos(pos: vec2) {
    this.use();
    if (this.unifSpanwPos !== -1) {
      this.gl.uniform2fv(this.unifSpanwPos, pos);
    }
  }



  setMouseWorldPos(pos : vec4){
    this.use();
    if(this.unifMouseWorldPos !== -1){
      this.gl.uniform4fv(this.unifMouseWorldPos, pos);
    }
  }

  setMouseWorldDir(dir : vec3){
    this.use();
    if(this.unifMouseWorldDir !== -1){
      this.gl.uniform3fv(this.unifMouseWorldDir, dir);
    }
  }

    setRndTerrain(r:number){
    this.use();
    TerrainUniforms.setRndTerrain(this.gl, this.prog, r);
    }
  setPlanePos(pos: vec2) {
    this.use();
    if (this.unifPlanePos !== -1) {
      this.gl.uniform2fv(this.unifPlanePos, pos);
    }
  }
    setEyeRefUp(eye: vec3, ref: vec3, up: vec3) {
        this.use();
        if(this.unifEye !== -1) {
            this.gl.uniform3f(this.unifEye, eye[0], eye[1], eye[2]);
        }
        if(this.unifRef !== -1) {
            this.gl.uniform3f(this.unifRef, ref[0], ref[1], ref[2]);
        }
        if(this.unifUp !== -1) {
            this.gl.uniform3f(this.unifUp, up[0], up[1], up[2]);
        }
    }
  setPipeLen(len : number){
    this.use();
    SimulationUniforms.setPipeLen(this.gl, this.prog, len);
  }

  setKs(k :number){
    this.use();
    SimulationUniforms.setKs(this.gl, this.prog, k);
  }

  setKc(k :number){
      this.use();
      SimulationUniforms.setKc(this.gl, this.prog, k);
  }

  setTimestep(t:number){
    this.use();
    SimulationUniforms.setTimestep(this.gl, this.prog, t);
  }

  setPipeArea(a:number){
    this.use();
    SimulationUniforms.setPipeArea(this.gl, this.prog, a);
  }

  setKd(k :number){
      this.use();
      SimulationUniforms.setKd(this.gl, this.prog, k);
  }

  setRockErosionResistance(resistance: number) {
    this.use();
    SimulationUniforms.setRockErosionResistance(this.gl, this.prog, resistance);
  }

  setSimres(res:number){
    this.use();
    SimulationUniforms.setSimres(this.gl, this.prog, res);
  }



  draw(d: Drawable) {
    this.use();

    if (this.attrPos != -1 && d.bindPos()) {
      this.gl.enableVertexAttribArray(this.attrPos);
      this.gl.vertexAttribPointer(this.attrPos, 4, GL_FLOAT, false, 0, 0);
    }

    if (this.attrNor != -1 && d.bindNor()) {
      this.gl.enableVertexAttribArray(this.attrNor);
      this.gl.vertexAttribPointer(this.attrNor, 4, GL_FLOAT, false, 0, 0);
    }

    if(this.attrUv != -1 && d.bindUv()){
      this.gl.enableVertexAttribArray(this.attrUv);
      this.gl.vertexAttribPointer(this.attrUv,2, GL_FLOAT,false,0,0);
    }

    d.bindIdx();
    this.gl.drawElements(d.drawMode(), d.elemCount(), GL_UNSIGNED_INT, 0);

    if (this.attrPos != -1) this.gl.disableVertexAttribArray(this.attrPos);
    if (this.attrNor != -1) this.gl.disableVertexAttribArray(this.attrNor);
    if (this.attrUv != -1) this.gl.disableVertexAttribArray(this.attrUv);
  }
};

export default ShaderProgram;
