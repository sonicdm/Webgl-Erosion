import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  root: './',
  base: '',
  build: {
    outDir: './dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: './index.html',
      output: {
        manualChunks: (id) => {
          // Split Three.js into its own chunk
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          // Split gl-matrix into its own chunk
          if (id.includes('node_modules/gl-matrix')) {
            return 'vendor-gl-matrix';
          }
          // Split UI libraries (dat-gui, stats-js) into their own chunk
          if (id.includes('node_modules/dat-gui') || id.includes('node_modules/stats-js')) {
            return 'vendor-ui';
          }
          // Split other small vendor libraries
          if (id.includes('node_modules/mouse-change')) {
            return 'vendor-utils';
          }
          // Split all other node_modules into a vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  plugins: [
    glsl({
      include: ['**/*.glsl'],
      exclude: undefined,
      warnDuplicatedImports: true,
      defaultExtension: 'glsl',
      compress: false,
      watch: true,
      root: '/',
    }),
  ],
  server: {
    port: 8080,
    open: true,
  },
});

