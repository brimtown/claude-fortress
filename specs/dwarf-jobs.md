---
title: Dwarf Jobs
date: 2026-01-12
status: implemented
dependencies: [dwarf-movement, fortress-production, resource-gathering]
---

# Dwarf Jobs

The job system manages work designations and task assignment for dwarves.

## Job Types

```typescript
type JobType = "dig" | "chop" | "build" | "haul" | "produce";
```

| Type | Description | Required Labor | Notes |
|------|-------------|----------------|-------|
| `dig` | Mine wall tiles | `mining` | Dwarf works from adjacent tile |
| `chop` | Fell trees | `woodcutting` | Dwarf works from adjacent tile |
| `build` | Construct buildings | `carpentry` | Dwarf works at exact location |
| `produce` | Workshop/farm output | varies | Auto-queued by buildings |
| `haul` | Move items to stockpile | `hauling` | Phase-based, see [resource-gathering](./resource-gathering.md) |

## Job Structure

```typescript
interface Job {
  id: number;
  type: "dig" | "chop" | "build" | "haul" | "produce";
  x: number;
  y: number;
  progress: number;           // 0-100
  requiredLabor: Labor;
  assignedDwarfId?: number;

  // Build jobs
  buildingType?: "workshop" | "stockpile" | "bed" | "farm";
  buildingSubtype?: string;

  // Production jobs
  outputType?: "food" | "drink";
  outputQuantity?: number;    // Default: 5

  // Haul jobs
  targetX?: number;           // Stockpile destination
  targetY?: number;
  itemId?: number;            // Item being hauled
  phase?: "pickup" | "carry"; // Current haul phase
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Work rate | 12 per tick | Progress increment when working |
| Grief penalty | 50% | Work rate halved while grieving |
| Completion threshold | 100 | Job completes at this progress |
| Pathing timeout | 40 ticks | Job abandoned if dwarf can't reach |

## Job Assignment

### Eligibility Rules
1. Dwarf must be alive
2. Dwarf must not have critical needs (hunger/thirst > 90)
3. Dwarf's labor must match `requiredLabor`
4. Job must not already be assigned
5. Job must be accessible (dig/chop only)

### Accessibility Check (Dig/Chop Jobs)

Dig and chop jobs require adjacency to walkable tile:
- Checks 8 directions (cardinal + diagonal)
- At least one neighbor must be walkable (`floor`, `grass`, etc.)
- Inaccessible jobs remain in queue until reachable

```typescript
function isJobAccessible(state, x, y): boolean {
  for (const [dx, dy] of directions) {
    const neighbor = state.map[y + dy]?.[x + dx];
    if (neighbor?.type === "floor" || neighbor?.type === "grass" || neighbor?.dug) {
      return true;
    }
  }
  return false;
}
```

### Location Check

```typescript
// Dig/chop jobs: dwarf must be adjacent (can't stand on wall/tree)
if (job.type === "dig" || job.type === "chop") {
  return Math.abs(dwarf.x - job.x) <= 1 &&
         Math.abs(dwarf.y - job.y) <= 1 &&
         !(dwarf.x === job.x && dwarf.y === job.y);
}

// Haul jobs: depends on phase
if (job.type === "haul") {
  if (job.phase === "pickup") {
    // At or adjacent to item
    return Math.abs(dwarf.x - job.x) <= 1 && Math.abs(dwarf.y - job.y) <= 1;
  } else {
    // At stockpile
    return dwarf.x === job.targetX && dwarf.y === job.targetY;
  }
}

// Other jobs: dwarf must be at exact location
return dwarf.x === job.x && dwarf.y === job.y;
```

## Job Lifecycle

### 1. Creation

**Dig/Chop Jobs:**
- Created via `designate` command
- All valid tiles in area get jobs (DF-style mass designation)
- Already-designated tiles are skipped

**Build Jobs:**
- Created when construction is ordered
- Resources consumed on command (not completion)

**Production Jobs:**
- Auto-created every 20 ticks for workshops/farms
- Tracked via `building.activeJobId`

**Haul Jobs:**
- Auto-created when items on ground + matching stockpile exists
- See [resource-gathering](./resource-gathering.md) for details

### 2. Assignment

```
updateJobs() called each tick
  → For each idle dwarf with matching labor
    → Find unassigned, accessible job
    → Set job.assignedDwarfId = dwarf.id
    → Set dwarf.currentJob = job
    → Set dwarf.currentTask = task name
    → Set dwarf.pathingTicks = 0
```

Task names: `mining`, `chopping`, `building`, `hauling`, `producing`

### 3. Execution

- Dwarf pathfinds to job location
- Once at location, progress increments 12 per tick (6 if grieving)
- Work continues until progress >= 100
- Haul jobs use phase transitions instead of progress

### 4. Completion

**Dig:**
- Tile type changes to `floor`, `tile.dug = true`
- Stone item spawns at location (hauled to stockpile for +1 stone)
- Special resources (iron, gold, copper) trigger strike event

**Chop:**
- Tile type changes to `grass`
- Log item spawns at location
- "Tree felled" event

**Build:**
- Tile type changes to building type
- Building added to `state.buildings`
- Completion event created

**Produce:**
- Resources added (quantity from `outputQuantity`, default 5)
- `building.activeJobId` cleared
- Harvest/production event created

**Haul:**
- Item removed from `state.items`
- Resource added based on item type
- Job removed from queue

### 5. Cancellation

Jobs are cancelled when:
- Dwarf enters critical need state (hunger/thirst > 90)
- Dwarf dies
- Dwarf enters strange mood
- Dwarf's labor is reassigned
- Pathing timeout reached (40 ticks)

```typescript
function cancelJob(dwarf: Dwarf, state?: FortressState): void {
  if (dwarf.currentJob) {
    const job = dwarf.currentJob;

    // Drop carried item if hauling
    if (dwarf.carriedItem !== undefined && state) {
      const item = state.items.find(i => i.id === dwarf.carriedItem);
      if (item) {
        item.x = dwarf.x;
        item.y = dwarf.y;
        item.carriedBy = undefined;
      }
      dwarf.carriedItem = undefined;

      // Remove haul job entirely (fresh one created next tick)
      if (job.type === "haul") {
        state.jobs.splice(state.jobs.indexOf(job), 1);
      }
    }

    job.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
    dwarf.currentTask = undefined;
    dwarf.pathingTicks = undefined;
  }
}
```

### 6. Abandonment

Dwarves track `pathingTicks` - ticks spent trying to reach a job:
- Reset to 0 when job assigned or dwarf reaches location
- Incremented each tick while dwarf has job but isn't at location
- After 40 ticks, job is cancelled with warning event

This prevents dwarves from being stuck forever on unreachable jobs.

## IPC Commands

### Designate Command (Replaces Dig)

```json
{
  "type": "command",
  "command": {
    "type": "designate",
    "designation": "dig",
    "area": { "x": 15, "y": 5, "width": 10, "height": 5 }
  }
}
```

Creates jobs for valid tiles in the area:
- `dig`: Creates dig jobs for wall tiles
- `chop`: Creates chop jobs for tree tiles

### Build Command

```json
{
  "type": "command",
  "command": {
    "type": "build",
    "structure": "workshop",
    "subtype": "still",
    "location": { "x": 5, "y": 5 }
  }
}
```

### Cancel Command

```json
{
  "type": "command",
  "command": {
    "type": "cancel",
    "area": { "x": 15, "y": 5, "width": 10, "height": 5 }
  }
}
```

Removes unassigned dig and chop jobs in the area.

## Files

| File | Purpose |
|------|---------|
| `jobs.ts` | Job creation, assignment, completion, cancellation |
| `engine.ts` | Command handling, haul job auto-creation |
| `types.ts` | Job interface definition |
