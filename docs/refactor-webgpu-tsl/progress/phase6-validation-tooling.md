# Phase 6 — Validation + Tooling

## Status: Pending

## Goals
- Parity tests and validation scripts for the new pipeline.
- Performance smoke checks.

## Tasks
- [ ] Add DI smoke test (composition root + holders only).
- [ ] Add heightmap upload/readback regression test.
- [ ] Add height parity validator + npm script.
- [ ] Add raycast consistency tests (CPU vs GPU).
- [ ] Add performance smoke checks for BVH refit/readback cadence.

## Tests
- [ ] npm run test:ci passes.
- [ ] validate:height-parity passes.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (validation HUD)
