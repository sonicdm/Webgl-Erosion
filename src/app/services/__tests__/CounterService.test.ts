import { CounterService } from '../CounterService';

describe('CounterService', () => {
  let counterService: CounterService;

  beforeEach(() => {
    counterService = new CounterService();
  });

  describe('heightMapBufCounter', () => {
    it('should initialize counter to 0', () => {
      expect(counterService.getHeightMapBufCounter()).toBe(0);
    });

    it('should increment counter', () => {
      counterService.incrementHeightMapBufCounter();
      expect(counterService.getHeightMapBufCounter()).toBe(1);
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.getHeightMapBufCounter()).toBe(2);
    });

    it('should reset counter to 0', () => {
      counterService.incrementHeightMapBufCounter();
      counterService.incrementHeightMapBufCounter();
      expect(counterService.getHeightMapBufCounter()).toBe(2);
      
      counterService.resetHeightMapBufCounter();
      expect(counterService.getHeightMapBufCounter()).toBe(0);
    });

    it('should return max counter threshold', () => {
      expect(counterService.getMaxHeightMapBufCounter()).toBe(200);
    });
  });

  describe('shouldReadHeightmap', () => {
    it('should return true when brush is pressed and counter is at interval', () => {
      const simres = 1024;
      // At interval 2, should read at counter 0, 2, 4, etc.
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(true); // counter = 0
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(false); // counter = 1
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(true); // counter = 2
    });

    it('should return true when brush is visible and counter is at interval', () => {
      const simres = 1024;
      // At interval 4, should read at counter 0, 4, 8, etc.
      expect(counterService.shouldReadHeightmap(false, true, simres)).toBe(true); // counter = 0
      
      for (let i = 0; i < 3; i++) {
        counterService.incrementHeightMapBufCounter();
      }
      expect(counterService.shouldReadHeightmap(false, true, simres)).toBe(false); // counter = 3
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.shouldReadHeightmap(false, true, simres)).toBe(true); // counter = 4
    });

    it('should return true when counter reaches max threshold', () => {
      const simres = 1024;
      // When brush is not pressed or visible, should read at max threshold (200)
      for (let i = 0; i < 199; i++) {
        counterService.incrementHeightMapBufCounter();
      }
      expect(counterService.shouldReadHeightmap(false, false, simres)).toBe(false); // counter = 199
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.shouldReadHeightmap(false, false, simres)).toBe(true); // counter = 200
    });

    it('should scale intervals based on resolution', () => {
      // 2048x2048 = 4x base resolution, so intervals should be 4x
      const simres = 2048;
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(true); // counter = 0
      
      // Should read every 8 frames (2 * 4) instead of every 2
      for (let i = 0; i < 7; i++) {
        counterService.incrementHeightMapBufCounter();
      }
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(false); // counter = 7
      
      counterService.incrementHeightMapBufCounter();
      expect(counterService.shouldReadHeightmap(true, false, simres)).toBe(true); // counter = 8
    });
  });
});
