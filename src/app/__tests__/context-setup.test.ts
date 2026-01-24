import { createAppContextSetup } from '../context';
import { AppContext } from '../bootstrap';

jest.mock('../../simulation/texture-management', () => ({
  resizeScreenTextures: jest.fn(),
}));

describe('createAppContextSetup (Workstream A)', () => {
  const resizeScreenTextures = require('../../simulation/texture-management')
    .resizeScreenTextures as jest.Mock;

  let canvas: HTMLCanvasElement;
  let glMock: WebGL2RenderingContext;
  let appContext: AppContext;
  let cameraMock: any;
  let clientStateMock: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    Object.defineProperty(canvas, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 360, configurable: true });
    (canvas as any).getContext = () => glMock;
    document.body.appendChild(canvas);

    glMock = {
      getSupportedExtensions: () => ['EXT_color_buffer_float'],
      getExtension: () => ({}),
    } as unknown as WebGL2RenderingContext;

    cameraMock = {
      setAspectRatio: jest.fn(),
      updateProjectionMatrix: jest.fn(),
    };

    clientStateMock = {
      setClientDimensions: jest.fn(),
    };

    appContext = {
      clientState: clientStateMock,
      cameraService: { getCamera: () => cameraMock },
    } as unknown as AppContext;
  });

  it('sets up canvas/gl, records dimensions, and wires resize handler', () => {
    const setup = createAppContextSetup(appContext);

    expect(setup.canvas).toBe(canvas);
    expect(setup.glContext).toBe(glMock);
    expect(clientStateMock.setClientDimensions).toHaveBeenCalledWith(640, 360);

    // Trigger resize
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(resizeScreenTextures).toHaveBeenCalled();
    expect(clientStateMock.setClientDimensions).toHaveBeenCalledWith(800, 600);
    expect(cameraMock.setAspectRatio).toHaveBeenCalledWith(800 / 600);
    expect(cameraMock.updateProjectionMatrix).toHaveBeenCalled();

    // Cleanup removes listener
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    setup.cleanup();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function), false);
  });
});
