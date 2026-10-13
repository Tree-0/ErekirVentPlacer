# Erekir Vent Auto-Placer

A small client-side JavaScript mod for Mindustry **160.7 or later**. It queues turbine condensers on nearby steam vents and connects them with basic beam nodes. It adds no blocks and requires no Java build or runtime dependencies.

## Install and use

Import `dist/erekir-vent-placer-0.1.1.zip` through Mindustry's Mods menu, then restart the game. To package from source, zip `mod.hjson`, `scripts/`, and `sprites/` with `mod.hjson` at the archive root. The mod is marked hidden so a multiplayer server does not need to install it.

In an Erekir game, the right side of the HUD has two vent icons. The upper icon with a gear opens settings; choose the vent count and radius, then **Save** without queueing anything. The plain lower icon immediately queues vents using those settings. Defaults are **4** and **50**, and saved choices are remembered for the session. Queueing requires a living builder and available turbine-condenser and beam-node blocks; settings remain accessible while planning or without a builder. Both icons are hidden on Serpulo.

The planner considers discovered, empty, legally buildable vent footprints within a circle centered on your player. It tries vents in nearest-first order and retries with farther starting vents when necessary to find a connected group. It queues up to the requested number and reports a shortfall. This greedy search does not guarantee the globally closest group or fewest nodes.

Beam routes can turn around obstacles and hop across terrain within the basic node's runtime range (10 tiles in 160.7). Routing stays inside the radius's bounding square plus one node range, clipped to the map. Friendly basic nodes and compatible queued nodes can be reused; insulation, powered-building interception, and existing longer-range beam links constrain routes.

Plans are appended to your normal construction queue after placement and connectivity checks. Move into build range and provide materials as usual. There is no player autopilot, and the mod does not deliberately connect to your base grid; nearby friendly power infrastructure may connect automatically. Changing worlds, units, teams, or leaving the game cancels planning.

## Verify

Run the dependency-free tests with Node:

```sh
node --test tests/*.test.js
```

For an in-game smoke test, use Mindustry 160.7 and check script loading, the HUD/dialog, planning while paused, normal construction, multiplayer synchronization, and both campaign and custom Erekir maps. Confirm the button is absent on Serpulo. Try a straight gap, a detour around insulation, existing nodes, and an unreachable vent.

Validation also used an isolated official 160.7 JVM/Rhino runtime: real module loading, HUD/dialog widgets, paused planning, preservation of existing requests, and normal construction with core materials. The resulting condensers shared the actual automatic beam power graph. This headless check does not verify visual rendering or live multiplayer.

The game's public source establishes the vent index, build queue, and beam-link APIs. Eviction server rules and content patches require an actual server check. Update an installed 160.4 client to use this 160.7 target.

Source references: [Mindustry 160.7](https://github.com/Anuken/Mindustry/tree/v160.7), [beam nodes](https://github.com/Anuken/Mindustry/blob/v160.7/core/src/mindustry/world/blocks/power/BeamNode.java), and [EvictionToolkit](https://github.com/Pointifix/EvictionToolkit).
