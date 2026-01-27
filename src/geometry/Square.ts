import {vec3, vec4} from 'gl-matrix';
import Drawable from '../rendering/gl/Drawable';

// WebGL constants
const GL_ELEMENT_ARRAY_BUFFER = 0x8893;
const GL_ARRAY_BUFFER = 0x8892;
const GL_STATIC_DRAW = 0x88E4;

class Square extends Drawable {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  center: vec4;

  constructor(gl: WebGL2RenderingContext, center: vec3) {
    super(gl); // Pass GL context to parent
    this.center = vec4.fromValues(center[0], center[1], center[2], 1);
  }

  create() {

  this.indices = new Uint32Array([0, 1, 2,
                                  0, 2, 3]);
  this.normals = new Float32Array([0, 0, 1, 0,
                                   0, 0, 1, 0,
                                   0, 0, 1, 0,
                                   0, 0, 1, 0]);
  this.positions = new Float32Array([-1, -1, 0.99999, 1,
                                     1, -1, 0.99999, 1,
                                     1, 1, 0.99999, 1,
                                     -1, 1, 0.99999, 1]);

    this.generateIdx();
    this.generatePos();
    this.generateNor();

    this.count = this.indices.length;
    this.gl.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, this.bufIdx);
    this.gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, this.indices, GL_STATIC_DRAW);

    this.gl.bindBuffer(GL_ARRAY_BUFFER, this.bufNor);
    this.gl.bufferData(GL_ARRAY_BUFFER, this.normals, GL_STATIC_DRAW);

    this.gl.bindBuffer(GL_ARRAY_BUFFER, this.bufPos);
    this.gl.bufferData(GL_ARRAY_BUFFER, this.positions, GL_STATIC_DRAW);

    console.log(`Created square`);
  }
};

export default Square;
