---
title: Resource Gathering
date: 2026-01-21
status: implemented
dependencies: [dwarf-jobs, dwarf-movement]
---

# Resource Gathering

This spec covers the unified resource gathering system: mining, woodcutting, item dropping, and hauling. It replaces the previous instant-to-pool resource model with a physical item-based workflow.

## Implementation Status

### Implemented ✓
- Item system (types, state, rendering)
- Mining retrofit (spawns stone items instead of direct resource)
- Woodcutting (chop designation, woodcutting labor, log items)
- Hauling (auto-job creation, pickup/carry phases, item following)
- Unified `designate` command (replaces `dig`)
- MCP tool updates (`designate` tool, `woodcutting` labor)
- Starting dwarf labor distribution (includes 1 woodcutter)
- Item rendering in UI and screenshots
- Generic stockpiles (no subtype) accept all item types
- Labor reassignment clears current job/task
- Job abandonment after pathing timeout (40 ticks)
- Agent observability: summary includes items on ground, all job types

### Deferred
- **UI Designation Menu**: Press `d` to open menu (for human players)
- **UI Cursor Mode**: Arrow key area selection (for human players)
- Stockpile capacity limits (currently infinite)
- Wheelbarrows/minecarts for faster hauling

## Bugs Fixed During Implementation

### Haul Job Target Bug
**Problem**: During carry phase, dwarf pathfinding used `job.x/y` (item's original location) instead of `job.targetX/targetY` (stockpile).
**Fix**: `movement.ts` now checks for haul jobs in carry phase and targets stockpile.

### Items Not Following Dwarves
**Problem**: When dwarf picked up item and walked, item stayed at original position visually.
**Fix**: `movement.ts` updates `item.x/y` to match dwarf position after each move.

### Stockpile Subtype Matching
**Problem**: Stockpiles without subtype didn't match any items, breaking hauling.
**Fix**: Generic stockpiles (no subtype) now accept all item types as fallback.

### Cancelled Haul Jobs Corrupted
**Problem**: When haul job cancelled mid-carry (e.g., dwarf hungry), job kept `phase: "carry"` and stale coordinates. Next dwarf would walk to stockpile without item.
**Fix**: Cancelled haul jobs are removed entirely; `createHaulJobsForItems` creates fresh job for dropped item.

### Labor Reassignment Didn't Clear Task
**Problem**: Reassigning a dwarf's labor (e.g., woodcutter → miner) didn't cancel their current job, leaving them stuck showing old task like "chopping".
**Fix**: `handleAssignCommand` now calls `cancelJob(dwarf, state)` before changing labor.

### Dwarves Stuck on Unreachable Jobs
**Problem**: Dwarves assigned to jobs they couldn't path to would stay "stuck" indefinitely showing the task.
**Fix**: Added `pathingTicks` counter. After 40 ticks without reaching job, dwarf abandons with warning: "{name} cancelled {type} job: can't find path".

### Summary Missing Job Types
**Problem**: Agent query summary only showed dig/build/produce jobs, not chop/haul.
**Fix**: Markdown formatter now includes all job types and items on ground count.

## Design Goals

1. **Unified workflow**: Mining and woodcutting follow the same pattern: designate → work → drop item → haul → stockpile
2. **Visible feedback**: Dropped items appear on the map
3. **Hauling matters**: Haulers have meaningful work transporting items
4. **Stockpile purpose**: Items must reach matching stockpiles to become resources
5. **Unified designation command**: Single `designate` command with type parameter

## New Types

### Items

Items are physical objects on the map that must be hauled.

```typescript
interface Item {
  id: number;
  type: "stone" | "log";
  x: number;
  y: number;
  carriedBy?: number;  // Dwarf ID if being carried
}
```

| Type | Source | Display | Stockpile Type |
|------|--------|---------|----------------|
| `stone` | Mining walls | `*` (gray) | `stone` |
| `log` | Chopping trees | `±` (brown) | `wood` |

### Labor Types

Adds `woodcutting` as 6th labor:

```typescript
type Labor = "mining" | "woodcutting" | "carpentry" | "brewing" | "farming" | "hauling";
```

### Designation Types

```typescript
type DesignationType = "dig" | "chop";
```

Future extensions: `"gather"`, `"smooth"`, `"engrave"`

### Job Types

Adds `chop` job type:

```typescript
type JobType = "dig" | "chop" | "build" | "haul" | "produce";
```

## Designation System

### Unified Command

Replaces the old `dig` command with a unified `designate` command:

```typescript
interface DesignateCommand {
  type: "designate";
  designation: "dig" | "chop";
  area: { x: number; y: number; width: number; height: number };
}
```

### Designation Behavior

| Designation | Valid Tiles | Creates Job | Required Labor |
|-------------|-------------|-------------|----------------|
| `dig` | `wall` | `dig` job | `mining` |
| `chop` | `tree` | `chop` job | `woodcutting` |

Invalid tiles are silently skipped (e.g., designating `dig` over grass does nothing).

### Cancel Command

```typescript
interface CancelCommand {
  type: "cancel";
  area: { x: number; y: number; width: number; height: number };
}
```

Removes all unassigned `dig` and `chop` jobs in the area.

## Mining (Retrofit)

### Previous Behavior
- Dig job completes → tile becomes floor → +1 stone to global pool

### New Behavior
- Dig job completes → tile becomes floor → stone item spawns at tile location
- Stone item sits on ground until hauled
- Hauler picks up stone → walks to stone stockpile → +1 stone to global pool

## Woodcutting

### Chop Job

```typescript
interface Job {
  type: "chop";
  x: number;
  y: number;
  progress: number;
  requiredLabor: "woodcutting";
  assignedDwarfId?: number;
}
```

### Accessibility

Same as dig: job requires adjacency to walkable tile. Uses shared `isJobAccessible()` function.

### Completion

- Tree tile becomes `grass`
- Log item spawns at tile location
- Event: "Tree felled"

## Hauling

### Haul Job Structure

```typescript
interface Job {
  type: "haul";
  x: number;           // Item's current location
  y: number;
  targetX: number;     // Stockpile location
  targetY: number;
  itemId: number;      // The item to haul
  phase: "pickup" | "carry";
  requiredLabor: "hauling";
  assignedDwarfId?: number;
}
```

### Auto-Creation

Each tick, `createHaulJobsForItems()` checks for unhauled items and creates jobs if matching stockpile exists.

### Stockpile Matching

| Item Type | Preferred Stockpile | Fallback |
|-----------|---------------------|----------|
| `stone` | `subtype: "stone"` | Generic (no subtype) |
| `log` | `subtype: "wood"` | Generic (no subtype) |

Typed stockpiles are checked first. Generic stockpiles accept all item types.

### Haul Phases

**Pickup Phase:**
- Dwarf walks to item location
- `isAtJobLocation` returns true when dwarf is at/adjacent to `job.x, job.y`
- Pick up item: `item.carriedBy = dwarf.id`, `dwarf.carriedItem = item.id`
- Transition to `carry` phase

**Carry Phase:**
- Dwarf walks toward stockpile (`job.targetX, job.targetY`)
- Item moves with dwarf (updated in `movement.ts` after each step)
- When dwarf reaches stockpile: remove item, add to resources, complete job

### Job Cancellation

When a haul job is cancelled (e.g., dwarf gets hungry mid-carry):
- Item drops at dwarf's current location
- **Job is removed entirely** (not just unassigned)
- Fresh haul job created next tick for dropped item

## Job Abandonment

Dwarves track `pathingTicks` - how long they've been trying to reach a job:
- Reset to 0 when job assigned or dwarf reaches job location
- Incremented each tick while dwarf has job but isn't at location
- After `JOB_PATHING_TIMEOUT` (40 ticks), job is cancelled with warning event

This prevents dwarves from being stuck forever on unreachable jobs.

## Map Rendering

### Item Display

Items render on top of floor tiles:

```typescript
const itemHere = state.items.find(i => i.x === x && i.y === y && !i.carriedBy);
if (itemHere) {
  char = itemHere.type === "stone" ? "*" : "±";
  color = itemHere.type === "stone" ? "gray" : "#8B4513";
}
```

### Designation Display

Both dig and chop designations use same visual (dark yellow background).

### Legend

```
*=Stone  ±=Log  #=Rock  ♣=Tree  ~=Water
```

## Starting Dwarves

| Labor | Count | Purpose |
|-------|-------|---------|
| mining | 2 | Dig out fortress |
| woodcutting | 1 | Chop trees |
| carpentry | 1 | Build structures |
| brewing | 1 | Produce drink |
| farming | 1 | Produce food |
| hauling | 1 | Transport items |

## Agent Observability

### Summary Includes

The markdown summary now includes:

**Items on Ground section** (when items exist):
```
## Items on Ground
Stone: 3 | Logs: 2
```

**Full job breakdown**:
```
## Jobs
Dig: 2 | Chop: 1 | Build: 1 | Haul: 3 | Produce: 2
```

### MCP Tool: designate

```typescript
{
  name: "designate",
  description: "Designate an area for work. Use 'dig' for mining walls or 'chop' for felling trees.",
  inputSchema: {
    properties: {
      instance: { type: "string", default: "fortress-1" },
      designation: { type: "string", enum: ["dig", "chop"] },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number" },
      height: { type: "number" }
    },
    required: ["designation", "x", "y", "width", "height"]
  }
}
```

### MCP Tool: assign

Now accepts `woodcutting` as valid labor.

## State Changes

### FortressState

```typescript
interface FortressState {
  // ... existing fields
  items: Item[];
}
```

### Dwarf

```typescript
interface Dwarf {
  // ... existing fields
  carriedItem?: number;   // Item ID being carried
  pathingTicks?: number;  // Ticks spent trying to reach job
}
```

## Edge Cases

### No Matching Stockpile
- Items remain on ground indefinitely
- Haul jobs not created until stockpile exists

### Dwarf Gets Hungry/Thirsty While Carrying
- Item drops at dwarf's current location
- Haul job removed, fresh one created next tick

### Dwarf Dies While Carrying
- Item drops at death location
- New haul job auto-created next tick

### Multiple Items on Same Tile
- Allowed
- Render topmost item
- Each creates separate haul job

### Designating Mixed Area
- Invalid tiles silently skipped
- `dig` over grass/trees: ignored
- `chop` over walls/grass: ignored

### Unreachable Jobs
- Dwarf abandons after 40 ticks
- Warning event: "{name} cancelled {type} job: can't find path"
- Job becomes unassigned, may be picked up by another dwarf

## Testing

### Unit Tests (jobs.test.ts)
- `createChopJob` sets correct properties
- `createHaulJob` sets phases and targets
- `isAtJobLocation` handles adjacency for dig/chop
- `workOnHaulJob` phase transitions

### Simulation Tests (simulation.test.ts)
- Mining produces stone item (not direct resource)
- Complete dig→haul→stockpile workflow
- Chop designation creates jobs for trees
- Haul jobs created when stockpile exists
- Generic stockpile accepts all item types
- Labor reassignment clears task
- Dwarf abandons unreachable job
- Agent observability: job counts match state, items count accurate

### Markdown Formatter Tests (markdown-formatter.test.ts)
- Items on ground section appears when items exist
- All job types (dig, chop, build, haul, produce) in summary
- Inaccessible job count shown

## Files Modified

| File | Changes |
|------|---------|
| `types.ts` | Item, DesignationType, updated Labor/JobType/Dwarf |
| `jobs.ts` | createChopJob, createHaulJob, haul phases, pathingTicks, abandonment |
| `engine.ts` | handleDesignateCommand, createHaulJobsForItems, cancelJob on reassign |
| `dwarf.ts` | Starting labors, item drop on death |
| `movement.ts` | Haul job targeting, item following |
| `fortress.tsx` | Item rendering, job breakdown |
| `screenshot.ts` | Item rendering |
| `mcp-server.ts` | designate tool, woodcutting labor |
| `markdown-formatter.ts` | Items section, chop/haul in jobs |

## Deferred: UI Designation (Human Players)

The following features are deferred for future implementation:

### Designation Menu
- Press `d` to open menu
- Select designation type (dig, chop, cancel)
- ViewMode: `"designations"`

### Cursor Mode
- Arrow key area selection
- Enter to set anchor, Enter again to confirm
- Visual feedback: cursor highlight, selection rectangle
- ViewMode: `"designating"`
- State: `designationCursor` on FortressState
