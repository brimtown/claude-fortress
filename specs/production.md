---
title: Production System
date: 2026-01-11
status: implemented
---

# Production System

Workshops and farms generate resources, enabling survival through active management.

## Buildings

| Building | Subtype | Labor | Output |
|----------|---------|-------|--------|
| Workshop | `still` | brewing | +5 drink |
| Farm | `farm` | farming | +5 food |

## Job Type

```typescript
type: "produce"
outputType: "food" | "drink"
outputQuantity: number  // default 5
```

## Auto-Queue Logic

Every 20 ticks, the engine checks each production building:

1. Skip if `activeJobId` is set (job in progress)
2. Skip if existing production job at location
3. Create new production job
4. Set `building.activeJobId` to track

## Job Flow

1. Dwarf with matching labor assigned
2. Dwarf paths to building
3. Progress increments 10% per tick
4. At 100%: resources added, event created
5. `building.activeJobId` cleared

## Building Construction

### Still (Workshop)
- Command: `{ type: "build", structure: "workshop", subtype: "still", location }`
- Cost: 10 wood, 15 stone
- Requires floor tile

### Farm
- Command: `{ type: "build", structure: "farm", location }`
- Cost: free (just needs floor)
- Renders as `%` (green)

## Survival Loop

1. Build still and/or farm
2. Assign dwarves to brewing/farming labor
3. Production jobs auto-queue
4. Resources replenish
5. Dwarves don't starve

Without production, starting resources (~100 food, ~80 drink) deplete in ~200 ticks.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Auto-queue interval | 20 ticks | How often engine checks for new production jobs |
| Output quantity | 5 | Default resources produced per job |
| Progress rate | 10% per tick | Job completion speed |
| Ticks to complete | ~10 | Time from start to resource output |

## Job Structure

```typescript
interface ProductionJob extends Job {
  type: "produce";
  outputType: "food" | "drink";
  outputQuantity: number;      // Default: 5
  buildingSubtype: string;     // "still" | "farm"
}
```

## Building Costs

| Building | Wood | Stone | Notes |
|----------|------|-------|-------|
| Workshop (still) | 10 | 15 | Requires floor tile |
| Farm | 0 | 0 | Free, just needs floor |

## Files

- `types.ts` - `"produce"` job type, `"farm"` building/tile
- `jobs.ts` - `createProductionJob()`, production completion
- `engine.ts` - Auto-queue in `processTick()`
- `map.ts` - Farm tile rendering
