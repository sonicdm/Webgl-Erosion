/** Jest mock for three/webgpu - avoids loading ESM from node_modules/three */

function WebGPURenderer(_options) {
    this.init = jest.fn().mockResolvedValue(undefined);
    this.dispose = jest.fn();
    this.setClearColor = jest.fn();
    this.setSize = jest.fn();
    this.clear = jest.fn();
    this.render = jest.fn();
}

class NodeMaterial {
    constructor() {
        this.colorNode = null;
    }
}

class MeshBasicNodeMaterial extends NodeMaterial {}

module.exports = {
    WebGPURenderer,
    NodeMaterial,
    MeshBasicNodeMaterial,
    TSL: {},
};
