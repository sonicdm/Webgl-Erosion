# Pointer Accuracy Investigation

## Issue
Pointer accuracy appears to have regressed - brush interactions are not aligning with cursor position.

## Current Mouse Position Tracking

### Two Different Coordinate Systems:

1. **`handleInteraction` (from mouseChange library)**
   - Receives element-local coordinates (relative to canvas)
   - Converts to client coordinates: `setLastMousePosition(rect.left + x, rect.top + y)`
   - Location: `src/main.ts:994-1005`

2. **`pointerdown` and `pointermove` handlers**
   - Use client coordinates directly: `setLastMousePosition(e.clientX, e.clientY)`
   - Location: `src/main.ts:1075, 1109`

### Normalization Function:
- `normalizeMousePosition()` expects **client coordinates** (clientX, clientY)
- It converts them to canvas-relative normalized coordinates [0, 1] by:
  ```typescript
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  ```

## Potential Problem

When `handleInteraction` is called:
- It receives element-local coordinates `(x, y)` 
- Converts to client coordinates: `rect.left + x, rect.top + y`
- Stores in `lastX, lastY`
- Then `normalizeMousePosition` subtracts `rect.left` and `rect.top` again
- **This double-correction could cause inaccuracy**

When `pointerdown`/`pointermove` are called:
- They use `e.clientX, e.clientY` directly (correct)
- `normalizeMousePosition` correctly converts them

## Hypothesis

The `mouseChange` library's `handleInteraction` function might be interfering with the newer pointer event handlers, or the coordinate conversion in `handleInteraction` is incorrect.

## Next Steps

1. Check if `mouseChange` is still needed or if it conflicts with pointer events
2. Verify if `handleInteraction` should use client coordinates directly instead of converting
3. Add debug logging to compare coordinates from both sources
4. Test if disabling `mouseChange` improves accuracy

