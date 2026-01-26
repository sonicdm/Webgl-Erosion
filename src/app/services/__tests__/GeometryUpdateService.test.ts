import { GeometryUpdateService } from '../GeometryUpdateService';

describe('GeometryUpdateService', () => {
  let geometryUpdateService: GeometryUpdateService;

  beforeEach(() => {
    geometryUpdateService = new GeometryUpdateService();
  });

  describe('geometryUpdateCounter', () => {
    it('should initialize counter to 0', () => {
      expect(geometryUpdateService.getGeometryUpdateCounter()).toBe(0);
    });

    it('should increment counter', () => {
      geometryUpdateService.incrementGeometryUpdateCounter();
      expect(geometryUpdateService.getGeometryUpdateCounter()).toBe(1);
      
      geometryUpdateService.incrementGeometryUpdateCounter();
      expect(geometryUpdateService.getGeometryUpdateCounter()).toBe(2);
    });

    it('should reset counter to 0', () => {
      geometryUpdateService.incrementGeometryUpdateCounter();
      geometryUpdateService.incrementGeometryUpdateCounter();
      expect(geometryUpdateService.getGeometryUpdateCounter()).toBe(2);
      
      geometryUpdateService.resetGeometryUpdateCounter();
      expect(geometryUpdateService.getGeometryUpdateCounter()).toBe(0);
    });
  });

  describe('geometryNeedsUpdate', () => {
    it('should initialize to false', () => {
      expect(geometryUpdateService.getGeometryNeedsUpdate()).toBe(false);
    });

    it('should allow setting needs update flag', () => {
      geometryUpdateService.setGeometryNeedsUpdate(true);
      expect(geometryUpdateService.getGeometryNeedsUpdate()).toBe(true);
      
      geometryUpdateService.setGeometryNeedsUpdate(false);
      expect(geometryUpdateService.getGeometryNeedsUpdate()).toBe(false);
    });
  });

  describe('geometryUpdateInterval', () => {
    it('should initialize to 2000', () => {
      expect(geometryUpdateService.getGeometryUpdateInterval()).toBe(2000);
    });

    it('should allow setting interval', () => {
      geometryUpdateService.setGeometryUpdateInterval(1000);
      expect(geometryUpdateService.getGeometryUpdateInterval()).toBe(1000);
    });

    it('should enforce minimum interval of 1', () => {
      geometryUpdateService.setGeometryUpdateInterval(0);
      expect(geometryUpdateService.getGeometryUpdateInterval()).toBe(1);
      
      geometryUpdateService.setGeometryUpdateInterval(-5);
      expect(geometryUpdateService.getGeometryUpdateInterval()).toBe(1);
    });
  });

  describe('enableBVHUpdates', () => {
    it('should initialize to true', () => {
      expect(geometryUpdateService.getEnableBVHUpdates()).toBe(true);
    });

    it('should allow setting enable flag', () => {
      geometryUpdateService.setEnableBVHUpdates(false);
      expect(geometryUpdateService.getEnableBVHUpdates()).toBe(false);
      
      geometryUpdateService.setEnableBVHUpdates(true);
      expect(geometryUpdateService.getEnableBVHUpdates()).toBe(true);
    });
  });

  describe('shouldUpdateGeometry', () => {
    it('should return false when BVH updates are disabled', () => {
      geometryUpdateService.setEnableBVHUpdates(false);
      geometryUpdateService.setGeometryNeedsUpdate(true);
      
      expect(geometryUpdateService.shouldUpdateGeometry()).toBe(false);
    });

    it('should return true when geometry needs update and BVH updates are enabled', () => {
      geometryUpdateService.setEnableBVHUpdates(true);
      geometryUpdateService.setGeometryNeedsUpdate(true);
      
      expect(geometryUpdateService.shouldUpdateGeometry()).toBe(true);
    });

    it('should return true when counter reaches interval and BVH updates are enabled', () => {
      geometryUpdateService.setEnableBVHUpdates(true);
      geometryUpdateService.setGeometryNeedsUpdate(false);
      geometryUpdateService.setGeometryUpdateInterval(5);
      
      for (let i = 0; i < 4; i++) {
        geometryUpdateService.incrementGeometryUpdateCounter();
      }
      expect(geometryUpdateService.shouldUpdateGeometry()).toBe(false); // counter = 4
      
      geometryUpdateService.incrementGeometryUpdateCounter();
      expect(geometryUpdateService.shouldUpdateGeometry()).toBe(true); // counter = 5
    });

    it('should return false when neither condition is met', () => {
      geometryUpdateService.setEnableBVHUpdates(true);
      geometryUpdateService.setGeometryNeedsUpdate(false);
      geometryUpdateService.setGeometryUpdateInterval(10);
      
      for (let i = 0; i < 5; i++) {
        geometryUpdateService.incrementGeometryUpdateCounter();
      }
      expect(geometryUpdateService.shouldUpdateGeometry()).toBe(false); // counter = 5, interval = 10
    });
  });
});
