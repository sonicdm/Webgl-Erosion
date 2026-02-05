# Phase 7 — Cleanup + Docs

## Status: Pending

## Goals
- Remove old WebGL/VTF docs from master.
- Document WebGPU + TSL pipeline.
- Update README for new GUI, controls, workflows.

## Tasks
- [ ] Remove legacy WebGL/VTF docs from master branch.
- [ ] Update README with WebGPU/TSL usage.
- [ ] Add migration notes and API changes.
- [ ] Archive replaced GLSL shaders into legacy branch `legacy/shaders/`.

## Git Procedures
1) Work directly on `feature/webgpu-tsl-pipeline` for docs cleanup.
2) Commit doc-only changes separately from code.
3) Tag milestone after docs are finalized.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (doc-linked flows)
