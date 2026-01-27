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

Recommended artifacts:
- Screenshot set per phase milestone.
- Minimal click-through script description stored alongside results.
