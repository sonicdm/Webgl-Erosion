/** Jest mock for three/tsl - avoids loading ESM from node_modules/three */
const chain = () => node;
const node = {
    get x() { return node; },
    get y() { return node; },
    get z() { return node; },
    get w() { return node; },
    get r() { return node; },
    get g() { return node; },
    get b() { return node; },
    get xyz() { return node; },
    div: chain, mul: chain, add: chain, sub: chain,
    lessThanEqual: () => ({ select: (_a, b) => b }),
    equal: () => ({ select: (_a, b) => b }),
    greaterThan: () => ({ select: (_a, b) => b }),
    select: (_a, b) => b,
    copy: () => node,
};
const stub = () => node;
const uniformStub = (v) => ({ ...node, value: v });
module.exports = {
    float: stub,
    vec2: stub,
    vec3: stub,
    vec4: stub,
    texture: stub,
    uv: stub,
    uniform: uniformStub,
    depth: stub,
    clamp: stub,
    mix: stub,
    pow: stub,
    abs: stub,
    length: stub,
    dot: stub,
    normalize: stub,
};
