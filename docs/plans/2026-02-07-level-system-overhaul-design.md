# Echo Rift: Level System Overhaul

## Overview

Overhaul the game's level system to support easy 2D-array-based level creation, per-tile-type hitboxes, location-based dialogue triggers, flickering ceiling lamps, and a fixed ANCHOR ghost mode.

## Tile System

### Tile Palette

| ID | Type | Hitbox (relative to 60x60 tile) | Collision | Notes |
|----|------|----------------------------------|-----------|-------|
| 0 | Empty | none | No | Air |
| 1 | Wall | full (0, 0, 60, 60) | Yes | Solid walls, ceiling, floor |
| 2 | Platform | bottom slab (0, 40, 60, 20) | Yes | Matches current visual offset |
| 3 | Crate | inset (10, 10, 40, 50) | Yes | Matches current visual offset |
| 4 | Dialogue trigger | none | No | Invisible; fires dialogue once on player overlap |
| 5 | Lamp | narrow fixture (20, 0, 20, 20) | No | Hangs below ceiling; emits flickering light |
| 6 | Vent/Exit | full (0, 0, 60, 60) | No | Triggers level transition on player overlap |

### TILES Lookup

A `TILES` object keyed by tile ID. Each entry contains:
- `name`: string identifier
- `hitbox`: `{ ox, oy, w, h }` relative to tile origin, or `null` for non-solid
- `solid`: boolean
- `light`: boolean (whether it emits light)
- `draw(ctx, x, y)`: rendering function

## Collision System

### Per-Tile Hitboxes

The `resolve()` function changes from assuming full 60x60 tile collision to computing actual bounding boxes:

```
actual box = {
  x: col * TILE + hitbox.ox,
  y: row * TILE + hitbox.oy,
  w: hitbox.w,
  h: hitbox.h
}
```

Tiles with `null` hitbox are skipped in collision checks.

### Ghost Collision by Mode

- **BOUNCE (mode 0)**: Reflects player velocity with 1.8x multiplier on collision axis. Same as current.
- **SUPER-LIGHT (mode 1)**: No collision with player. Ghost provides light only.
- **ANCHOR (mode 2)**: Ghost is a solid platform. Hard stop collision: `p.vy = 0; p.grounded = true` when landing on top. No velocity reflection. Player can stand on it, push against it.

## Level Data Structure

Each level is a self-contained object:

```js
{
  name: "CELL",
  map: [[...], [...], ...],
  spawn: { x: 2, y: 6 },       // tile coordinates
  triggers: {
    "4,2": { text: "My cell door is locked...", speaker: "734-C", once: true },
    "8,5": { text: "That vent grate is loose.", speaker: "734-C (Thinking)", once: true }
  }
}
```

- `levels` array holds all level objects
- `currentLevel` index tracks progression
- Level transitions via tile 6 (exit): swap map, reset player to new spawn, clear ghost history, reset triggers

## Dialogue Trigger System

- Tile 4 placed in map at trigger locations
- `triggers` dict in level data keyed by `"col,row"`
- On player overlap with trigger tile, look up position in `triggers`
- If `once: true`, mark as fired after first activation
- Replaces all tick-based `timer === N` dialogue

## Ceiling Lamps

### Placement
- Tile 5, placed directly below a ceiling wall tile (tile 1)
- Draws a small metal bracket connecting to ceiling + bulb/fixture body below

### Lighting
- Warm amber color (#ff9940-ish) at low opacity
- Flickering radius oscillates between ~100-180px
- Flicker uses two overlapping sine waves at different frequencies for organic, non-repetitive effect
- Each lamp gets a random phase offset so they don't sync
- Implemented as additional radial gradient punches in the existing light overlay pass
- Only process lamps within camera bounds for efficiency

### Atmosphere
- Dim, ambient glow — hints at environment without feeling safe
- Creates mysterious, spooky vibe through uneven, shifting illumination

## Cell Level Map

Converted from hardcoded rendering to tile map:

```
1 1 1 1 1 1 1 1 1
1 0 0 0 0 0 0 6 1    <- vent exit top-right
1 0 0 0 0 0 0 0 1
1 0 0 0 0 0 0 0 1
1 0 0 0 0 0 3 0 1    <- crate to climb toward vent
1 0 2 2 0 0 0 0 1    <- bed (platforms)
1 0 0 0 0 0 2 2 1    <- stepping platform
1 1 1 1 1 1 1 1 1
```

- Dialogue trigger tile near spawn
- Vent tile (6) upper-right as level exit
- Crate and platforms create path to vent

## Implementation Order

1. Define `TILES` lookup with all tile types and hitboxes
2. Refactor collision resolver to use per-tile hitboxes
3. Create level data structure and `levels` array
4. Convert cell level to tile map, replace `renderCell()`
5. Implement dialogue trigger system (tile 4 overlap detection)
6. Add lamp tile type with flickering light
7. Fix ANCHOR mode ghost collision
8. Update Level 1 map with lamp and trigger tiles
