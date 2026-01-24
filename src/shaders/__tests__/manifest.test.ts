import { ShaderManifest, ShaderConfig, ShaderId, shaderManifest } from '../manifest';

describe('ShaderManifest', () => {
  describe('getShaderSource', () => {
    it('should return shader sources for valid shader IDs', () => {
      const rainShader = shaderManifest.getShaderSource('rain');
      expect(rainShader.vert).toBeDefined();
      expect(rainShader.frag).toBeDefined();
      expect(typeof rainShader.vert).toBe('string');
      expect(typeof rainShader.frag).toBe('string');
    });

    it('should return only fragment shader when vertex shader is not defined', () => {
      const terrainFragShader = shaderManifest.getShaderSource('terrainFrag');
      expect(terrainFragShader.vert).toBeUndefined();
      expect(terrainFragShader.frag).toBeDefined();
      expect(typeof terrainFragShader.frag).toBe('string');
    });

    it('should return only vertex shader when fragment shader is not defined', () => {
      const terrainVertShader = shaderManifest.getShaderSource('terrainVert');
      expect(terrainVertShader.vert).toBeDefined();
      expect(terrainVertShader.frag).toBeUndefined();
      expect(typeof terrainVertShader.vert).toBe('string');
    });

    it('should throw error for invalid shader ID', () => {
      expect(() => {
        shaderManifest.getShaderSource('invalidShaderId' as ShaderId);
      }).toThrow('Shader not found: invalidShaderId');
    });
  });

  describe('getShaderConfig', () => {
    it('should return shader configuration for valid shader IDs', () => {
      const config = shaderManifest.getShaderConfig('rain');
      expect(config).toBeDefined();
      expect(config?.name).toBe('rain');
      expect(config?.domain).toBe('water');
      expect(config?.fragPath).toBe('shaders/water/rain-frag.glsl');
    });

    it('should return undefined for invalid shader ID', () => {
      const config = shaderManifest.getShaderConfig('invalidShaderId' as ShaderId);
      expect(config).toBeUndefined();
    });
  });

  describe('getShadersByDomain', () => {
    it('should return all shaders for water domain', () => {
      const waterShaders = shaderManifest.getShadersByDomain('water');
      expect(waterShaders.length).toBeGreaterThan(0);
      expect(waterShaders.every(s => s.domain === 'water')).toBe(true);
    });

    it('should return all shaders for sediment domain', () => {
      const sedimentShaders = shaderManifest.getShadersByDomain('sediment');
      expect(sedimentShaders.length).toBeGreaterThan(0);
      expect(sedimentShaders.every(s => s.domain === 'sediment')).toBe(true);
    });

    it('should return all shaders for thermal domain', () => {
      const thermalShaders = shaderManifest.getShadersByDomain('thermal');
      expect(thermalShaders.length).toBeGreaterThan(0);
      expect(thermalShaders.every(s => s.domain === 'thermal')).toBe(true);
    });

    it('should return all shaders for lava domain', () => {
      const lavaShaders = shaderManifest.getShadersByDomain('lava');
      expect(lavaShaders.length).toBeGreaterThan(0);
      expect(lavaShaders.every(s => s.domain === 'lava')).toBe(true);
    });

    it('should return all shaders for terrain domain', () => {
      const terrainShaders = shaderManifest.getShadersByDomain('terrain');
      expect(terrainShaders.length).toBeGreaterThan(0);
      expect(terrainShaders.every(s => s.domain === 'terrain')).toBe(true);
    });

    it('should return all shaders for common domain', () => {
      const commonShaders = shaderManifest.getShadersByDomain('common');
      expect(commonShaders.length).toBeGreaterThan(0);
      expect(commonShaders.every(s => s.domain === 'common')).toBe(true);
    });
  });

  describe('validateUniforms', () => {
    it('should return empty array when all required uniforms are provided', () => {
      const missing = shaderManifest.validateUniforms('rain', [
        'u_time',
        'u_SimRes',
        'u_BrushPos',
        'u_RainDegree',
      ]);
      expect(missing).toEqual([]);
    });

    it('should return missing uniforms when some are not provided', () => {
      const missing = shaderManifest.validateUniforms('rain', ['u_time', 'u_SimRes']);
      expect(missing).toContain('u_BrushPos');
      expect(missing).toContain('u_RainDegree');
    });

    it('should return empty array when shader has no required uniforms', () => {
      const missing = shaderManifest.validateUniforms('clean', []);
      expect(missing).toEqual([]);
    });

    it('should return empty array for invalid shader ID', () => {
      const missing = shaderManifest.validateUniforms('invalidShaderId' as ShaderId, []);
      expect(missing).toEqual([]);
    });
  });

  describe('shader registration', () => {
    it('should have all expected shader IDs registered', () => {
      const expectedShaderIds: ShaderId[] = [
        'rain',
        'flow',
        'waterHeight',
        'evaporation',
        'waterVert',
        'waterFrag',
        'sediment',
        'sedimentAdvect',
        'maccormack',
        'average',
        'maxSlippageHeight',
        'thermalFlux',
        'thermalApply',
        'lavaFlow',
        'lavaUpdate',
        'lavaTerrain',
        'initial',
        'terrainProceduralFrag',
        'terrainProceduralVert',
        'terrainFrag',
        'terrainVert',
        'shadowmapFrag',
        'shadowmapVert',
        'quadVert',
        'clean',
        'flatFrag',
        'flatVert',
        'velocityAdvect',
        'combine',
        'sceneDepth',
        'bilateralBlur',
      ];

      for (const shaderId of expectedShaderIds) {
        const config = shaderManifest.getShaderConfig(shaderId);
        expect(config).toBeDefined();
        expect(config?.name).toBe(shaderId);
      }
    });

    it('should have valid paths for all shaders', () => {
      const allShaders = shaderManifest.getShadersByDomain('water')
        .concat(shaderManifest.getShadersByDomain('sediment'))
        .concat(shaderManifest.getShadersByDomain('thermal'))
        .concat(shaderManifest.getShadersByDomain('lava'))
        .concat(shaderManifest.getShadersByDomain('terrain'))
        .concat(shaderManifest.getShadersByDomain('common'));

      for (const shader of allShaders) {
        if (shader.vertPath) {
          expect(shader.vertPath).toMatch(/^shaders\/[a-z]+\/[a-z-]+\.glsl$/);
        }
        if (shader.fragPath) {
          expect(shader.fragPath).toMatch(/^shaders\/[a-z]+\/[a-z-]+\.glsl$/);
        }
        expect(shader.vertPath || shader.fragPath).toBeDefined();
      }
    });

    it('should have kebab-case file names in paths', () => {
      const allShaders = shaderManifest.getShadersByDomain('water')
        .concat(shaderManifest.getShadersByDomain('sediment'))
        .concat(shaderManifest.getShadersByDomain('thermal'))
        .concat(shaderManifest.getShadersByDomain('lava'))
        .concat(shaderManifest.getShadersByDomain('terrain'))
        .concat(shaderManifest.getShadersByDomain('common'));

      for (const shader of allShaders) {
        if (shader.vertPath) {
          const fileName = shader.vertPath.split('/').pop() || '';
          expect(fileName).toMatch(/^[a-z-]+\.glsl$/);
        }
        if (shader.fragPath) {
          const fileName = shader.fragPath.split('/').pop() || '';
          expect(fileName).toMatch(/^[a-z-]+\.glsl$/);
        }
      }
    });
  });
});
