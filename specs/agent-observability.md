---
title: Agent Observability
date: 2026-01-12
status: implemented
---

# Agent Observability

Systems that allow Claude to perceive fortress state via IPC. The agent receives structured data optimized for token efficiency, actionable insights, and **visual snapshots** for spatial reasoning.

## Query Types

### getSummary (Recommended)

Lightweight query returning essential state without the map. Optimized for frequent polling.

```bash
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock
```

Returns markdown by default for token efficiency. Use `format:"json"` when programmatic parsing is needed:

```bash
# Markdown (default) - more token-efficient
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock

# JSON - for programmatic use
echo '{"type":"getSummary","format":"json"}' | nc -U /tmp/canvas-fortress-1.sock
```

### screenshot (Visual)

Returns a PNG snapshot of the fortress for visual inspection. Captures live state without pausing simulation.

```bash
echo '{"type":"screenshot"}' | nc -U /tmp/canvas-fortress-1.sock
```

Response:

```typescript
{
  type: "screenshot";
  path: string;      // e.g., "/tmp/fortress-1-screenshot.png"
  tick: number;      // Tick when captured
  dimensions: { width: number; height: number };
}
```

Optional viewport for larger maps:

```bash
# Full map (default)
echo '{"type":"screenshot"}' | nc -U /tmp/canvas-fortress-1.sock

# Region of interest
echo '{"type":"screenshot","viewport":{"x":10,"y":5,"width":15,"height":10}}' | nc -U /tmp/canvas-fortress-1.sock
```

### inspect (Spatial)

Query what exists at a specific location or region. Returns structured data about tiles, dwarves, buildings, and jobs in the area.

```bash
# Single tile
echo '{"type":"inspect","x":15,"y":8}' | nc -U /tmp/canvas-fortress-1.sock

# Area (optional radius, default 0)
echo '{"type":"inspect","x":15,"y":8,"radius":3}' | nc -U /tmp/canvas-fortress-1.sock
```

Response:

```typescript
interface InspectResult {
  center: { x: number; y: number };
  radius: number;
  tiles: TileInfo[];        // All tiles in area
  dwarves: DwarfStatus[];   // Dwarves in area (with positions)
  buildings: BuildingInfo[]; // Buildings in area
  jobs: JobInfo[];          // Active jobs in area
}

interface TileInfo {
  x: number;
  y: number;
  type: TileType;
  resource?: "stone" | "iron" | "gold" | "copper";
  designation?: "dig" | "channel";
}

interface BuildingInfo {
  x: number;
  y: number;
  type: "workshop" | "stockpile" | "farm" | "still" | "bed";
  producing?: string;  // Current production, if any
}

interface JobInfo {
  id: number;
  x: number;
  y: number;
  type: "dig" | "build" | "haul" | "produce";
  progress: number;
  assignedTo?: string;  // Dwarf name
}
```

### getState (Full)

Complete state dump including the 40x20 map grid. Use sparingly due to size (~8KB+).

```bash
echo '{"type":"getState"}' | nc -U /tmp/canvas-fortress-1.sock
```

## Screenshot Details

### What's Captured

The screenshot renders the full fortress UI with coordinate grid:

- **Coordinate Grid**: X-axis labels (0, 10, 20, 30, 40) across top, Y-axis labels (0, 5, 10, 15) down left side
- **Header**: Fortress name, year, season, resources, population, average happiness
- **Map**: 40x20 tile grid with terrain, buildings, dwarves, and designations
- **Legend**: Tile type key and current worker assignments

### Visual Style

Terminal-aesthetic rendering optimized for Claude's visual perception:

- Monospace font rendering of ASCII characters (16px)
- Terminal color palette (ANSI colors mapped to RGB hex)
- Grid coordinate labels in yellow for precise spatial reasoning
- Output dimensions: ~708x460 pixels
- High contrast, clean edges (PNG format preserves text clarity)

### Dwarf Representation

| State | Symbol | Color |
|-------|--------|-------|
| Happy | ☺ | Dwarf's assigned color |
| Neutral | ○ | Dwarf's assigned color |
| Sad | ☹ | Dwarf's assigned color |
| In Mood | M | Magenta |
| Dead | † | Dark gray |

### Tile Legend

| Tile | Symbol | Color |
|------|--------|-------|
| Wall | # | Gray |
| Floor | . | Dark gray |
| Water | ~ | Cyan |
| Tree | ^ | Green |
| Farm | % | Yellow |
| Workshop | X | White |
| Dig designation | d | Brown |

> **Implementation**: Uses `@napi-rs/canvas` for PNG rendering. Replicates the same character/color logic from the Ink terminal renderer.

## Markdown Summary Format

When `format` is omitted or `"markdown"`, getSummary returns:

```markdown
# Fortress: Mountainhome
Year 126, Summer | Tick 1847 | ▶ Running

## Resources
| Wood | Stone | Food | Drink |
|------|-------|------|-------|
| 45   | 120   | 32   | 18    |

## Population
Total: 7 | Alive: 7 | Jobs: 3

## Crises
- **Starving**: Urist, Bomrek
- **Dehydrating**: none
- **In Mood**: none

## Dwarves
| ID | Name   | Labor   | Pos  | Hunger | Thirst | Task     |
|----|--------|---------|------|--------|--------|----------|
| 1  | Urist  | mining  | 12,8 | 85     | 45     | digging  |
| 2  | Bomrek | brewing | 5,3  | 82     | 20     | idle     |
| 3  | Atis   | farming | 8,14 | 30     | 55     | planting |

## Recent Events
- [1842] ⚠ Urist is starving!
- [1830] ✓ Farm plot complete
- [1815] ℹ Spring has arrived

## Statistics
Deaths: 2 (1 starvation, 1 dehydration) | Peak: 9 | Artifacts: 0
```

> **Implementation**: `lib/markdown-formatter.ts` handles conversion. Markdown tables eliminate repeated JSON keys - estimate ~40% token reduction for typical summaries.

## FortressSummary Structure (JSON)

When `format:"json"` is specified:

```typescript
interface FortressSummary {
  // Time & status
  tick: number;
  year: number;
  season: Season;
  paused: boolean;

  // Resources
  resources: {
    wood: number;
    stone: number;
    food: number;
    drink: number;
  };

  // Population counts
  dwarfCount: number;      // Total (living + dead)
  aliveCount: number;      // Living only
  activeJobs: number;      // Pending work

  // Detailed views
  dwarves: DwarfStatus[];
  crises: CrisisAlerts;
  statistics: FortressStatistics;
  recentEvents: GameEvent[];  // Last 5 events
}
```

## DwarfStatus

Per-dwarf information surfaced to the agent:

```typescript
interface DwarfStatus {
  id: number;
  name: string;
  position: { x: number; y: number };  // NEW: Dwarf location
  labor: Labor;
  hunger: number;       // 0-100, higher = hungrier
  thirst: number;       // 0-100, higher = thirstier
  happiness: number;    // 0-100, higher = happier
  alive: boolean;
  currentTask?: string; // "digging", "building", etc.
  moodState?: MoodState;
  moodDemands?: string[];
  isLegendary?: boolean;
}
```

> **Implementation**: Position renders as compact `x,y` string in markdown format (e.g., "12,8").

## CrisisAlerts

Proactive alerts for situations requiring immediate attention:

```typescript
interface CrisisAlerts {
  starving: string[];      // Dwarf names with hunger > 80
  dehydrating: string[];   // Dwarf names with thirst > 80
  inMood: string[];        // Dwarf names in strange mood
  recentDeaths: string[];  // Last 5 deceased (newest last)
}
```

### Alert Thresholds

| Alert | Threshold | Urgency |
|-------|-----------|---------|
| Starving | hunger > 80 | High - death at 90+ for 100 ticks |
| Dehydrating | thirst > 80 | High - death at 90+ for 100 ticks |
| In Mood | moodState != normal | Medium - 200 tick deadline |

## GameEvent

Events provide a narrative log of fortress happenings:

```typescript
interface GameEvent {
  id: number;
  tick: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
}
```

### Event Types

| Type | Symbol | Examples |
|------|--------|----------|
| `info` | ℹ | Season change, labor assignment, tiles designated |
| `warning` | ⚠ | Resource shortage, dwarf starving/dehydrating, mood demands |
| `success` | ✓ | Building complete, artifact created, migrants arrived |
| `danger` | ✗ | Dwarf death, berserk rampage, mood failure |

## FortressStatistics

Cumulative metrics for the fortress lifetime:

```typescript
interface FortressStatistics {
  deaths: number;
  deathsByStarvation: number;
  deathsByDehydration: number;
  deathsByInsanity: number;
  deathsByBerserk: number;
  peakPopulation: number;
  moodsTriggered: number;
  moodsSucceeded: number;
  moodsFailed: number;
  artifactsCreated: number;
}
```

## Recommended Query Patterns

### Routine Check
Query every 10-20 seconds to monitor general health:
```bash
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock
```
Focus on: resources, crises, population

### Visual Inspection
Use when spatial context matters - planning dig patterns, checking layouts:
```bash
echo '{"type":"screenshot"}' | nc -U /tmp/canvas-fortress-1.sock
# Then read the PNG at the returned path
```

### After Commands
Query immediately after sending commands to verify execution:
```bash
echo '{"type":"command","command":{...}}' | nc -U ...
echo '{"type":"getSummary"}' | nc -U ...  # Verify
```
Focus on: activeJobs, recentEvents

### Spatial Investigation
When you need details about a specific location:
```bash
echo '{"type":"inspect","x":15,"y":8,"radius":2}' | nc -U ...
```
Use when: planning builds near existing structures, debugging pathfinding, checking resource deposits

### Crisis Response
When `crises` arrays are non-empty, increase query frequency and check:
- `starving`/`dehydrating`: Build farms/stills, check resources
- `inMood`: Check dwarf's `moodDemands`, verify materials available
- `recentDeaths`: Review `statistics` for cause patterns

## Design Decisions

### Why Markdown Default?
Token efficiency. A 7-dwarf summary in JSON: ~800 tokens. Same data in markdown tables: ~500 tokens. The 40% reduction compounds across frequent polling. JSON available via `format:"json"` when needed.

### Why Screenshot?
Previous Claude instances identified visual inspection as high-leverage for spatial reasoning. Text descriptions of a 40x20 grid are verbose and hard to reason about. A single image captures layout, proximity, and patterns instantly.

### Why Terminal Aesthetic for Screenshots?
Consistency with what users see. ASCII art with terminal colors renders crisply at small sizes. Sprites/tiles would require new asset pipeline and might not improve Claude's perception.

### Why Separate screenshot vs inspect?
Different use cases:
- `screenshot`: "Show me the fortress" - gestalt understanding, pattern recognition
- `inspect`: "What's at tile 15,8?" - precise data, programmatic use

### Why Include Position in DwarfStatus?
Spatial reasoning requires knowing where dwarves are. "Urist is at 12,8 near the farm" enables commands like "have Urist work the nearby farm." Cost is ~4 tokens per dwarf.

### Why Optional Viewport?
Current maps are 40x20 (small). Future maps may be larger. Viewport parameter establishes the pattern now without requiring it.

### What's Still NOT Observable?
- Pathfinding internals (A* state, blocked paths)
- Dwarf relationships/social graph
- Exact job queue ordering
- Historical map changes

## Implementation

### Screenshot Rendering (`lib/screenshot.ts`)

Uses `@napi-rs/canvas` for PNG generation:

1. Capture current `FortressState` via `stateRef.current`
2. Build character/color grid using same logic as Ink renderer (`getTileChar`, dwarf overlay)
3. Render coordinate labels (X: 0,10,20,30,40 / Y: 0,5,10,15) in yellow
4. Render map cells with 16px monospace font, 10x18px character cells
5. Write PNG to `/tmp/fortress-{id}-screenshot.png`
6. Return path and dimensions in IPC response

### Markdown Formatter (`lib/markdown-formatter.ts`)

`formatSummaryAsMarkdown(summary: FortressSummary, fortressName: string): string`

- Fixed-width table columns with padding
- Truncates dwarf names to 8 chars
- Event symbols: ℹ (info), ⚠ (warning), ✓ (success), ✗ (danger)
- Compact position format: `x,y`

### Spatial Query (`lib/fortress-sim/inspect.ts`)

`buildInspectResult(state, x, y, radius): InspectResult`

- Uses Chebyshev distance (square radius) for area queries
- Radius capped at 10 for performance
- Returns tiles, dwarves, buildings, jobs in area

## Files

| File | Purpose |
|------|---------|
| `scenarios/fortress/types.ts` | FortressSummary, DwarfStatus, InspectResult, TileInfo, BuildingInfo, JobInfo |
| `ipc/types.ts` | ControllerMessage (screenshot, inspect, getSummary with format), CanvasMessage |
| `canvases/fortress.tsx` | IPC handlers for all query types |
| `lib/screenshot.ts` | PNG rendering with coordinate grid |
| `lib/markdown-formatter.ts` | Markdown summary output |
| `lib/fortress-sim/inspect.ts` | Spatial query builder |
| `cli.ts` | CLI commands: query, screenshot, inspect |
