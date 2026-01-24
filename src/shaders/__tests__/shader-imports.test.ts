import { shaderManifest, ShaderId } from '../manifest';

/**
 * Integration tests for shader imports
 * Verifies that all shader files can be imported successfully and paths resolve correctly
 */
describe('Shader Imports Integration', () => {
  describe('All shader sources resolve', () => {
    const allShaderIds: ShaderId[] = [
      // Water domain
      'rain',
      'flow',
      'waterHeight',
      'evaporation',
      'waterVert',
      'waterFrag',
      // Sediment domain
      'sediment',
      'sedimentAdvect',
      'maccormack',
      'average',
      // Thermal domain
      'maxSlippageHeight',
      'thermalFlux',
      'thermalApply',
      // Lava domain
      'lavaFlow',
      'lavaUpdate',
      'lavaTerrain',
      // Terrain domain
      'initial',
      'terrainProceduralFrag',
      'terrainProceduralVert',
      'terrainFrag',
      'terrainVert',
      'shadowmapFrag',
      'shadowmapVert',
      // Common domain
      'quadVert',
      'clean',
      'flatFrag',
      'flatVert',
      'velocityAdvect',
      'combine',
      'sceneDepth',
      'bilateralBlur',
    ];

    it('should successfully load all shader sources', () => {
      for (const shaderId of allShaderIds) {
        expect(() => {
          const shader = shaderManifest.getShaderSource(shaderId);
          // Verify that at least one shader (vert or frag) is defined
          expect(shader.vert || shader.frag).toBeDefined();
          // Verify that if defined, it's a non-empty string
          if (shader.vert) {
            expect(typeof shader.vert).toBe('string');
            expect(shader.vert.length).toBeGreaterThan(0);
          }
          if (shader.frag) {
            expect(typeof shader.frag).toBe('string');
            expect(shader.frag.length).toBeGreaterThan(0);
          }
        }).not.toThrow();
      }
    });

    it('should have valid GLSL syntax in all shader sources', () => {
      for (const shaderId of allShaderIds) {
        const shader = shaderManifest.getShaderSource(shaderId);
        
        if (shader.vert) {
          // Basic GLSL syntax checks - should have version or main function
          expect(shader.vert.length).toBeGreaterThan(0);
          expect(shader.vert).toMatch(/(#version|void main|precision)/);
        }
        
        if (shader.frag) {
          // Basic GLSL syntax checks - should have version or main function
          expect(shader.frag.length).toBeGreaterThan(0);
          expect(shader.frag).toMatch(/(#version|void main|precision)/);
        }
      }
    });

    it('should have correct paths in manifest configurations', () => {
      for (const shaderId of allShaderIds) {
        const config = shaderManifest.getShaderConfig(shaderId);
        expect(config).toBeDefined();
        
        if (config?.vertPath) {
          // Verify path format: shaders/domain/filename.glsl
          expect(config.vertPath).toMatch(/^shaders\/[a-z]+\/[a-z-]+\.glsl$/);
        }
        
        if (config?.fragPath) {
          // Verify path format: shaders/domain/filename.glsl
          expect(config.fragPath).toMatch(/^shaders\/[a-z]+\/[a-z-]+\.glsl$/);
        }
      }
    });

    it('should have kebab-case file names in all paths', () => {
      for (const shaderId of allShaderIds) {
        const config = shaderManifest.getShaderConfig(shaderId);
        expect(config).toBeDefined();
        
        if (config?.vertPath) {
          const fileName = config.vertPath.split('/').pop() || '';
          // Should be kebab-case: lowercase letters and hyphens only
          expect(fileName).toMatch(/^[a-z-]+\.glsl$/);
          // Should not contain uppercase letters
          expect(fileName).not.toMatch(/[A-Z]/);
        }
        
        if (config?.fragPath) {
          const fileName = config.fragPath.split('/').pop() || '';
          // Should be kebab-case: lowercase letters and hyphens only
          expect(fileName).toMatch(/^[a-z-]+\.glsl$/);
          // Should not contain uppercase letters
          expect(fileName).not.toMatch(/[A-Z]/);
        }
      }
    });
  });

  describe('Domain organization', () => {
    it('should have shaders organized in correct domain folders', () => {
      const waterShaders = shaderManifest.getShadersByDomain('water');
      const sedimentShaders = shaderManifest.getShadersByDomain('sediment');
      const thermalShaders = shaderManifest.getShadersByDomain('thermal');
      const lavaShaders = shaderManifest.getShadersByDomain('lava');
      const terrainShaders = shaderManifest.getShadersByDomain('terrain');
      const commonShaders = shaderManifest.getShadersByDomain('common');

      // Verify each domain has shaders
      expect(waterShaders.length).toBeGreaterThan(0);
      expect(sedimentShaders.length).toBeGreaterThan(0);
      expect(thermalShaders.length).toBeGreaterThan(0);
      expect(lavaShaders.length).toBeGreaterThan(0);
      expect(terrainShaders.length).toBeGreaterThan(0);
      expect(commonShaders.length).toBeGreaterThan(0);

      // Verify all paths match domain (vertex shaders can be from common for GPGPU passes)
      waterShaders.forEach(shader => {
        if (shader.vertPath) {
          // Water shaders can use common quad-vert for GPGPU passes
          expect(shader.vertPath).toMatch(/^shaders\/(water|common)\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/water\//);
        }
      });

      sedimentShaders.forEach(shader => {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/(sediment|common)\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/sediment\//);
        }
      });

      thermalShaders.forEach(shader => {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/(thermal|common)\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/thermal\//);
        }
      });

      lavaShaders.forEach(shader => {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/(lava|common)\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/lava\//);
        }
      });

      terrainShaders.forEach(shader => {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/(terrain|common)\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/terrain\//);
        }
      });

      commonShaders.forEach(shader => {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/common\//);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/common\//);
        }
      });
    });
  });

  describe('No broken imports', () => {
    it('should not throw errors when accessing shader sources', () => {
      const allShaderIds: ShaderId[] = [
        'rain', 'flow', 'waterHeight', 'evaporation', 'waterVert', 'waterFrag',
        'sediment', 'sedimentAdvect', 'maccormack', 'average',
        'maxSlippageHeight', 'thermalFlux', 'thermalApply',
        'lavaFlow', 'lavaUpdate', 'lavaTerrain',
        'initial', 'terrainProceduralFrag', 'terrainProceduralVert', 'terrainFrag', 'terrainVert', 'shadowmapFrag', 'shadowmapVert',
        'quadVert', 'clean', 'flatFrag', 'flatVert', 'velocityAdvect', 'combine', 'sceneDepth', 'bilateralBlur',
      ];

      for (const shaderId of allShaderIds) {
        expect(() => {
          shaderManifest.getShaderSource(shaderId);
        }).not.toThrow();
      }
    });

    it('should return non-empty shader sources', () => {
      const allShaderIds: ShaderId[] = [
        'rain', 'flow', 'waterHeight', 'evaporation',
        'sediment', 'sedimentAdvect', 'maccormack', 'average',
        'maxSlippageHeight', 'thermalFlux', 'thermalApply',
        'lavaFlow', 'lavaUpdate', 'lavaTerrain',
        'initial', 'clean', 'velocityAdvect', 'combine',
      ];

      for (const shaderId of allShaderIds) {
        const shader = shaderManifest.getShaderSource(shaderId);
        // All these shaders should have fragment shaders
        expect(shader.frag).toBeDefined();
        expect(shader.frag).not.toBe('');
        expect(shader.frag?.length).toBeGreaterThan(0);
      }
    });
  });
});
