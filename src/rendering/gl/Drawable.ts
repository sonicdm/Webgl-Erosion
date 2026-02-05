// WebGL constants (standard values)
const GL_TRIANGLES = 0x0004;
const GL_ELEMENT_ARRAY_BUFFER = 0x8893;
const GL_ARRAY_BUFFER = 0x8892;
const GL_STATIC_DRAW = 0x88E4;

abstract class Drawable {
  protected gl: WebGL2RenderingContext;
  count: number = 0;

  bufIdx: WebGLBuffer;
  bufPos: WebGLBuffer;
  bufNor: WebGLBuffer;
  bufUv : WebGLBuffer;

  idxBound: boolean = false;
  posBound: boolean = false;
  norBound: boolean = false;
  uvBound : boolean = false;

  mode = GL_TRIANGLES;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  abstract create() : void;

  destory() {
    this.gl.deleteBuffer(this.bufIdx);
    this.gl.deleteBuffer(this.bufPos);
    this.gl.deleteBuffer(this.bufNor);
    this.gl.deleteBuffer(this.bufUv);
  }

  generateIdx() {
    this.idxBound = true;
    this.bufIdx = this.gl.createBuffer()!;
  }

  generatePos() {
    this.posBound = true;
    this.bufPos = this.gl.createBuffer()!;
  }

  generateNor() {
    this.norBound = true;
    this.bufNor = this.gl.createBuffer()!;
  }

  generateUv(){
    this.uvBound = true;
    this.bufUv = this.gl.createBuffer()!;
  }

  bindIdx(): boolean {
    if (this.idxBound) {
      this.gl.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, this.bufIdx);
    }
    return this.idxBound;
  }

  bindPos(): boolean {
    if (this.posBound) {
      this.gl.bindBuffer(GL_ARRAY_BUFFER, this.bufPos);
    }
    return this.posBound;
  }

  bindNor(): boolean {
    if (this.norBound) {
      this.gl.bindBuffer(GL_ARRAY_BUFFER, this.bufNor);
    }
    return this.norBound;
  }

  bindUv(): boolean {
    if(this.uvBound){
      this.gl.bindBuffer(GL_ARRAY_BUFFER, this.bufUv);
    }
    return this.uvBound;
  }

  elemCount(): number {
    return this.count;
  }

  drawMode(): GLenum {
    return this.mode;
  }

  setDrawMode(m : GLenum){
    this.mode = m;
  }
};

export default Drawable;
