# Legacy Branch Maintenance Policy

## Purpose

The `legacy-webgl` branch preserves the WebGL/GLSL codebase as a frozen reference point. This branch contains the complete WebGL2-based rendering pipeline, OpenGL renderer, GLSL shaders, and all legacy implementation code.

## Branch Status

- **Branch Name**: `legacy-webgl`
- **Baseline Tag**: `v1.0.0-legacy`
- **Status**: Frozen (hotfix-only)
- **Created**: Phase 0 of WebGPU + TSL refactor

## Maintenance Policy

### Allowed Changes

The legacy branch accepts **only** the following types of changes:

1. **Security Fixes**: Critical security vulnerabilities that affect the legacy codebase
2. **Critical Bug Fixes**: Severe bugs that cause crashes, data loss, or make the application unusable
3. **Documentation Updates**: Clarifications or corrections to existing documentation

### Prohibited Changes

The following changes are **NOT allowed** on the legacy branch:

- New features or functionality
- WebGL/GLSL enhancements or optimizations
- New shaders or rendering techniques
- API changes or breaking modifications
- Refactoring or code style improvements (unless fixing a critical bug)
- Dependency updates (unless required for security fixes)

## Branch Protection

- This branch should be protected in GitHub to prevent direct pushes
- All changes should go through pull requests with explicit justification
- PRs must clearly state why the change qualifies as a hotfix
- PRs should be reviewed to ensure they don't introduce new features

## Reference Usage

The legacy branch serves as:

- **Reference Implementation**: Understanding how the original WebGL pipeline worked
- **Baseline Comparison**: Comparing WebGPU implementation against WebGL behavior
- **Fallback Option**: Emergency fallback if WebGPU migration encounters critical issues
- **Historical Record**: Preserving the working state before the refactor

## Migration Context

This branch was created as part of the WebGPU + TSL refactor plan. The active development branch is `feature/webgpu-tsl-pipeline`, which will eventually replace the WebGL implementation in master.

For details on the refactor plan, see:
- [Master Plan](PLAN.md)
- [Progress Tracking](PROGRESS.md)
- [Git Strategy](GIT_STRATEGY.md)

## Code Location

The legacy branch contains:

- `src/rendering/gl/OpenGLRenderer.ts` - WebGL2 renderer
- `src/rendering/gl/ShaderProgram.ts` - GLSL shader management
- `src/shaders/*.glsl` - All GLSL shader files
- `src/main.ts` - Main application entry point with WebGL context setup
- All simulation and terrain code using WebGL2 float textures and MRT

## Questions

If you need to make changes to the legacy branch:

1. Verify the change qualifies as a hotfix (security or critical bug)
2. Create a pull request with clear justification
3. Reference this document in the PR description
4. Ensure the change doesn't introduce new features or break existing functionality
