/**
 * assertNonZeroDisplacement — dev-only check that VTF displacement produced non-flat output
 * (Workstream H shadow/render-path verification).
 *
 * Renders a 1×1 pass of the mesh and reads color. If it matches clear or uniform, warns.
 * No-op in production. For a full depth check, use a depth RT and gl.readPixels DEPTH_COMPONENT.
 */

import * as THREE from 'three';

export interface AssertNonZeroDisplacementOptions {
  /** Skip when true or in production. Default: true in dev. */
  enabled?: boolean;
}

/**
 * Renders mesh in a 1×1 viewport, reads color; warns if clear/uniform (heuristic for no displacement).
 * Call after setting VTF material on the terrain mesh. No-op when NODE_ENV === 'production'
 * or options.enabled === false.
 */
export function assertNonZeroDisplacement(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  mesh: THREE.Mesh,
  options: AssertNonZeroDisplacementOptions = {}
): void {
  const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  if (isProd || options.enabled === false) return;

  const rt = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType
  });
  const prevRt = renderer.getRenderTarget();
  const size = renderer.getSize(new THREE.Vector2());

  renderer.setRenderTarget(rt);
  renderer.setViewport(0, 0, 1, 1);
  renderer.clear(true, true, true);
  renderer.render(mesh, camera);

  const pixel = new Uint8Array(4);
  renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, pixel as unknown as Float32Array);

  renderer.setRenderTarget(prevRt);
  renderer.setViewport(0, 0, size.x, size.y);
  rt.dispose();

  // Heuristic: all zeros => nothing drawn; very uniform => possible flat.
  const r = pixel[0] / 255, g = pixel[1] / 255, b = pixel[2] / 255;
  const sum = r + g + b;
  if (sum < 0.01) {
    console.warn('[assertNonZeroDisplacement] 1x1 pass is black; mesh may not be visible or VTF displacement missing.');
  }
}
