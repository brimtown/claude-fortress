---
title: Dwarf Moods
date: 2026-01-11
status: implemented
dependencies: [dwarf-death, fortress-production]
---

# Dwarf Moods

Dwarves can be struck by strange moods, claiming workshops to create legendary artifacts - or descending into madness if materials aren't provided.

## Trigger Conditions

- ~0.05% chance per tick (~once per 17 minutes)
- Requires at least one unclaimed workshop
- Unhappy dwarves 3-5x more likely to be struck
- Legendary dwarves are immune

## Mood Types

```typescript
type MoodState = "normal" | "fey" | "possessed" | "secretive" | "melancholic" | "berserk";
```

Note: `"normal"` or `undefined` both indicate no active mood.

| Mood | Description |
|------|-------------|
| `fey` | Struck by a fey mood |
| `possessed` | Has been possessed |
| `secretive` | Has become secretive |
| `melancholic` | Failed mood - refuses to eat/drink |
| `berserk` | Failed mood - attacks other dwarves |

## Mood Flow

### 1. Trigger
- Dwarf claims random workshop
- Demands 1-2 materials from: wood, stone, food
- Deadline set: 200 ticks (~100 seconds)

### 2. Working (if materials available)
- Dwarf paths to workshop
- Progress increments 2% per tick at workshop
- Consumes 5 of each demanded material

### 3. Success (progress reaches 100%)
- Legendary artifact created with generated name
- Dwarf becomes legendary (`isLegendary: true`)
- Happiness boosted to 100

### 4. Failure (deadline exceeded)
- 50% chance: `melancholic` - refuses food/drink, starves
- 50% chance: `berserk` - attacks nearest dwarf

## Berserk Behavior

- Paths toward nearest living dwarf
- Attacks when adjacent
- Victim dies (`deathCause: "berserk_attack"`)
- 50% chance attacker also dies in fight

## Artifact Names

Generated from components:
```
[Prefix] [Noun] [Suffix]
"Golden Scepter of Destiny"
"Dark Helm the Terrible"
```

## Dwarf State

```typescript
moodState?: MoodState;
claimedBuildingId?: number;
moodDemands?: string[];       // ["wood", "stone"]
moodProgress?: number;        // 0-100
moodStartTick?: number;
moodDeadline?: number;
artifactCreated?: string;
isLegendary?: boolean;
```

## Visual Representation

- Mood-struck dwarves render as `M` (magenta)
- Legend shows `M=Mood`

## Statistics

```typescript
moodsTriggered: number;
moodsSucceeded: number;
moodsFailed: number;
artifactsCreated: number;
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Trigger chance | 0.05% per tick | ~once per 17 minutes of real time |
| Deadline | 200 ticks | ~100 seconds to complete artifact |
| Progress rate | 2% per tick | ~50 ticks to complete if materials available |
| Material cost | 5 per demand | Each demanded material consumes 5 units |
| Unhappy weight | 3x | Happiness < 40 increases trigger chance |
| Very unhappy weight | 5x | Happiness < 20 increases trigger chance |
| Berserk/melancholic | 50/50 | Random outcome on failure |
| Attacker death | 50% | Chance berserk attacker dies in fight |

## Movement During Moods

Mood-struck dwarves use separate movement logic in `moods.ts`:

**Working moods (fey/possessed/secretive):**
- Greedy pathfinding toward claimed workshop
- Check walkability before each move
- Stop when within 1 tile of workshop

**Berserk:**
- Find nearest living dwarf
- Move one tile toward target each tick
- Attack when adjacent (Manhattan distance <= 1)

**Melancholic:**
- No movement changes
- Accelerated hunger/thirst (+2 per tick)
- Dies via normal death system

## Workshop Destruction

If a claimed workshop is destroyed during a mood:
- Mood fails immediately
- Dwarf goes melancholic or berserk (50/50)

## Files

- `moods.ts` - Core mood system (~437 lines)
- `types.ts` - MoodState, mood fields
- `engine.ts` - `updateMoods()` call
- `movement.ts` - Skip mood dwarves (handled by moods.ts)
- `events.ts` - Mood event messages
