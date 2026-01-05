import {vec3} from 'gl-matrix';
import Square from '../geometry/Square';
import OpenGLRenderer from './gl/OpenGLRenderer';
import Camera from '../Camera';
import ShaderProgram from './gl/ShaderProgram';
import { frame_buffer, render_buffer, getHeightMapTexture } from '../simulation/texture-management';
import { simres } from '../simulation/simulation-state';

export function Render2Texture(
    renderer: OpenGLRenderer,
    gl_context: WebGL2RenderingContext,
    camera: Camera,
    shader: ShaderProgram,
    cur_texture: WebGLTexture,
    square: Square,
    noiseterrain: ShaderProgram | null
): void {
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, render_buffer);
    gl_context.renderbufferStorage(gl_context.RENDERBUFFER, gl_context.DEPTH_COMPONENT16,
        simres, simres);

    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT0, gl_context.TEXTURE_2D, cur_texture, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT1, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT2, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferTexture2D(gl_context.FRAMEBUFFER, gl_context.COLOR_ATTACHMENT3, gl_context.TEXTURE_2D, null, 0);
    gl_context.framebufferRenderbuffer(gl_context.FRAMEBUFFER, gl_context.DEPTH_ATTACHMENT, gl_context.RENDERBUFFER, render_buffer);
    gl_context.drawBuffers([gl_context.COLOR_ATTACHMENT0]);

    let status = gl_context.checkFramebufferStatus(gl_context.FRAMEBUFFER);
    if (status !== gl_context.FRAMEBUFFER_COMPLETE) {
        console.log("frame buffer status:" + status.toString());
    }

    gl_context.bindTexture(gl_context.TEXTURE_2D, null);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
    gl_context.bindRenderbuffer(gl_context.RENDERBUFFER, null);

    gl_context.viewport(0, 0, simres, simres);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, frame_buffer);
    renderer.clear();
    shader.use();

    // Set height map texture if this is the initial terrain shader and height map exists
    const heightmap_tex = getHeightMapTexture();
    if (noiseterrain && shader === noiseterrain && heightmap_tex) {
        const useHeightMap = 1;
        gl_context.uniform1i(gl_context.getUniformLocation(shader.prog, "u_UseHeightMap"), useHeightMap);
        gl_context.activeTexture(gl_context.TEXTURE0 + 10);
        gl_context.bindTexture(gl_context.TEXTURE_2D, heightmap_tex);
        gl_context.uniform1i(gl_context.getUniformLocation(shader.prog, "u_HeightMap"), 10);
    } else if (noiseterrain && shader === noiseterrain) {
        gl_context.uniform1i(gl_context.getUniformLocation(shader.prog, "u_UseHeightMap"), 0);
    }

    renderer.render(camera, shader, [square]);
    gl_context.bindFramebuffer(gl_context.FRAMEBUFFER, null);
}

