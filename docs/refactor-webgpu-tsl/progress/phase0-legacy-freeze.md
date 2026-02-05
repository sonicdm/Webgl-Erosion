# Phase 0 — Legacy Freeze

## Status: Complete

## Goals
- Create a legacy branch (legacy-webgl).
- Tag a stable build.
- Lock legacy branch for hotfix-only.

## Tasks
- [x] Create legacy branch from current known-good state.
- [x] Tag release (v1.0.0-legacy).
- [x] Document legacy maintenance rules.

## Git Procedures
1) Create legacy branch from master:
   ```powershell
   git checkout master
   git pull
   git checkout -b legacy-webgl
   ```
2) Tag the baseline:
   ```powershell
   git tag v1.0.0-legacy
   git push origin legacy-webgl --tags
   ```
3) Record policy in `LEGACY_MAINTENANCE.md`.

## Completion Notes
- **Branch Created**: `legacy-webgl` (from master branch)
- **Tag Created**: `v1.0.0-legacy`
- **Documentation**: `LEGACY_MAINTENANCE.md` created with hotfix-only policy
- **Date**: January 26, 2026
- Legacy branch contains complete WebGL/GLSL pipeline and has been pushed to remote.

## Notes
- Legacy branch should retain GLSL/WebGL pipeline and shaders.

## Verification
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `npx tsc -p tsconfig.json --noEmit` (TS/TSX typecheck)
- [ ] MCP browser test (launch + screenshot baseline)
- Branch is frozen for hotfix-only maintenance (security fixes and critical bugs only).
- See `LEGACY_MAINTENANCE.md` for detailed maintenance policy.
