# Git Strategy

This refactor uses a dedicated pipeline branch with sub-branches for features.
Legacy WebGL stays frozen in a separate branch/release.

## Branch Strategy

1) Freeze Legacy on master (status quo reference)
- Keep master as the baseline and planning branch.
- Legacy WebGL/VTF code lives only in legacy branch.

2) Create dedicated pipeline branch
- Create: `feature/webgpu-tsl-pipeline`
- This branch contains:
  - all DI/parity from refactor/base-terrain-architecture
  - no legacy WebGL/VTF paths
  - WebGPURenderer + NodeMaterials only

3) Feature sub-branches
- Branches from `feature/webgpu-tsl-pipeline`:
  - `feat/tsl-materials`
  - `feat/compute-pass-erosion`
  - `feat/cpu-raycast-bvh`
  - `feat/gui-port`

## Tagging Milestones

- Tag major milestones:
  - `webgpu-alpha-1` (terrain mesh visible)
  - `webgpu-alpha-2` (sim step + readback health checks)
  - `webgpu-beta-1` (GUI parity)

Example:
```
git tag webgpu-alpha-1
git push origin --tags
```

## Hygiene Rules

- Keep legacy GLSL only in legacy branch.
- Avoid reintroducing simulation-state imports.
- All changes in feature branches must keep DI rules.
- Commit in small steps; each commit should compile.

