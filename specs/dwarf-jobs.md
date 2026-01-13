---
title: Dwarf Jobs
date: 2026-01-12
status: implemented
dependencies: [dwarf-movement, fortress-production]
---

# Dwarf Jobs

The job system manages work designations and task assignment for dwarves.

## Job Types

```typescript
type JobType = "dig" | "build" | "haul" | "produce";
```

| Type | Description | Required Labor | Notes |
|------|-------------|----------------|-------|
| `dig` | Mine wall tiles | `mining` | Dwarf works from adjacent tile |
| `build` | Construct buildings | `carpentry` | Dwarf works at exact location |
| `produce` | Workshop/farm output | varies | Auto-queued by buildings |
| `haul` | Move items | `hauling` | Not fully implemented |

## Job Structure

```typescript
interface Job {
  id: number;
  type: "dig" | "build" | "haul" | "produce";
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
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Work rate | 10% per tick | Progress increment when working |
| Completion threshold | 100 | Job completes at this progress |
| Ticks to complete | ~10 | Standard job completion time |

## Job Assignment

### Eligibility Rules
1. Dwarf must be alive
2. Dwarf must not have critical needs (hunger/thirst > 90)
3. Dwarf's labor must match `requiredLabor`
4. Job must not already be assigned

### Accessibility Check (Dig Jobs Only)
Dig jobs require adjacency to existing floor:
- Checks 8 directions (cardinal + diagonal)
- At least one neighbor must be `floor` or `dug: true`
- Inaccessible jobs remain in queue until reachable

```typescript
function isJobAccessible(state, x, y): boolean {
  // Check all 8 neighbors
  for (const [dx, dy] of directions) {
    const neighbor = state.map[y + dy]?.[x + dx];
    if (neighbor?.type === "floor" || neighbor?.dug) {
      return true;
    }
  }
  return false;
}
```

### Location Check

```typescript
// Dig jobs: dwarf must be adjacent (can't stand on wall)
if (job.type === "dig") {
  return Math.abs(dwarf.x - job.x) <= 1 &&
         Math.abs(dwarf.y - job.y) <= 1 &&
         !(dwarf.x === job.x && dwarf.y === job.y);
}

// Other jobs: dwarf must be at exact location
return dwarf.x === job.x && dwarf.y === job.y;
```

## Job Lifecycle

### 1. Creation

**Dig Jobs:**
- Created via `dig` command for wall tiles
- All walls in designated area get jobs (DF-style mass designation)
- Already-designated tiles are skipped

**Build Jobs:**
- Created when construction is ordered
- Resources consumed on command (not completion)

**Production Jobs:**
- Auto-created every 20 ticks for workshops/farms
- Tracked via `building.activeJobId`

### 2. Assignment
```
updateJobs() called each tick
  → For each idle dwarf with matching labor
    → Find unassigned, accessible job
    → Set job.assignedDwarfId = dwarf.id
    → Set dwarf.currentJob = job
    → Set dwarf.currentTask = "{type}ing"
```

### 3. Execution
- Dwarf pathfinds to job location
- Once at location, progress increments 10% per tick
- Work continues until progress >= 100

### 4. Completion

**Dig:**
- Tile type changes to `floor`
- `tile.dug = true`
- +1 stone added to resources
- Special resources trigger strike event

**Build:**
- Tile type changes to building type
- Building added to `state.buildings`
- Completion event created

**Produce:**
- Resources added (quantity from `outputQuantity`, default 5)
- `building.activeJobId` cleared
- Harvest/production event created

### 5. Cancellation
Jobs are cancelled when:
- Dwarf enters critical need state (hunger/thirst > 90)
- Dwarf dies
- Dwarf enters strange mood

```typescript
function cancelJob(dwarf: Dwarf): void {
  if (dwarf.currentJob) {
    dwarf.currentJob.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
    dwarf.currentTask = undefined;
  }
}
```

## IPC Commands

### Dig Command
```json
{
  "type": "command",
  "command": {
    "type": "dig",
    "area": { "x": 15, "y": 5, "width": 10, "height": 5 }
  }
}
```

Creates dig jobs for all wall tiles in the area. Dwarves will dig from outside-in as tiles become accessible.

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

## Files

- `jobs.ts` - Job creation, assignment, completion (~276 lines)
- `engine.ts` - Command handling, production auto-queue
- `types.ts` - Job interface definition
