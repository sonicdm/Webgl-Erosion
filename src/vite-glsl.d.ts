// Type declarations for Vite's ?raw import suffix
// This allows TypeScript to recognize .glsl?raw imports used by Vite
declare module '*.glsl?raw' {
    const content: string;
    export default content;
}

declare module '*.vert?raw' {
    const content: string;
    export default content;
}

declare module '*.frag?raw' {
    const content: string;
    export default content;
}

