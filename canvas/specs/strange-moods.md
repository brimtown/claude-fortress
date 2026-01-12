---
title: Strange Moods
date: 2026-01-11
status: implemented
---

# Strange Moods

Dwarves can be struck by strange moods, claiming workshops to create legendary artifacts - or descending into madness if materials aren't provided.

## Trigger Conditions

- ~0.05% chance per tick (~once per 17 minutes)
- Requires at least one unclaimed workshop
- Unhappy dwarves 3-5x more likely to be struck
- Legendary dwarves are immune

## Mood Types

```typescript
type MoodState = "fey" | "possessed" | "secretive" | "melancholic" | "berserk";
```

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

## Files

- `moods.ts` - Core mood system (NEW, ~430 lines)
- `types.ts` - MoodState, mood fields
- `engine.ts` - `updateMoods()` call
- `movement.ts` - Skip mood dwarves
- `events.ts` - Mood event messages
