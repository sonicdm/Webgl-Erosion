// Mock performance API if not available
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now(),
  };
}

// Mock three.js for Jest environment
// Note: Full three.js functionality requires a browser/WebGL environment
// These mocks allow basic geometry creation tests to run
jest.mock('three', () => {
  const actualThree = jest.requireActual('three');
  return actualThree;
}, { virtual: false });

