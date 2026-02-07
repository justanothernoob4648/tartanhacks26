# Multiplayer Design for ECHO

## Overview

Add an opt-in multiplayer mode where two players cooperate: one as the main character and one as the clone (ghost). In single-player, the game works exactly as today with zero networking code. Multiplayer is only activated from the title screen.

**Core asymmetry:**
- The **main player** sees the clone's movements in real-time (the clone replaces the ghost)
- The **clone player** sees the main player's movements 2 seconds behind, but sends their own movements to the main player in real-time
- The clone controls which mode they're in (BOUNCE / SUPER-LIGHT / ANCHOR) but cannot interact with the environment (no vents, dialogue triggers, or spike damage)

## Architecture

### Components

- `index.html` - The game client (both players use the same file)
- `server.js` - A small Node.js WebSocket server that relays messages between two players in a room (~50-80 lines)

### Isolation Rule

If multiplayer is not selected, no networking code ever runs. The `mp` object is not created. All multiplayer logic is gated behind `if (mp && mp.active)` checks. There are zero runtime network requests in the offline version.

## Connection Flow

### Title Screen

A new `TITLE_SCREEN` game state precedes the existing `CUTSCENE_SENTENCE` state. Players see two buttons:

- **SOLO** - Skips to `CUTSCENE_SENTENCE` then `PLAYING` (existing flow, zero networking)
- **MULTIPLAYER** - Enters `LOBBY` state

### Lobby

The lobby is a simple overlay on the canvas:

- **CREATE ROOM** button - Connects to WebSocket server, receives and displays a 6-character room code
- **JOIN ROOM** button - Shows text input for room code, connects to server
- **BACK** button - Returns to title screen, closes any open WebSocket connection
- Status text: "Waiting for partner..." / "Connected!"
- Room creator is assigned **main** role, joiner is assigned **clone** role
- Once both are connected, a 3-second countdown starts, then both enter `CUTSCENE_SENTENCE` then `PLAYING`

**Error states:**
- "Room not found" - Invalid room code entered
- "Room full" - Room already has two players
- "Server unavailable" - Cannot connect to WebSocket server
- Errors display as red status text, lobby remains interactive

**Server URL:** Defaults to same-origin (`ws://<current-host>:<port>`). For local testing this is `ws://localhost:3000`. For remote play, the server must be hosted and the URL configured.

### Intro Cutscene

Each role sees a different intro:

- **Main player** sees the original intro text (existing cutscene)
- **Clone player** sees: "You are the echo. Your partner sees you in real-time, but you see them 2 seconds behind. Help them escape."

## Client-Side State

### Multiplayer Object

Only created when multiplayer is selected:

```javascript
mp = {
  active: false,        // true only in multiplayer
  ws: null,             // WebSocket connection
  role: null,           // "main" or "clone"
  roomCode: null,       // 6-char room code
  partnerPos: { x: 0, y: 0 },  // latest partner position
  partnerDir: 1,        // partner facing direction
  partnerGrounded: false,       // partner grounded state
  partnerMode: 0,       // partner's current ghost mode
  stateBuffer: [],      // clone-side: buffered main player states
  connected: false,
  fadeIn: 0             // ghost fade-in progress (0→1), mirrors ghost.fade behavior
}
```

## Game Loop Changes

### Main Player (`role === "main"`)

Minimal changes to `renderLevel`:

1. **Input** - Movement and jump work identically (including coyote time). Mode keys (1/2/3) are **disabled**. Teleport (S) works when clone is in ANCHOR mode.
2. **Physics** - Unchanged (coyote time, acceleration, gravity, friction all work normally).
3. **History recording** - Still records to `p.history[]` (needed for disconnect fallback).
4. **Ghost update** - Instead of reading from `p.history`, ghost position comes from the latest `pos` message received from the clone via WebSocket.
5. **Ghost rendering** - Identical to single-player (semi-transparent, mode-colored, spring/light/anchor visuals). Only the data source changes. Ghost uses `mp.fadeIn` for opacity and lighting intensity (mirrors `ghost.fade` behavior from single-player).
6. **Ghost fade-in** - When first receiving clone position data, `mp.fadeIn` ramps from 0 to 1 (incrementing by 0.05 per frame, ~20 frames to full). All ghost rendering and lighting multiplied by this value, matching single-player behavior.
7. **Bounce interaction** - `handleBounceSpringInteraction()` runs using clone's real-time position (from `mp.partnerPos`). Spring compression/cooldown are computed locally on the main player's client. No network sync needed for spring state.
8. **Send state** - Every frame (30/sec), send `{ type: "state", x, y, vx, vy, dirX, grounded, level }` to server.
9. **Trajectory arrows** - Hidden (clone movement is unpredictable).
10. **Tether UI** - Hidden. Replaced with "CONNECTED" indicator and room code display.
11. **Mode display** - Shows the clone's current mode (received via `pos` messages), not the main player's own selection.

### Clone Player (`role === "clone"`)

A modified version of `renderLevel`:

1. **Input** - Movement, jump (with coyote time), and mode switching (1/2/3). No teleport. No vent/dialogue triggers.
2. **Physics** - Same acceleration, gravity, friction, coyote time. Collision with walls and platforms only. No spike damage, no vent transitions.
3. **Camera** - Follows the clone's own character.
4. **Send position** - Every frame (30/sec), send `{ type: "pos", x, y, mode, dirX }` to server.
5. **Receive and buffer** - Incoming `state` messages are pushed to `mp.stateBuffer[]` with a receive timestamp (`Date.now()`). Messages are consumed when they are 2+ seconds old. Playback uses linear interpolation between the two closest buffered states for smooth rendering. Buffer is capped at 5 seconds of data (150 entries at 30fps); oldest entries beyond the cap are dropped.
6. **Render main player** - Drawn as the normal player character sprite using the buffered (delayed) state. Rendered without particles (just the character). Fades in when first buffered state becomes available (same fade-in mechanic as ghost, 0→1 over ~20 frames).
7. **Render self** - Drawn as the ghost (semi-transparent, mode-colored) so the clone knows they are "the ghost."
8. **Lighting** - Clone emits ghost-level lighting in SUPER-LIGHT mode (260px radius), with intensity multiplied by fade progress. Delayed main player emits normal player lighting (250px radius). Lamps work normally. All three ghost lighting passes (light buffer cutout, destination-out pass, additive glow) respect fade multiplier.
9. **Particles** - Clone sees their own footstep/jump particles for movement feedback. Delayed main player has no particles.
10. **Dialogue** - Clone never sees dialogue boxes. Dialogues are main-player-only.
11. **Out-of-bounds** - Clone respawns at level spawn if they fall off the map.

## Mode Interactions in Multiplayer

### BOUNCE (Mode 0 - Magenta)

- Clone positions themselves and switches to BOUNCE mode.
- Main player sees clone in real-time as an animated spring (coil with base plate, head plate, and compression animation via `getBounceSpringMetrics()`).
- Bounce triggers via `handleBounceSpringInteraction()`: player must land on the spring's head plate from above (Y-axis only, within a trigger band). Player is X-aligned to spring center on bounce.
- Bounce velocity: -24. Spring cooldown: 12 frames. Player friction on bounce: 0.9x.
- `springCompression` and `springCooldown` are local state on the main player's client (not sent over network). Spring compression animates visually by decaying at 0.18 rate per frame.
- Clone does not feel the bounce. Clone stays in place.
- Clone sees the main player approach and bounce 2 seconds after it happens.

### SUPER-LIGHT (Mode 1 - Yellow)

- Clone is intangible (no collision with main player).
- Clone emits large light radius (260px) on both screens.
- Clone positions themselves to illuminate dark areas for the main player.
- Main player sees the light in real-time.

### ANCHOR (Mode 2 - Cyan)

- Clone positions themselves and switches to ANCHOR mode.
- Main player presses S to teleport to the clone's current real-time position.
- Clone is unaffected by the teleport.
- Clone sees the main player teleport 2 seconds later in their delayed view.
- Teleport button only appears on the main player's HUD when clone is in ANCHOR mode and active.

## Level Progression

- Only the main player can trigger vent transitions.
- When the main player enters a vent, they send `{ type: "level", index }` to the server.
- Clone receives the level message and both players load the new level.
- **Critical:** The clone's `stateBuffer` must be flushed immediately on level transition. Otherwise the clone would see 2 seconds of stale data from the old level.
- Both players respawn at the new level's spawn point.
- Clone's ghost history is cleared.

## Victory Condition

- When the main player completes the last level (REACTOR), they send `{ type: "win" }` to the server.
- Both players see a shared victory screen.

## HUD Changes in Multiplayer

- Role indicator: "MAIN" or "CLONE" displayed clearly on screen.
- "CONNECTED" indicator replaces the "TETHER: X%" display.
- Room code displayed for reference.
- Mode display: Main player sees the clone's current mode. Clone sees their own mode.

### Mobile Touch Controls per Role

Touch controls adapt based on role:

- **Main player:** Movement joystick, jump button. Mode button is **hidden** (clone controls modes). Teleport button appears when clone is in ANCHOR mode.
- **Clone player:** Movement joystick, jump button, mode button. Teleport button is **hidden** (only main player can teleport).

## Edge Cases

### Disconnection

Handled asymmetrically based on which player drops:

**Clone disconnects:**
- Main player continues in single-player mode
- Ghost reverts to history replay (the `p.history[]` buffer is maintained throughout multiplayer)
- Toast message: "Connection lost - reverting to solo"
- No progress is lost

**Main player disconnects:**
- Clone cannot progress alone (no vent/dialogue interaction)
- Toast message: "Partner disconnected"
- After 3 seconds, clone is returned to the title screen

### Main Player Death (Spikes)

- Main player respawns at level spawn with quip (normal behavior).
- Clone stays at their current position (not reset).
- This rewards good clone positioning (clone can be ready to help immediately after respawn).

### Clone and Hazards

- Clone is immune to spike damage (cannot interact with environment).
- Clone collides with walls and platforms for movement.
- Clone cannot trigger dialogue tiles.
- Clone cannot enter vents.
- Clone respawns at level spawn if they go out of bounds.

### Stale Rooms

- Server cleans up rooms after 5 minutes of inactivity.
- Prevents memory leaks from abandoned rooms.

## Audio in Multiplayer

**Sound effects (procedural via Web Audio API):**
- **Main player's screen:** Normal player sounds (step, jump, swap, respawn, level). Clone (ghost) is silent, consistent with single-player ghost behavior. Bounce spring trigger plays jump sound.
- **Clone's screen:** Clone hears their own step and jump sounds for movement feedback. Delayed main player is silent (just a rendered sprite).

**Ambient music:**
- Both players run their own independent ambient music system (4-chord pad progression with bass and melody layers).
- Audio initializes lazily on first `pointerdown` or `keydown` (browser autoplay policy).
- Audio gain constants (`MASTER_GAIN_TARGET`, `SFX_GAIN_MULT`, `AMBIENT_GAIN_TARGET`, `AMBIENT_NOTE_GAIN_MULT`) are shared across both roles.

## Server Architecture

### `server.js` - Minimal WebSocket Relay

The server has no game logic. It holds rooms and forwards messages.

```javascript
Room = {
  code: "ABC123",       // 6-char alphanumeric code (guaranteed unique across active rooms)
  main: WebSocket,      // player A's connection
  clone: WebSocket,     // player B's connection
  level: 0,             // current level (for reconnection reference)
  lastActivity: Date.now()  // for stale room cleanup
}
```

**Room code generation:** Server generates random 6-character alphanumeric codes and checks against existing active rooms to ensure uniqueness before assigning.

### Message Protocol (JSON over WebSocket)

**Client to Server:**
```
{ type: "create" }                              // create a room
{ type: "join", code: "ABC123" }                // join a room
{ type: "pos", x, y, mode, dirX }              // clone sends position (every frame)
{ type: "state", x, y, vx, vy, dirX, grounded, level }  // main sends state (every frame)
{ type: "level", index }                        // main triggers level change
{ type: "win" }                                 // main triggers victory
```

**Server to Client:**
```
{ type: "created", code: "ABC123" }             // room code assigned
{ type: "joined", role: "main" | "clone" }      // role assigned
{ type: "start" }                               // both connected, begin game
{ type: "pos", x, y, mode, dirX }              // relayed to main player
{ type: "state", x, y, vx, vy, dirX, grounded, level }  // relayed to clone player
{ type: "level", index }                        // relayed to clone player
{ type: "win" }                                 // relayed to clone player
{ type: "partner_disconnected" }                // partner dropped
{ type: "error", message: "Room not found" }    // invalid room code
{ type: "error", message: "Room full" }         // room already has two players
```

## Network Considerations

- **Send rate:** 30 messages/sec per player (one per frame). Acceptable for WebSocket.
- **2-second delay:** Implemented client-side on the clone. Messages are buffered with timestamps and consumed only when 2+ seconds old. Server is a pure relay with no delay logic.
- **Smoothing (nice-to-have for v2):** Lerp between last two received positions to reduce jitter from network variance. Not critical for initial implementation.
- **Latency:** Real network latency (20-50ms) is negligible compared to the 2-second delay mechanic. No lag compensation needed.
- **State not synced (local only):** `p.coyote` (coyote time frames), `ghost.springCompression`, `ghost.springCooldown`, `ghost.fade` / `mp.fadeIn` - these are all computed locally per client and never sent over the network.
- **Mode switch side effect:** When the clone switches away from BOUNCE mode, `setMode()` resets `springCompression` and `springCooldown` to 0 locally. The main player's client should mirror this when receiving a mode change via `pos` messages.

## Summary of Changes

| File | Changes |
|------|---------|
| `index.html` | New game states (TITLE_SCREEN, LOBBY). Lobby UI with create/join/back/errors. Server URL config. Multiplayer object with buffer cap. Modified renderLevel for both roles. Interpolated delay buffer playback. Role-adaptive HUD and touch controls. Clone intro text. Asymmetric disconnect handling. Sound effects per role. Disable mode keys for main. Disable environment interaction for clone. |
| `server.js` | New file. ~60-100 lines. WebSocket relay with room management, unique code generation, error responses, stale room cleanup. |
