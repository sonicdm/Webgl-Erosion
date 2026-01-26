# Master Branch Baselines

This directory contains baseline data from the master branch for validation purposes.

## Structure

- `readback/` - GPU readback data (binary format)
  - `terrain-512x512.bin` - Terrain texture readback at 512x512
  - `water-512x512.bin` - Water texture readback at 512x512
  - `sediment-512x512.bin` - Sediment texture readback at 512x512
  - `lava-512x512.bin` - Lava texture readback at 512x512

- `screenshots/` - Visual screenshot baselines (PNG format)
  - `terrain-512x512.png` - Terrain rendering screenshot at 512x512
  - `water-512x512.png` - Water rendering screenshot at 512x512
  - `lava-512x512.png` - Lava rendering screenshot at 512x512

## Updating Baselines

When master branch changes significantly, baselines should be regenerated:

1. Switch to master branch
2. Run simulation at 512x512 resolution
3. Capture GPU readback data and screenshots
4. Save to this directory
5. Commit baseline updates

## Usage

Validation tests compare Three.js output against these baselines:
- GPU readback: 1% tolerance allowed
- Screenshots: 5% pixel difference allowed
