---
title: Death System
date: 2026-01-11
status: implemented
---

# Death System

Dwarves can now die from starvation and dehydration, creating real stakes and enabling the "losing is fun" experience.

## Mechanics

### Starvation
- Triggers when `hunger > 90` and no food available
- Increments `starvationTicks` counter each tick
- Death occurs after 100 consecutive ticks (~50 seconds)
- Resets if dwarf successfully eats

### Dehydration
- Triggers when `thirst > 90` and no drink available
- Increments `dehydrationTicks` counter each tick
- Death occurs after 100 consecutive ticks (~50 seconds)
- Resets if dwarf successfully drinks

### Death Causes
```typescript
type DeathCause = "starvation" | "dehydration" | "insanity" | "berserk_attack";
```

## Dwarf State

New fields on `Dwarf`:
```typescript
alive: boolean;               // Default true
starvationTicks?: number;     // Counter
dehydrationTicks?: number;    // Counter
deathCause?: DeathCause;
deathTick?: number;
```

## Visual Representation

- Dead dwarves render as `†` (red) on the map
- Corpses remain at death location
- Header shows `Deaths: N` when > 0

## Statistics Tracking

```typescript
statistics: {
  deaths: number;
  deathsByStarvation: number;
  deathsByDehydration: number;
  deathsByInsanity: number;
  deathsByBerserk: number;
  peakPopulation: number;
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Critical threshold | 90 | Hunger/thirst level triggering death countdown |
| Death countdown | 100 ticks | Consecutive critical ticks before death (~50 seconds) |
| Warning interval | 50 ticks | How often starving/dehydrating warnings appear |

## Corpse Behavior

- Corpse remains at death location (x, y preserved)
- Rendered as `†` (red) on the map
- Dead dwarves excluded from job assignment
- Dead dwarves excluded from movement updates
- Current job cancelled on death (`currentJob` cleared)

## Files Modified

- `types.ts` - Death fields, DeathCause type
- `dwarf.ts` - `killDwarf()`, `getLivingDwarfCount()`
- `engine.ts` - Death checks in `processTick()`
- `fortress.tsx` - Corpse rendering
- `events.ts` - Death event messages
- `jobs.ts`, `movement.ts` - Skip dead dwarves
