# Testing Strategy

This plan assumes `npm run test:ci` for automated tests (single-process).

## Required Test Gates

### Unit Tests
- DI smoke test (composition root builds with holders only).
- TerrainUVMapping helper tests.
- Heightmap encode/decode tests.
- BVH refit tile selection tests.

### Integration Tests
- Generate terrain (Hill/HillIsland/PerlinDiamond).
- Resize size/ratio and verify target/mesh sync.
- Toggle turbulent/steps -> height range changes.
- Mask selection changes output.

### Headless/Validation
- validate:height-parity (GPU texture vs debug render output).
- readback health check after generate.
- raycast vs heightmap consistency.

### Performance Checks
- BVH refit latency under brush strokes.
- GPU readback cadence stability.

## CI/Local Commands
- Automated: `npm run test:ci`
- Build: `npm run build`

## Manual Smoke Checklist
- WebGPURenderer bootstraps and renders a simple scene.
- NodeMaterial pipeline runs without errors.
- Terrain generate and GUI controls respond.
- Raycast mesh aligns with rendered terrain.

## MCP Browser Automation

Use MCP browser tools to automate UI validation:
- Launch the app in a browser via MCP.
- Navigate the GUI to trigger terrain generation.
- Capture screenshots for baseline comparisons.
- Verify UI states (status line, error banner, debug overlays).

**WebGPU main view:** The WebGPU render path and pool→Three.js texture copy require a **real browser with WebGPU** (e.g. Chrome with GPU). MCP/Playwright sessions often report "No available adapters" and the app will show the "WebGPU not supported" alert and exit before the main loop. To verify the grey/terrain fix and pool copy, run the app locally in Chrome (or another WebGPU-capable browser) and check the console for:
- `[WebGPU] Pool → Three.js texture copy active, 8 textures` — copy is working.
- `[WebGPU] Pool copy: backend texture not ready for N textures` — normal on first frames until Three.js compile creates textures.

Recommended artifacts:
- Screenshot set per phase milestone.
- Minimal click-through script description stored alongside results.

**MCP verification (Jan 30, 2026):** user-browser-devtools — navigate to http://localhost:8080 (200 OK). In environments without WebGPU adapter, "No available adapters" appears and the app alerts and exits; no main view. For full UI/terrain validation, use a local browser with WebGPU.
