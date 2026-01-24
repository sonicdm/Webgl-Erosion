/**
 * Jest transformer for GLSL shader files
 * Handles .glsl?raw imports by reading the file and returning the source as a string
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  process(src, filename) {
    // Remove ?raw suffix if present
    const actualPath = filename.replace(/\?raw$/, '');
    
    // Read the GLSL file
    const glslSource = fs.readFileSync(actualPath, 'utf8');
    
    // Return as a module that exports the source as default
    return {
      code: `module.exports = ${JSON.stringify(glslSource)};`,
    };
  },
};
