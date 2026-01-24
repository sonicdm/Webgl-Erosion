import { PassRegistry, PassConfig } from '../PassRegistry';

describe('PassRegistry', () => {
  let registry: PassRegistry;

  beforeEach(() => {
    registry = new PassRegistry();
  });

  describe('registerPass', () => {
    it('should register a pass configuration', () => {
      const config: PassConfig = {
        name: 'rain',
        shaderPath: 'shaders/water/rain-frag.glsl',
        uniforms: ['u_time', 'u_rainRate'],
        domain: 'water',
      };

      registry.registerPass(config);

      const retrieved = registry.getPass('rain');
      expect(retrieved).toEqual(config);
    });

    it('should overwrite existing pass with same name', () => {
      const config1: PassConfig = {
        name: 'flow',
        shaderPath: 'shaders/water/flow-frag.glsl',
        uniforms: ['u_time'],
        domain: 'water',
      };

      const config2: PassConfig = {
        name: 'flow',
        shaderPath: 'shaders/water/flow-v2-frag.glsl',
        uniforms: ['u_time', 'u_velocity'],
        domain: 'water',
      };

      registry.registerPass(config1);
      registry.registerPass(config2);

      const retrieved = registry.getPass('flow');
      expect(retrieved).toEqual(config2);
      expect(retrieved?.shaderPath).toBe('shaders/water/flow-v2-frag.glsl');
    });
  });

  describe('getPass', () => {
    it('should return undefined for non-existent pass', () => {
      expect(registry.getPass('nonexistent')).toBeUndefined();
    });

    it('should return registered pass by name', () => {
      const config: PassConfig = {
        name: 'sediment',
        shaderPath: 'shaders/sediment/sediment-frag.glsl',
        uniforms: ['u_sedimentRate'],
        domain: 'sediment',
      };

      registry.registerPass(config);
      const retrieved = registry.getPass('sediment');
      expect(retrieved).toEqual(config);
    });
  });

  describe('getAllPasses', () => {
    it('should return empty array when no passes registered', () => {
      expect(registry.getAllPasses()).toEqual([]);
    });

    it('should return all registered passes', () => {
      const configs: PassConfig[] = [
        {
          name: 'rain',
          shaderPath: 'shaders/water/rain-frag.glsl',
          uniforms: ['u_time'],
          domain: 'water',
        },
        {
          name: 'flow',
          shaderPath: 'shaders/water/flow-frag.glsl',
          uniforms: ['u_velocity'],
          domain: 'water',
        },
        {
          name: 'sediment',
          shaderPath: 'shaders/sediment/sediment-frag.glsl',
          uniforms: ['u_sedimentRate'],
          domain: 'sediment',
        },
      ];

      configs.forEach(config => registry.registerPass(config));

      const allPasses = registry.getAllPasses();
      expect(allPasses).toHaveLength(3);
      expect(allPasses).toEqual(expect.arrayContaining(configs));
    });
  });

  describe('getPassesByDomain', () => {
    it('should return empty array when no passes in domain', () => {
      expect(registry.getPassesByDomain('water')).toEqual([]);
    });

    it('should return only passes in specified domain', () => {
      const waterConfigs: PassConfig[] = [
        {
          name: 'rain',
          shaderPath: 'shaders/water/rain-frag.glsl',
          uniforms: ['u_time'],
          domain: 'water',
        },
        {
          name: 'flow',
          shaderPath: 'shaders/water/flow-frag.glsl',
          uniforms: ['u_velocity'],
          domain: 'water',
        },
      ];

      const sedimentConfig: PassConfig = {
        name: 'sediment',
        shaderPath: 'shaders/sediment/sediment-frag.glsl',
        uniforms: ['u_sedimentRate'],
        domain: 'sediment',
      };

      const thermalConfig: PassConfig = {
        name: 'thermal-flux',
        shaderPath: 'shaders/thermal/thermal-flux-frag.glsl',
        uniforms: ['u_temperature'],
        domain: 'thermal',
      };

      registry.registerPass(waterConfigs[0]);
      registry.registerPass(waterConfigs[1]);
      registry.registerPass(sedimentConfig);
      registry.registerPass(thermalConfig);

      const waterPasses = registry.getPassesByDomain('water');
      expect(waterPasses).toHaveLength(2);
      expect(waterPasses).toEqual(expect.arrayContaining(waterConfigs));

      const sedimentPasses = registry.getPassesByDomain('sediment');
      expect(sedimentPasses).toHaveLength(1);
      expect(sedimentPasses[0]).toEqual(sedimentConfig);

      const thermalPasses = registry.getPassesByDomain('thermal');
      expect(thermalPasses).toHaveLength(1);
      expect(thermalPasses[0]).toEqual(thermalConfig);
    });

    it('should handle all domain types', () => {
      const domains: PassConfig['domain'][] = ['water', 'sediment', 'thermal', 'lava', 'post', 'terrain'];

      domains.forEach((domain, index) => {
        registry.registerPass({
          name: `test-${domain}`,
          shaderPath: `shaders/${domain}/test.glsl`,
          uniforms: [],
          domain,
        });
      });

      domains.forEach(domain => {
        const passes = registry.getPassesByDomain(domain);
        expect(passes).toHaveLength(1);
        expect(passes[0].domain).toBe(domain);
      });
    });
  });

  describe('validatePass', () => {
    it('should return empty array for non-existent pass', () => {
      const missing = registry.validatePass('nonexistent', ['u_time']);
      expect(missing).toEqual([]);
    });

    it('should return empty array when all uniforms are provided', () => {
      const config: PassConfig = {
        name: 'rain',
        shaderPath: 'shaders/water/rain-frag.glsl',
        uniforms: ['u_time', 'u_rainRate', 'u_resolution'],
        domain: 'water',
      };

      registry.registerPass(config);

      const missing = registry.validatePass('rain', ['u_time', 'u_rainRate', 'u_resolution']);
      expect(missing).toEqual([]);
    });

    it('should return missing uniforms when some are not provided', () => {
      const config: PassConfig = {
        name: 'flow',
        shaderPath: 'shaders/water/flow-frag.glsl',
        uniforms: ['u_time', 'u_velocity', 'u_resolution'],
        domain: 'water',
      };

      registry.registerPass(config);

      const missing = registry.validatePass('flow', ['u_time']);
      expect(missing).toEqual(['u_velocity', 'u_resolution']);
    });

    it('should return all uniforms when none are provided', () => {
      const config: PassConfig = {
        name: 'sediment',
        shaderPath: 'shaders/sediment/sediment-frag.glsl',
        uniforms: ['u_sedimentRate', 'u_depositionRate'],
        domain: 'sediment',
      };

      registry.registerPass(config);

      const missing = registry.validatePass('sediment', []);
      expect(missing).toEqual(['u_sedimentRate', 'u_depositionRate']);
    });

    it('should handle extra uniforms that are not required', () => {
      const config: PassConfig = {
        name: 'thermal',
        shaderPath: 'shaders/thermal/thermal-frag.glsl',
        uniforms: ['u_temperature'],
        domain: 'thermal',
      };

      registry.registerPass(config);

      const missing = registry.validatePass('thermal', ['u_temperature', 'u_extraUniform']);
      expect(missing).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all registered passes', () => {
      registry.registerPass({
        name: 'rain',
        shaderPath: 'shaders/water/rain-frag.glsl',
        uniforms: ['u_time'],
        domain: 'water',
      });

      registry.registerPass({
        name: 'flow',
        shaderPath: 'shaders/water/flow-frag.glsl',
        uniforms: ['u_velocity'],
        domain: 'water',
      });

      expect(registry.getAllPasses()).toHaveLength(2);

      registry.clear();

      expect(registry.getAllPasses()).toEqual([]);
      expect(registry.getPass('rain')).toBeUndefined();
      expect(registry.getPass('flow')).toBeUndefined();
    });

    it('should not throw when clearing empty registry', () => {
      expect(() => {
        registry.clear();
      }).not.toThrow();
    });
  });
});
