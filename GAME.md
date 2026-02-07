# ECHO — Complete Game Documentation

> A puzzle platformer with time-manipulation mechanics, built as a single HTML5 file (~57KB, ~1,486 lines). No external libraries or frameworks.

## Table of Contents

- [Summary](#summary)
- [Narrative](#narrative)
- [Project Structure](#project-structure)
- [Technical Stack](#technical-stack)
- [Architecture Overview](#architecture-overview)
- [Game States](#game-states)
- [Player](#player)
- [Ghost System (Core Mechanic)](#ghost-system-core-mechanic)
- [Controls](#controls)
- [Physics](#physics)
- [Tile System](#tile-system)
- [Collision Detection](#collision-detection)
- [Level System](#level-system)
- [Lighting System](#lighting-system)
- [Audio System](#audio-system)
- [Particle System](#particle-system)
- [Visual Effects](#visual-effects)
- [Camera System](#camera-system)
- [UI / HUD](#ui--hud)
- [Dialogue / Trigger System](#dialogue--trigger-system)
- [Respawn System](#respawn-system)
- [Rendering Pipeline](#rendering-pipeline)
- [Mobile Support](#mobile-support)
- [Performance Optimizations](#performance-optimizations)
- [Global State Reference](#global-state-reference)
- [Key Functions Reference](#key-functions-reference)

---

## Summary

**ECHO** is a sci-fi puzzle platformer where the player controls an inmate escaping a prison facility. The core mechanic is a **ghost clone** that replays the player's movements from 2 seconds (60 frames) in the past. The ghost has three switchable modes — BOUNCE, SUPER-LIGHT, and ANCHOR — each providing different abilities needed to solve traversal puzzles across 5 levels.

The entire game is contained in a single `index.html` file using vanilla JavaScript and the Canvas 2D API. It features procedural audio (Web Audio API), a dual-pass lighting system, responsive mobile touch controls, and a generative ambient music system.

---

## Narrative

The player is **INMATE 734-C**, sentenced to a punishment called "TEMPORAL RECURSION TETHER" — locked to a 120ms temporal offset. This manifests as the ghost clone that follows the player on a 2-second delay. The game begins with a cutscene displaying the sentencing, then the player must escape through 5 increasingly complex rooms: Cell, Storage, Shaft, Corridor, and Reactor.

---

## Project Structure

```
TartanHacksAlan/
├── index.html          # The entire game (single file, ~57KB, ~1486 lines)
├── serve.sh            # Archive extraction + local HTTP server script
├── GAME.md             # This file
└── docs/
    └── plans/
        └── 2026-02-07-level-system-overhaul-design.md  # Design document
```

There are no external assets, images, or sound files. All rendering is procedural (Canvas API) and all audio is synthesized (Web Audio API).

---

## Technical Stack

| Aspect | Technology |
|--------|-----------|
| Language | Vanilla JavaScript (ES6+) |
| Rendering | Canvas 2D API (two canvases: main + light buffer) |
| Audio | Web Audio API (procedural synthesis) |
| Framework | None — zero dependencies |
| Target FPS | 30 (locked via `requestAnimationFrame` + timestamp check) |
| Tile size | 60 x 60 pixels |
| Player size | 34 x 48 pixels |
| Resolution | Full viewport (responsive) |

---

## Architecture Overview

The game is a single-file application with these logical sections:

1. **HTML/CSS** — Canvas element, HUD overlay, mobile touch controls, dialog box
2. **Constants & Tile Definitions** — `TILE` size, `TILES` lookup object with hitbox/rendering per type
3. **Level Data** — Array of level objects (map grids, spawn points, triggers)
4. **Global State** — Player (`p`), ghost, camera, particles, input, audio context
5. **Physics & Collision** — `resolve()` function, AABB tests, triangle-rect for spikes
6. **Rendering** — `renderLevel()` draws environment, entities, lighting in correct order
7. **Audio** — `scheduleTone()`, `playSound()`, generative ambient music system
8. **Input Handling** — Keyboard events + pointer events for mobile touch controls
9. **Game Loop** — `update()` called via `requestAnimationFrame`, delegates to state handler

---

## Game States

| State | Description |
|-------|-------------|
| `CUTSCENE_SENTENCE` | Opening cutscene (timer 0–250). Black screen with red text appearing in stages. Introduces the premise. Auto-transitions to `PLAYING` at timer=250. |
| `PLAYING` | Main gameplay. Player control enabled, full rendering, touch controls visible. |

---

## Player

The player object `p` contains:

```
{
  x, y          // Position (pixels, top-left corner)
  vx, vy        // Velocity
  w: 34, h: 48  // Hitbox dimensions
  grounded      // Boolean — touching ground this frame
  facing        // -1 (left) or 1 (right)
  walkFrame     // Animation counter for leg oscillation
  mode          // 0=BOUNCE, 1=SUPER-LIGHT, 2=ANCHOR
}
```

### Player Visual

- **Body:** Dark gray rectangle (34 x 28px)
- **Head:** Lighter rectangle (28 x 18px) on top
- **Eyes:** Horizontal colored bar, color depends on state:
  - Green when grounded
  - Red when airborne
  - Mode color when rendering the ghost
- **Legs:** Two 8 x 10px rectangles with sine-wave walk animation (4px amplitude)

---

## Ghost System (Core Mechanic)

The ghost replays the player's position from **60 frames (2 seconds)** ago, read from a circular history buffer.

### History Buffer

- Every frame, the player's `{ x, y }` is pushed into a history array
- The ghost reads from `history[history.length - 60]`
- Buffer is capped/managed so it always has up to 60 frames of data
- A "tether charge" percentage (0–100%) is shown in the HUD, representing how full the buffer is

### Ghost Modes

| Mode | ID | Color | Behavior |
|------|----|-------|----------|
| BOUNCE | 0 | Magenta (`#f0f`) | Landing on the ghost launches the player upward (vy = -22). Has a visible spring mechanism underneath. 10-frame cooldown between bounces. |
| SUPER-LIGHT | 1 | Yellow (`#ff0`) | No collision. Provides a large light radius (260px). Emits yellow particle trail. Illuminates dark areas. |
| ANCHOR | 2 | Cyan (`#0ff`) | Ghost acts as a solid platform. Player can stand on it. Press **S** to teleport to ghost position. Teleport creates cyan particle effects at both locations. |

### BOUNCE Spring Visual

- Base plate (12px wide) below the ghost
- 4-turn zigzag coil that compresses on bounce (height varies 4–12px)
- Compression animates from 0 to 1 and back
- Magenta color with shadow/glow

---

## Controls

### Desktop (Keyboard)

| Key | Action |
|-----|--------|
| Arrow Left / Right | Move horizontally |
| Arrow Up / Space | Jump |
| 1 | Switch to BOUNCE mode |
| 2 | Switch to SUPER-LIGHT mode |
| 3 | Switch to ANCHOR mode |
| S | Teleport to ghost (ANCHOR mode only) |

### Mobile (Touch)

| Control | Position | Description |
|---------|----------|-------------|
| Virtual joystick | Left side | 132px diameter, 8px dead zone, max knob radius 38% of wrapper |
| Jump button | Right side | 146 x 88px |
| Mode button | Right side | 146 x 48px, cycles through modes |
| Teleport button | Right side | 146 x 48px, only visible in ANCHOR mode |

Touch uses the **Pointer Events API** with pointer capture for reliable multi-touch.

---

## Physics

| Parameter | Value |
|-----------|-------|
| Gravity | 1.2 per frame |
| Horizontal acceleration | 1.8 per frame |
| Horizontal friction | 0.85 (multiplied each frame) |
| Jump velocity | -20 (upward) |
| Bounce velocity (BOUNCE mode) | -22 (upward) |
| Frame rate | 30 FPS |

### Movement Loop

1. Apply horizontal input (acceleration * direction), apply friction
2. Apply gravity to vertical velocity
3. Update position by velocity
4. Run collision resolution against tile map
5. Check for spike collision, out-of-bounds → respawn
6. Record position to ghost history buffer

---

## Tile System

Each tile occupies a 60 x 60 pixel cell. Tile types are defined in a `TILES` lookup object.

| ID | Name | Hitbox (ox, oy, w, h) | Solid | Light | Description |
|----|------|------------------------|-------|-------|-------------|
| 0 | Empty | `null` | No | No | Air/nothing |
| 1 | Wall | `(0, 0, 60, 60)` | Yes | No | Dark gray solid blocks (`#0e0e12`). Floors, walls, ceilings. |
| 2 | Platform | `(0, 40, 60, 20)` | Yes | No | Raised slab at bottom of tile. Has visual supports underneath. |
| 3 | Crate | `(10, 10, 40, 50)` | Yes | No | Brown wooden crate, inset within tile. |
| 4 | Dialogue | `null` | No | No | Invisible trigger tile. Fires dialogue on player overlap. |
| 5 | Lamp | `null` | No | Yes | Ceiling-mounted fixture. Emits flickering warm amber light. |
| 6 | Vent/Exit | `null` | No | No | Level exit. Triggers level transition on player overlap. |
| 7 | Spikes | `null` | No | No | Deadly upward-facing triangle spikes. Kills player on contact. |

### Tile Hitbox Resolution

The actual world-space hitbox for a tile at grid position (col, row):
```
{
  x: col * 60 + hitbox.ox,
  y: row * 60 + hitbox.oy,
  w: hitbox.w,
  h: hitbox.h
}
```

---

## Collision Detection

### AABB (Standard Tiles)

Standard axis-aligned bounding box overlap test between the player rect and each tile's world-space hitbox. Only tiles with `solid: true` and a non-null hitbox are tested.

### Triangle-Rectangle Intersection (Spikes — Tile 7)

Multi-step precise test:
1. Check if any rectangle corners are inside the triangle (barycentric coordinates)
2. Check if any triangle vertices are inside the rectangle
3. Check edge-edge intersections (orientation test: CCW/CW/collinear)

### Ghost Collision

- **BOUNCE (mode 0):** AABB between player and ghost. On collision, player vy is set to -22 (launch). 10-frame cooldown.
- **SUPER-LIGHT (mode 1):** No collision at all.
- **ANCHOR (mode 2):** Ghost acts as solid platform. Landing on top: `p.vy = 0`, `p.grounded = true`. Player can stand on it and push against sides.

---

## Level System

5 levels stored in a `levels` array. Each level object:

```js
{
  name: "LEVEL_NAME",       // Display name
  map: [[...], [...], ...], // 2D array of tile IDs (rows x cols)
  spawn: { x, y },          // Spawn position in tile coordinates
  triggers: {               // Dialogue triggers keyed by "col,row"
    "col,row": { text: "...", speaker: "...", once: true }
  }
}
```

### Level Descriptions

#### Level 0 — CELL (9 x 8 tiles)
- **Spawn:** (2, 6)
- **Goal:** Escape through vent using crate to climb
- **Purpose:** Teaches basic movement, introduces setting

#### Level 1 — STORAGE (31 x 9 tiles)
- **Spawn:** (1, 7)
- **Goal:** Navigate long horizontal room with crates, platforms, and lamps
- **Purpose:** Introduces ghost mechanics, horizontal traversal

#### Level 2 — SHAFT (10 x 15 tiles)
- **Spawn:** (1, 13)
- **Goal:** Climb tall vertical shaft
- **Purpose:** Teaches ANCHOR mode (teleport/platform), vertical traversal

#### Level 3 — CORRIDOR (35 x 10 tiles)
- **Spawn:** (1, 7)
- **Goal:** Cross long corridor with gaps and spike hazards
- **Purpose:** Tests BOUNCE and SUPER-LIGHT usage, hazard avoidance

#### Level 4 — REACTOR (20 x 13 tiles)
- **Spawn:** (1, 11)
- **Goal:** Navigate large room combining all challenges
- **Purpose:** Final level requiring mastery of all three ghost modes

### Level Transitions

When the player overlaps a vent tile (ID 6):
1. Increment `currentLevel`
2. Load new level's map, spawn, triggers
3. Reset player position to new spawn
4. Clear ghost history buffer
5. Clear fired triggers
6. Play level-complete sound

---

## Lighting System

Dual-pass system using an offscreen `lightBuffer` canvas.

### Pass 1: Darkness Overlay

1. Fill `lightBuffer` with semi-transparent black (`rgba(0, 0, 0, 0.22)`)
2. Use `"destination-out"` compositing to punch transparent holes:
   - **Player light:** 250px radial gradient centered on player
   - **SUPER-LIGHT ghost:** 260px radial gradient centered on ghost
   - **Lamps:** Animated cone + bulb glow (see below)

### Pass 2: Additive Glow

1. Use `"lighter"` blend mode on main canvas
2. Render warm amber glow for each lamp
3. Render extra glow for SUPER-LIGHT ghost
4. Creates luminous halos without affecting the darkness mask

### Lamp Lighting Details

- **Color:** Warm amber (`#ff9940` range)
- **Animation:** Two overlapping sine waves with random per-lamp phase offsets
  - Cone height oscillates: 340–400px
  - Cone width oscillates: 85–105px
- **Components:**
  - Downward cone gradient (linear, from fixture downward)
  - Bulb glow (radial gradient, 95–120px radius)
- **Culling:** Lamps outside camera view (+ margin) are skipped

---

## Audio System

All audio is procedurally generated using the Web Audio API. No audio files.

### Gain Structure

- Master gain: 0.7
- Ambient gain: 0.55
- SFX multiplier: 1.7x

### Sound Effects

| Sound | Description |
|-------|-------------|
| **Jump** | Two sine tones: 240→320Hz (180ms) + 360→260Hz (220ms) |
| **Footstep** | Band-pass filtered noise burst (160–240Hz random), 220ms, exponential decay. Throttled to 9+ frame gaps. |
| **Mode Swap** | Two tones: 260→330Hz (220ms) + 330→210Hz (280ms, triangle wave) |
| **Level Complete** | Four ascending tones (210→260→420→540→720Hz), staggered timing |
| **Respawn** | Descending square waves: 520→260→180Hz |
| **Bounce** | Spring sound effect when BOUNCE mode activates |
| **Teleport** | Whoosh effect when ANCHOR teleport is used |

### Generative Ambient Music

A looping 4-chord progression (~50 seconds total) with three layers:

**Chord Progression (MIDI notes):**
1. `[50, 57, 62, 65]` — 14s
2. `[46, 53, 58, 62]` — 12s
3. `[43, 50, 55, 59]` — 13s
4. `[41, 48, 53, 57]` — 11s

**Layers:**
- **Pad:** 8 simultaneous oscillators (chord tones + octave below), sustained with attack/release envelopes
- **Bass:** 3 timed bass notes per chord
- **Melody:** 3 melodic phrases per chord with frequency glides and stereo panning

The ambient system schedules notes in advance for seamless looping and auto-resumes on user interaction (browser autoplay policy).

---

## Particle System

Simple array-based particle system for visual feedback.

### Particle Properties

```
{ x, y, vx, vy, life, maxLife, size, color }
```

### Particle Physics

- Horizontal friction: 0.96 per frame
- Gravity: 0.03 per frame (subtle)
- Alpha fades linearly based on `life / maxLife`

### Particle Emitters

| Event | Count | Color | Notes |
|-------|-------|-------|-------|
| Jump | 12 | White | Burst at player feet on takeoff |
| Footstep | ~1 | White | Random while moving on ground |
| Teleport (departure) | 18 | Cyan | Splash at old position |
| Teleport (arrival) | 26 | Cyan | Larger splash at new position |
| SUPER-LIGHT ghost | Continuous | Yellow (`#ffe36a`) | Trail emitting from ghost |
| Respawn | 14 | White | Splash at respawn point |

---

## Visual Effects

### Ghost Trajectory Indicator

- Animated dashed line showing the ghost's future path (from player's recent history)
- Length: up to 60 frames (2 seconds) of recorded positions
- Dash offset scrolls continuously for flowing animation
- Color matches current ghost mode (magenta / yellow / cyan)

### Trajectory Arrows

- Directional arrow indicators along the trajectory path
- Spacing: 52px apart
- Pulsing scale: 1.0 – 1.22x
- Alpha oscillation: 0.58 – 0.85
- Color matches mode

---

## Camera System

Smooth-follow camera with linear interpolation:
- **Target:** Player position centered on viewport
- **Smoothing factor:** 0.1 (10% lerp per frame)
- **Effect:** Gentle lag creates a sense of momentum and eases camera motion

---

## UI / HUD

### Top-Left HUD

- **Mode name:** Large text (2.2em) with colored text-shadow glow matching mode
- **Player ID:** "INMATE 734-C"
- **Tether charge:** Percentage (0–100%) showing ghost history buffer fullness
- **Control hints:** Keyboard shortcuts (desktop only)

### Dialog Box (Bottom-Center)

- Dark translucent background (`#0a0a0f`, 0.95 alpha)
- 5px magenta left border
- 550px width (88vw on mobile)
- Auto-dismisses after 4.5 seconds
- Shows speaker name (colored, uppercase) and message text

---

## Dialogue / Trigger System

- Tile type 4 (invisible) placed in level maps at trigger locations
- Level's `triggers` dict is keyed by `"col,row"` strings
- Each frame, the player's tile position is checked against trigger locations
- Properties per trigger:
  - `text` — Dialog message
  - `speaker` — Character name displayed
  - `once` — If `true`, only fires once (tracked in a set as `"level:col,row"`)

---

## Respawn System

### Triggers

- Contact with spikes (tile 7)
- Falling out of bounds (2+ tiles beyond map edges)

### On Respawn

1. Reset player position to level spawn point
2. Clear velocity (`vx = 0, vy = 0`)
3. Clear ghost history buffer
4. Play respawn sound effect
5. Emit 14 white particles
6. Show a random quip in dialog: "Drats!", "Foiled again!", "Not my finest landing.", "Well... that went poorly.", "Back to square one.", "Nope. Try that again."

---

## Rendering Pipeline

Each frame (at 30 FPS):

### 1. State Update

- Process keyboard/touch input
- Apply acceleration, friction, gravity
- Update player position
- Resolve tile collisions
- Check spike collision, out-of-bounds
- Update ghost from history buffer
- Update particles (physics + lifetime)
- Check dialogue triggers
- Update camera (lerp toward player)

### 2. Main Canvas Draw

1. Clear with dark background (`#030305`)
2. Apply camera transform (`ctx.translate`)
3. Draw out-of-bounds filler blocks (extending past map edges)
4. Draw environment tiles (walls, platforms, crates, lamps, vents, spikes)
5. Draw ghost trajectory line + arrows
6. Draw ghost entity (if history buffer has enough data)
7. Draw player entity
8. Draw particles (world space)

### 3. Light Buffer Draw

1. Fill with darkness overlay
2. Punch player light circle (`destination-out`)
3. Punch SUPER-LIGHT ghost circle (if mode 1)
4. Render lamp cones and bulb glows (`destination-out`)

### 4. Composite

1. Draw `lightBuffer` onto main canvas (applies darkness)
2. Switch to `"lighter"` blend mode
3. Draw additive glow for lamps and SUPER-LIGHT ghost

---

## Mobile Support

### Detection

- CSS media query: `@media (max-width: 700px)` or `(pointer: coarse)`
- Touch controls are hidden on desktop, shown on mobile

### Touch Control Design

- Glassmorphic style with gradients, shadows, and scan line effects
- Mode-specific border colors with glow
- Responsive sizing via CSS `clamp()` functions

### Joystick Implementation

- Dead zone: 8px (prevents accidental drift)
- Max knob radius: 38% of wrapper
- Visual knob follows pointer with clamping
- Translates to horizontal movement input

### Button States

- Jump button: Pressed class toggle with visual feedback
- Teleport button: Only enabled/visible in ANCHOR mode

---

## Performance Optimizations

1. **30 FPS lock** — Halves computation vs 60 FPS
2. **Lamp culling** — Only render lamps within camera viewport + margin
3. **Natural particle decay** — Lifetime system prevents unbounded growth
4. **Sound throttling** — Footsteps require 9+ frame gaps, jumps have cooldowns
5. **Two-canvas compositing** — Offscreen light buffer avoids redundant blending
6. **Fixed history buffer** — Capped at 60 frames, constant memory
7. **Tile-based rendering** — Only tiles in view need drawing

---

## Global State Reference

| Variable | Type | Description |
|----------|------|-------------|
| `p` | Object | Player state (position, velocity, dimensions, mode, grounded, facing, walkFrame) |
| `ghost` | Object | Ghost state (x, y, derived from history) |
| `camera` | Object | Camera position (x, y) with smooth follow |
| `particles` | Array | Active particle objects |
| `keys` | Object | Keyboard input state (key → boolean) |
| `virtualInput` | Object | Touch control input (left, right, jump) |
| `levels` | Array | All level data objects |
| `currentLevel` | Number | Index into `levels` array |
| `history` | Array | Player position history for ghost replay |
| `firedTriggers` | Set | Tracks which `once` triggers have been activated |
| `audioCtx` | AudioContext | Web Audio context |
| `masterGain` | GainNode | Master volume control |
| `ambientGain` | GainNode | Ambient music volume |
| `gameState` | String | Current game state (`CUTSCENE_SENTENCE` or `PLAYING`) |
| `timer` | Number | Frame counter (used in cutscene timing) |
| `canvas` / `ctx` | Canvas/Context | Main rendering surface |
| `lightBuffer` / `lightCtx` | Canvas/Context | Offscreen lighting surface |

---

## Key Functions Reference

| Function | Purpose |
|----------|---------|
| `update()` | Main game loop. Frame rate limiting, delegates to state handler. |
| `renderLevel()` | Main gameplay renderer. Updates physics, draws everything, runs collision. |
| `resolve(entity, map)` | Collision resolver. Tests entity against all solid tiles using per-tile hitboxes. |
| `drawDroid(ctx, x, y, w, h, ...)` | Renders the player or ghost character with head, body, eyes, legs. |
| `drawEnvironment(ctx, map)` | Iterates tile map and calls each tile's draw function. |
| `checkTriggers()` | Tests player tile position against level trigger dictionary. Shows dialog. |
| `transitionLevel()` | Advances to next level. Resets player, ghost history, triggers. |
| `respawnAtLevelStart()` | Death handler. Resets position, plays sound, shows quip. |
| `scheduleTone(freq, endFreq, duration, ...)` | Schedules a frequency-sweeping oscillator for sound effects. |
| `playSound(name)` | Plays a named sound effect (jump, footstep, modeSwap, etc.). |
| `scheduleAmbient()` | Schedules the next loop of generative ambient music. |
| `spawnParticles(x, y, count, color)` | Creates burst of particles at a position. |
