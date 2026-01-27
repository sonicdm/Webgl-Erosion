import {mat4, vec4} from 'gl-matrix';
import Drawable from './Drawable';
import Camera from '../../Camera';
import ShaderProgram from './ShaderProgram';
import {isNumber} from "util";

// WebGL constants
const GL_COLOR_BUFFER_BIT = 0x00004000;
const GL_DEPTH_BUFFER_BIT = 0x00000100;

class OpenGLRenderer {
  counter : number;
  private gl: WebGL2RenderingContext;

  constructor(public canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.counter = 0;
  }

  setClearColor(r: number, g: number, b: number, a: number) {
    this.gl.clearColor(r, g, b, a);
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.gl.clear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  }

  render(camera: Camera, prog: ShaderProgram, drawables: Array<Drawable>) {
    let model = mat4.create();
    let viewProj = mat4.create();
    let color = vec4.fromValues(1, 0, 0, 1);

    mat4.identity(model);
    mat4.multiply(viewProj, camera.projectionMatrix, camera.viewMatrix);
    prog.setModelMatrix(model);
    prog.setViewProjMatrix(viewProj);
    prog.setEyeRefUp(camera.position, camera.target, camera.up);
    prog.setDimensions(this.canvas.width,this.canvas.height);

    for (let drawable of drawables) {
      prog.draw(drawable);
    }
  }
};

export default OpenGLRenderer;
