---
title: Fortress Map
date: 2026-01-19
status: implemented
dependencies: []
---

# Fortress Map

Procedural map generation creates a Dwarf Fortress-style embark site with outdoor surface area and mountainside for digging.

## Map Dimensions

| Constant | Value | Description |
|----------|-------|-------------|
| `MAP_WIDTH` | 40 | Horizontal tiles |
| `MAP_HEIGHT` | 20 | Vertical tiles |

## Map Layout

```
┌────────────────────────────────────────┐
│ Outdoor (grass, trees, water)  │ Mountain (wall) │
│ Upper-left corner, ~1/4 width  │ Ore veins, lake │
│ Organic wavy edge →            │                 │
├────────────────────────────────┤                 │
│ ← Mountain expands             │                 │
│   Bottom 9 rows: all mountain  │                 │
└────────────────────────────────────────┘
```

## Tile Types

| Tile | Char | Walkable | Description |
|------|------|----------|-------------|
| `grass` | `,` | Yes | Outdoor surface |
| `tree` | `♣` | No | Forest vegetation |
| `water` | `~` | No | Ponds, streams, underground lakes |
| `wall` | `#` | No | Solid stone (diggable) |
| `floor` | `.` | Yes | Dug out area |
| `workshop` | `X` | Yes | Production building |
| `stockpile` | `≈` | Yes | Storage area |
| `bed` | `=` | Yes | Sleeping quarters |
| `farm` | `%` | Yes | Agricultural plot |
| `soil` | `·` | Yes | Farmable ground |
| `door` | `+` | Yes | Passage |
| `corpse` | `†` | Yes | Dead dwarf remains |

## Mountain Edge Algorithm

The mountain edge uses layered sine waves for an organic, non-rectangular boundary:

```typescript
function getMountainEdge(y: number, rng: Random): number {
  // Bottom 9 rows (y >= 11) are all mountain
  if (y >= 11) {
    return 0;
  }

  // Outdoor area shrinks as we go down
  // y=0-6: full outdoor width, y=7-10: progressively narrower
  const baseEdge = y <= 6 ? 11 : Math.max(4, 11 - (y - 6) * 2);

  // Layered waves for organic feel
  const wave1 = Math.sin(y * 0.5) * 2;
  const wave2 = Math.sin(y * 0.3 + 1) * 1.5;
  const noise = (rng.next() - 0.5) * 1.5;

  return Math.max(0, Math.round(baseEdge + wave1 + wave2 + noise));
}
```

## Generation Phases

### 1. Base Terrain

Initialize all tiles based on mountain edge:
- Left of edge: `grass`
- Right of edge: `wall`

### 2. Outdoor Features

| Feature | Count | Placement |
|---------|-------|-----------|
| Trees (main) | 18-26 | Upper rows (y < 11), favor left side |
| Trees (copse) | 6-10 | y=8-10, x=0-5 (dense cluster) |
| Water source | 1 | Stream/pond at y=2-7, x=1-3 (irregular shape) |

### 3. Transition Zone

Scattered boulders (8-12) placed 1-4 tiles before mountain edge, giving a natural rocky transition.

### 4. Mountain Interior

| Feature | Count | Placement | Details |
|---------|-------|-----------|---------|
| Ore veins | 5-7 | Deep in mountain | Clustered deposits, 3-5 tiles each |
| Underground lake | 1 | x=20-31 | 4-5 wide × 3-4 tall, irregular edges |

### Ore Distribution

| Ore Type | Minimum X | Notes |
|----------|-----------|-------|
| Iron | 15 | Common, shallower |
| Copper | 15 | Common, shallower |
| Gold | 28 | Rare, deep only |

## Random Number Generator

Uses Linear Congruential Generator (LCG) for deterministic seeding:

```typescript
class Random {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}
```

Same seed produces identical map layout.

## Dwarf Spawn Positions

Dwarves spawn in outdoor area in a 3×3 grid:

```typescript
const x = 2 + (i % 3) * 2;           // x: 2, 4, 6
const y = 3 + Math.floor(i / 3) * 2; // y: 3, 5, 7
```

7 dwarves spawn at: (2,3), (4,3), (6,3), (2,5), (4,5), (6,5), (2,7)

## Tile Resources

Wall tiles can have ore resources:

```typescript
interface Tile {
  type: TileType;
  resource?: "iron" | "gold" | "copper";
  dug?: boolean;  // true after mining
}
```

When a wall with ore is mined, the resource is collected.

## Files

- `map.ts` - Map generation (~250 lines)
- `types.ts` - `Tile`, `TileType` definitions
