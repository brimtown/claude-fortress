---
title: Dwarf Movement
date: 2026-01-12
status: implemented
dependencies: [dwarf-jobs, dwarf-moods]
---

# Dwarf Movement

Dwarves navigate the fortress using simple greedy pathfinding, moving toward jobs or wandering when idle.

## Walkable Tiles

Dwarves can walk on:
- `grass` - Outdoor surface
- `floor` - Dug out areas
- `workshop` - Workshop buildings
- `stockpile` - Storage areas
- `bed` - Sleeping quarters
- `farm` - Agricultural plots
- `soil` - Farmable ground

Dwarves cannot walk through:
- `wall` - Solid stone
- `water` - Ponds/rivers
- `tree` - Surface vegetation

## Movement Directions

Movement checks 8 directions (cardinal + diagonal):
```typescript
const directions = [
  { dx: -1, dy: 0 },   // left
  { dx: 1, dy: 0 },    // right
  { dx: 0, dy: -1 },   // up
  { dx: 0, dy: 1 },    // down
  { dx: -1, dy: -1 },  // diagonal up-left
  { dx: 1, dy: -1 },   // diagonal up-right
  { dx: -1, dy: 1 },   // diagonal down-left
  { dx: 1, dy: 1 },    // diagonal down-right
];
```

## Pathfinding Algorithm

Uses greedy best-first search with Manhattan distance:

```typescript
function moveToward(state, dwarf, targetX, targetY): void {
  const walkable = getWalkableTiles(state, dwarf.x, dwarf.y);
  if (walkable.length === 0) return;

  // Find walkable tile closest to target
  let best = walkable[0];
  let bestDist = distance(best.x, best.y, targetX, targetY);

  for (const tile of walkable) {
    const dist = distance(tile.x, tile.y, targetX, targetY);
    if (dist < bestDist) {
      best = tile;
      bestDist = dist;
    }
  }

  dwarf.x = best.x;
  dwarf.y = best.y;
}

function distance(x1, y1, x2, y2): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);  // Manhattan
}
```

## Movement Priority

Dwarf movement follows this priority order:

### 1. Dead Dwarves
- Skip all movement (remain at death location as corpse)

### 2. Mood Dwarves
- Handled by moods system, not regular movement
- Berserk: paths toward nearest living dwarf
- Working mood: paths to claimed workshop

### 3. Critical Needs (hunger/thirst > 90)
- If food available: path to nearest stockpile
- If drink available: path to water or stockpile

### 4. Assigned Job
- Path to job location
- Stay put once at location (job system handles work)

### 5. Idle (No Job)
- Random wandering with 30% move chance
- 70% chance to stay in place

## Movement Rate

```typescript
function updateAllDwarfMovement(state): void {
  for (const dwarf of state.dwarves) {
    if (!dwarf.alive) continue;
    if (dwarf.moodState && dwarf.moodState !== "normal") continue;

    // Working dwarves always try to move
    // Idle dwarves have 30% chance to wander
    if (dwarf.currentJob || Math.random() < 0.3) {
      updateDwarfMovement(state, dwarf);
    }
  }
}
```

## Wandering Behavior

Idle dwarves wander randomly:

```typescript
function wander(state, dwarf): void {
  const walkable = getWalkableTiles(state, dwarf.x, dwarf.y);
  if (walkable.length === 0) return;

  // 70% chance to move, 30% to stay put
  if (Math.random() < 0.7) {
    const randomTile = walkable[Math.floor(Math.random() * walkable.length)];
    dwarf.x = randomTile.x;
    dwarf.y = randomTile.y;
  }
}
```

## Special Movement Cases

### Berserk Dwarves
Handled in `moods.ts`, not `movement.ts`:
- Find nearest living dwarf
- Move one step toward target each tick
- Attack when adjacent (distance <= 1)

### Mood-Struck Dwarves
Also handled in `moods.ts`:
- Path toward claimed workshop
- Check walkability before moving
- Stop when within 1 tile of workshop

## Limitations

Current implementation is intentionally simple:
- No A* or Dijkstra (greedy only)
- No pathfinding around obstacles
- May get stuck in concave areas
- Sufficient for 40x20 map size

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Idle move chance | 30% | Probability idle dwarf moves |
| Wander move chance | 70% | When wandering, probability to actually move |
| Movement per tick | 1 tile | Dwarves move one tile per update |

## Files

- `movement.ts` - Core movement logic (~201 lines)
- `moods.ts` - Mood-specific movement (berserk, working)
- `map.ts` - `MAP_WIDTH`, `MAP_HEIGHT` constants
