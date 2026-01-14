---
title: Fortress Losing
date: 2026-01-14
status: implemented
dependencies: [dwarf-death, dwarf-moods]
---

# Fortress Losing

Implements the "losing is fun" endgame: grief spirals, tantrum cascades, and fortress collapse.

## Design Philosophy

> "Your fortress has crumbled to its end..."

Death creates grief, grief creates unhappiness, unhappiness creates more death. The spiral is self-reinforcing but not guaranteed - good management can recover from losses.

## 1. Fortress Collapse (Game Over)

### Trigger
- All dwarves dead (`getLivingDwarfCount() === 0`)
- Checked each tick after processing deaths

### End Screen Modal
Display centered modal overlay:

```
╔══════════════════════════════════════╗
║   YOUR FORTRESS HAS CRUMBLED...      ║
║                                      ║
║   "{fortressName}" has fallen.       ║
║                                      ║
║   Survived: {years}y {seasons}       ║
║   Peak Population: {peak}            ║
║   Total Deaths: {deaths}             ║
║     - Starvation: {n}                ║
║     - Dehydration: {n}               ║
║     - Insanity: {n}                  ║
║     - Berserk: {n}                   ║
║   Artifacts Created: {n}             ║
║                                      ║
║   Press any key to close...          ║
╚══════════════════════════════════════╝
```

### State Changes
- Set `state.fallen = true`
- Set `state.paused = true`
- Stop tick processing
- IPC message: `{ type: "fortress_fallen", statistics }`

## 2. Grief System (Tantrum Spiral)

### Mechanic
When a dwarf dies, ALL living dwarves experience grief. Unhappy dwarves can snap into destructive states.

### Grief on Death
```typescript
function applyGrief(state: FortressState, deadDwarf: Dwarf): void {
  const livingDwarves = state.dwarves.filter(d => d.alive && d.id !== deadDwarf.id);

  for (const dwarf of livingDwarves) {
    // Base grief: -15 to -25 happiness
    const griefAmount = 15 + Math.floor(Math.random() * 11);
    dwarf.happiness = Math.max(0, dwarf.happiness - griefAmount);
    dwarf.griefTicks = (dwarf.griefTicks || 0) + 200; // 200 ticks of grieving
  }
}
```

### Grief Recovery
- Grief fades at +1 happiness per 10 ticks (slow recovery)
- `griefTicks` decrements each tick; while > 0, dwarf is "grieving"
- Grieving dwarves work 50% slower (job progress halved)

### Tantrum Check
Each tick, for dwarves with happiness < 20:

```typescript
// 0.5% chance per tick to snap when very unhappy
if (dwarf.happiness < 20 && Math.random() < 0.005) {
  // 50% berserk, 50% melancholic (reuse existing mood states)
  if (Math.random() < 0.5) {
    dwarf.moodState = "berserk";
    createEvent(state, "tantrum", `${dwarf.name} has gone berserk from grief!`);
  } else {
    dwarf.moodState = "melancholic";
    createEvent(state, "tantrum", `${dwarf.name} has fallen into despair.`);
  }
}
```

### Cascade Potential
- Death → grief (-20 avg happiness) → some dwarves drop below 20 → tantrum chance
- Berserk dwarf kills another → more grief → more tantrums
- This IS the spiral - self-reinforcing but not guaranteed

## 3. New Fields

### Dwarf
```typescript
interface Dwarf {
  // ... existing fields ...
  griefTicks?: number;        // Ticks remaining in grief state
}
```

### FortressState
```typescript
interface FortressState {
  // ... existing fields ...
  fallen: boolean;            // True when fortress has collapsed
}
```

## 4. Constants

| Constant | Value | Description |
|----------|-------|-------------|
| GRIEF_MIN | 15 | Minimum happiness lost on death |
| GRIEF_MAX | 25 | Maximum happiness lost on death |
| GRIEF_DURATION | 200 ticks | How long grief affects work speed |
| GRIEF_WORK_PENALTY | 0.5 | Work speed multiplier while grieving |
| GRIEF_RECOVERY_RATE | 10 | Ticks per +1 happiness recovery |
| TANTRUM_THRESHOLD | 20 | Happiness below which tantrums possible |
| TANTRUM_CHANCE | 0.005 | Per-tick chance of snapping (0.5%) |

## 5. Event Types

New event types:
```typescript
type EventType =
  | ... existing ...
  | "tantrum"           // Dwarf snapped from grief
  | "fortress_fallen"   // Game over
```

## 6. Files to Modify

| File | Changes |
|------|---------|
| `types.ts` | Add `fallen` to state, `griefTicks` to Dwarf, new event types |
| `dwarf.ts` | Add `applyGrief()`, modify `killDwarf()` to trigger grief |
| `engine.ts` | Add collapse check, grief recovery, tantrum processing |
| `fortress.tsx` | Add end-game modal overlay |
| `jobs.ts` | Apply grief work penalty to job progress |

## 7. Gameplay Flow

### Healthy Fortress
- Deaths are rare
- Grief recovers before stacking
- Happiness stays above tantrum threshold

### Death Spiral
1. Multiple deaths in quick succession (resource shortage, berserk attack)
2. Grief stacks faster than it recovers
3. Multiple dwarves drop below happiness 20
4. Tantrums trigger → berserk attacks or melancholic starvation
5. Each new death adds more grief to survivors
6. "Your fortress has crumbled to its end..."

## 8. UI Indicators

### Grief Indicator
Grieving dwarves render as `😢` on map (or dim color).

### Crisis Warning
When 2+ dwarves below happiness 20, show in event log:
```
⚠ {n} dwarves are on the verge of breakdown!
```

## References

- [Dwarf Fortress Wiki: Losing](https://dwarffortresswiki.org/index.php/Losing)
- [Dwarf Fortress Wiki: Tantrum Spiral](https://dwarffortresswiki.org/index.php/Tantrum_spiral)
