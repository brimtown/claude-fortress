---
title: Fortress Migration
date: 2026-01-14
status: implemented
dependencies: [dwarf-death]
---

# Fortress Migration

Replaces random migration with wealth-based system. Prosperous fortresses attract migrants; dangerous ones repel them.

## Design Philosophy

In Dwarf Fortress, migration is tied to fortress wealth reported by caravans. Fortresses with recent deaths gain a dangerous reputation that deters migrants. This creates a feedback loop: struggling fortresses get fewer reinforcements.

## Current System (to replace)

```typescript
// 0.1% chance per tick (~once every 500 ticks / 4 minutes)
if (rand < 0.001) {
  const count = 1 + Math.floor(Math.random() * 3); // 1-3 migrants
  // ... spawn migrants
}
```

Problems:
- Completely random, no connection to fortress state
- Migrants arrive even after mass deaths
- No feedback loop with prosperity

## 1. Wealth Calculation

Simple formula:

```typescript
function calculateWealth(state: FortressState): number {
  let wealth = 0;

  // Resources (1 point each)
  wealth += state.resources.wood;
  wealth += state.resources.stone;
  wealth += state.resources.food;
  wealth += state.resources.drink;

  // Buildings (10 points each)
  wealth += state.buildings.length * 10;

  // Artifacts (100 points each)
  wealth += (state.statistics.artifactsCreated || 0) * 100;

  // Living population (20 points each)
  wealth += getLivingDwarfCount(state.dwarves) * 20;

  return wealth;
}
```

### Wealth Breakdown

| Source | Points | Notes |
|--------|--------|-------|
| Resources | 1 each | wood, stone, food, drink |
| Buildings | 10 each | workshops, stockpiles, beds, farms |
| Artifacts | 100 each | from successful strange moods |
| Living dwarves | 20 each | population itself is wealth |

### Starting Wealth Example
- 7 dwarves: 140
- 20 wood, 10 stone, 100 food, 20 drink: 150
- 0 buildings, 0 artifacts: 0
- **Total: 290** (just under tier 2)

## 2. Migration Check

Replace per-tick random with interval-based wealth check:

```typescript
// Every 500 ticks (~4 minutes)
if (state.tick % 500 === 0) {
  processMigration(state);
}
```

### Migration Logic

```typescript
function processMigration(state: FortressState): void {
  const wealth = calculateWealth(state);
  const livingCount = getLivingDwarfCount(state.dwarves);
  const recentDeaths = getRecentDeathCount(state, 500); // deaths in last 500 ticks

  // No one to welcome migrants
  if (livingCount === 0) return;

  // Dangerous reputation blocks migrants
  if (recentDeaths >= 2) {
    createEvent(state, "migration",
      "Migrants refused to journey to such a dangerous fortress.");
    return;
  }

  // Wealth tiers determine migrant count
  let migrantCount = 0;
  if (wealth >= 600) {
    migrantCount = 1 + Math.floor(Math.random() * 3); // 1-3
  } else if (wealth >= 300) {
    migrantCount = 1 + Math.floor(Math.random() * 2); // 1-2
  } else if (wealth >= 100) {
    migrantCount = 1;
  } else {
    createEvent(state, "migration",
      "The fortress attracted no migrants this season.");
    return;
  }

  // Spawn migrants
  for (let i = 0; i < migrantCount; i++) {
    const labor = randomLabor();
    const newDwarf = createDwarf(5, 3, labor);
    state.dwarves.push(newDwarf);
  }

  // Event message
  if (migrantCount === 1) {
    createEvent(state, "migration", "A migrant has arrived.");
  } else {
    createEvent(state, "migration", `A group of ${migrantCount} migrants have arrived.`);
  }
}
```

### Recent Deaths Helper

```typescript
function getRecentDeathCount(state: FortressState, windowTicks: number): number {
  const cutoff = state.tick - windowTicks;
  return state.dwarves.filter(d =>
    !d.alive && d.deathTick && d.deathTick >= cutoff
  ).length;
}
```

## 3. Wealth Tiers

| Tier | Wealth | Migrants | Description |
|------|--------|----------|-------------|
| 0 | < 100 | 0 | Struggling, no attraction |
| 1 | 100-299 | 1 | Modest, occasional migrant |
| 2 | 300-599 | 1-2 | Prosperous, steady growth |
| 3 | 600+ | 1-3 | Wealthy, strong attraction |

## 4. Migration Blocking

### Death Reputation
- 2+ deaths in last 500 ticks blocks all migration
- Message: "Migrants refused to journey to such a dangerous fortress."
- Resets naturally as time passes without deaths

### Zero Population
- No migrants if no living dwarves (no one to greet them)
- Silent - no message needed (fortress is fallen anyway)

## 5. Messages

| Condition | Message |
|-----------|---------|
| Low wealth (< 100) | "The fortress attracted no migrants this season." |
| Recent deaths (>= 2) | "Migrants refused to journey to such a dangerous fortress." |
| 1 migrant | "A migrant has arrived." |
| 2+ migrants | "A group of {n} migrants have arrived." |

## 6. Constants

| Constant | Value | Description |
|----------|-------|-------------|
| MIGRATION_INTERVAL | 500 ticks | Check frequency (~4 min) |
| DEATH_WINDOW | 500 ticks | How far back to count deaths |
| DEATH_THRESHOLD | 2 | Deaths that block migration |
| WEALTH_TIER_1 | 100 | Minimum for any migrants |
| WEALTH_TIER_2 | 300 | Threshold for 1-2 migrants |
| WEALTH_TIER_3 | 600 | Threshold for 1-3 migrants |
| WEALTH_PER_RESOURCE | 1 | Points per resource unit |
| WEALTH_PER_BUILDING | 10 | Points per building |
| WEALTH_PER_ARTIFACT | 100 | Points per artifact |
| WEALTH_PER_DWARF | 20 | Points per living dwarf |

## 7. New State Fields

```typescript
interface FortressState {
  // ... existing fields ...
  wealth: number;  // Cached, updated each migration check
}
```

## 8. Files to Modify

| File | Changes |
|------|---------|
| `types.ts` | Add `wealth` to FortressState |
| `engine.ts` | Replace random migration with `processMigration()` |
| `dwarf.ts` | Add `calculateWealth()`, `getRecentDeathCount()` |
| `fortress.tsx` | Display wealth in header |

## 9. Gameplay Impact

### Early Game
- Starting wealth ~290, just under tier 2
- First migrants arrive after building a workshop or farm (+10 wealth)
- Encourages active play to attract migrants

### Mid Game
- Each artifact (+100) significantly boosts migration
- Building infrastructure pays off with steady population growth

### Death Spiral Connection
- Deaths reduce wealth (-20 per dwarf lost)
- Recent deaths block migrants entirely
- Struggling fortress gets no reinforcements
- Connects to fortress-losing grief spiral

## 10. UI Addition

Show wealth in resource bar:
```
Wood: 20  Stone: 15  Food: 80  Drink: 50  Wealth: 345
```

Color coding:
- Red: < 100 (no migrants)
- Yellow: 100-299 (tier 1)
- White: 300-599 (tier 2)
- Green: 600+ (tier 3)

## References

- [Dwarf Fortress Wiki: Immigration](https://dwarffortresswiki.org/index.php/Immigration)
- [Dwarf Fortress Wiki: Wealth](https://dwarffortresswiki.org/index.php/Wealth)
