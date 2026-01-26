import { AppContext } from './bootstrap';

/**
 * Application context for canvas and WebGL setup
 */
export interface AppContextSetup {
  canvas: HTMLCanvasElement;
  glContext: WebGL2RenderingContext;
  cleanup: () => void;
}

/**
 * Creates and sets up the application context (canvas, WebGL, resize handling)
 * 
 * @param appContext - The application context from bootstrap
 * @returns Setup object with canvas, glContext, and cleanup function
 */
export function createAppContextSetup(appContext: AppContext): AppContextSetup {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  const glContext = canvas.getContext('webgl2') as WebGL2RenderingContext;
  if (!glContext) {
    throw new Error('WebGL 2 not supported!');
  }

  // Validate WebGL extensions
  validateWebGLExtensions(glContext);

  // Set initial client dimensions
  appContext.clientState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);

  // Set up resize handler
  const resizeHandler = () => {
    appContext.legacyTexturePool?.resizeScreenTextures();
    
    // Update client state
    appContext.clientState.setClientDimensions(canvas.clientWidth, canvas.clientHeight);
    
    // Update camera if available
    const camera = appContext.cameraService.getCamera();
    if (camera) {
      const aspectRatio = canvas.clientWidth / canvas.clientHeight;
      camera.setAspectRatio(aspectRatio);
      camera.updateProjectionMatrix();
    }
  };

  window.addEventListener('resize', resizeHandler, false);

  // Cleanup function
  const cleanup = () => {
    window.removeEventListener('resize', resizeHandler, false);
  };

  return {
    canvas,
    glContext,
    cleanup,
  };
}

/**
 * Validates required WebGL extensions and logs warnings for missing ones
 */
function validateWebGLExtensions(glContext: WebGL2RenderingContext): void {
  const extensions = glContext.getSupportedExtensions();
  if (extensions) {
    for (const ext of extensions) {
      console.log(ext);
    }
  }

  if (!glContext.getExtension('OES_texture_float_linear')) {
    console.log('float texture not supported');
  }

  if (!glContext.getExtension('OES_texture_float')) {
    console.log('no float texture!!!?? y am i here?');
  }

  if (!glContext.getExtension('EXT_color_buffer_float')) {
    console.log('cant render to float texture');
  }
}
