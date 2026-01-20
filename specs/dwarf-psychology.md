---
title: Dwarf Psychology
date: 2026-01-19
status: implemented
dependencies: [dwarf-death, fortress-production]
---

# Dwarf Psychology

Dwarves have individual personalities, needs, moods, and memories that affect their behavior and can lead to spectacular cascade failures.

## Overview

The psychology system has three layers:

1. **Individual Variation** - Each dwarf has unique metabolism rates and personality
2. **Thoughts System** - Persistent memories that decay over time, affecting happiness
3. **Strange Moods** - Legendary artifact creation or descent into madness

---

## Individual Variation

Each dwarf is created with randomized traits, creating natural desynchronization.

### Need Rates

```typescript
interface Dwarf {
  needRates: {
    hunger: number;    // 0.3-0.5 (base 0.4)
    thirst: number;    // 0.5-0.9 (base 0.7)
  };
}
```

### Starting Stats

New dwarves spawn with slight variation:
- `hunger`: 0-20 (not all starting at 0)
- `thirst`: 0-20
- `energy`: 80-100

### Effect

Individual rates mean dwarves hit crises at different times, creating:
- Staggered deaths (not all dying at once)
- Multiple grief waves
- Natural emergent narratives

---

## Personality System

Each dwarf has persistent personality traits that affect how they experience the world.

### Data Model

```typescript
interface DwarfPersonality {
  baseHappiness: number;   // 45-64 (starting happiness)
  resilience: number;      // 0.7-1.3 (negative thought decay multiplier)
  empathy: number;         // 0.7-1.3 (grief intensity multiplier)
}
```

### Trait Effects

| Trait | Low (0.7) | High (1.3) |
|-------|-----------|------------|
| `baseHappiness` | 45 - pessimist | 64 - optimist |
| `resilience` | Slow recovery from trauma | Fast recovery from trauma |
| `empathy` | Less affected by deaths | More affected by deaths |

### Generation

```typescript
function generatePersonality(): DwarfPersonality {
  return {
    baseHappiness: 45 + Math.floor(Math.random() * 20), // 45-64
    resilience: 0.7 + Math.random() * 0.6,              // 0.7-1.3
    empathy: 0.7 + Math.random() * 0.6,                 // 0.7-1.3
  };
}
```

---

## Thoughts System

Dwarves accumulate "thoughts" from events that persist and decay over time.

### Data Model

```typescript
interface Thought {
  type: ThoughtType;
  createdAt: number;       // Tick when created
  expiresAt: number;       // Tick when expires (Infinity for condition-based)
  modifier: number;        // Happiness modifier (-50 to +50)
  intensity: number;       // Stack count for stacking thoughts
  description?: string;    // Human-readable description
}
```

### Thought Types

| Type | Modifier | Duration | Stacks? | Trigger |
|------|----------|----------|---------|---------|
| `witnessed_death` | -30 | 300 ticks | Yes | Saw someone die |
| `witnessed_tantrum` | -15 | 150 ticks | Yes | Witnessed breakdown |
| `starving` | -20 | Condition | No | hunger > 70 |
| `dehydrated` | -25 | Condition | No | thirst > 70 |
| `exhausted` | -10 | Condition | No | energy < 20 |
| `ate_while_starving` | +15 | 100 ticks | No | Ate when hunger > 80 |
| `drank_while_parched` | +15 | 100 ticks | No | Drank when thirst > 80 |
| `well_fed` | +5 | Condition | No | hunger < 30 |
| `well_hydrated` | +5 | Condition | No | thirst < 30 |
| `created_artifact` | +50 | 500 ticks | No | Mood success |

### Stacking Behavior

Stacking thoughts (`witnessed_death`, `witnessed_tantrum`) increment intensity:

```typescript
// Adding a stacking thought:
if (existingThought) {
  existingThought.intensity++;           // Stack counter increases
  existingThought.expiresAt = tick + duration;  // Timer refreshes
} else {
  // Create new thought with intensity: 1
}
```

### Condition-Based Thoughts

Condition thoughts have `expiresAt: Infinity` and are added/removed based on current state:

```typescript
// In updateDwarfNeeds():
if (hunger > 70) {
  addThought(dwarf, tick, "starving");
  removeConditionThought(dwarf, "well_fed");
} else if (hunger < 30) {
  addThought(dwarf, tick, "well_fed");
  removeConditionThought(dwarf, "starving");
} else {
  removeConditionThought(dwarf, "starving");
  removeConditionThought(dwarf, "well_fed");
}
```

### Happiness Calculation

```typescript
function calculateHappiness(dwarf: Dwarf): number {
  const base = dwarf.personality?.baseHappiness ?? 50;

  let totalModifier = 0;
  for (const thought of dwarf.thoughts) {
    if (THOUGHT_CONFIG[thought.type].stacks) {
      totalModifier += thought.modifier * thought.intensity;
    } else {
      totalModifier += thought.modifier;
    }
  }

  return clamp(0, 100, base + totalModifier);
}
```

### Thought Decay

Each tick, expired thoughts are removed:

```typescript
function decayThoughts(dwarf: Dwarf, tick: number): void {
  const resilience = dwarf.personality?.resilience ?? 1.0;

  dwarf.thoughts = dwarf.thoughts.filter(thought => {
    if (thought.expiresAt === Infinity) return true;  // Condition-based

    // Resilient dwarves recover faster from negative thoughts
    let effectiveExpiry = thought.expiresAt;
    if (thought.modifier < 0 && resilience > 1.0) {
      const duration = thought.expiresAt - thought.createdAt;
      effectiveExpiry = thought.createdAt + (duration / resilience);
    }

    return tick < effectiveExpiry;
  });
}
```

---

## Grief System

### Trigger

When a dwarf dies, all living dwarves receive a `witnessed_death` thought:

```typescript
function applyGrief(state: FortressState, deadDwarf: Dwarf): void {
  for (const dwarf of livingDwarves) {
    addThought(dwarf, state.tick, "witnessed_death",
               `witnessed ${deadDwarf.name}'s death`);
    dwarf.happiness = calculateHappiness(dwarf);
  }
}
```

### Grief Intensity

Multiple deaths stack the `witnessed_death` thought:

```typescript
function getGriefIntensity(dwarf: Dwarf): number {
  const thought = dwarf.thoughts?.find(t => t.type === "witnessed_death");
  return thought?.intensity ?? 0;
}
```

### Grief Cascade Math

With `baseHappiness = 55`:

| Deaths | Thought Modifier | Happiness | Tantrum Chance/tick |
|--------|------------------|-----------|---------------------|
| 0 | 0 | 55 | 0.1% (if < 15) |
| 1 | -30 | 25 | 0.8% |
| 2 | -60 | 0 (clamped) | 1.6% |
| 3 | -90 | 0 (clamped) | 2.4% |
| 6 | -180 | 0 (clamped) | 4.8% |

### Key Behavior: Grief Doesn't Wash Out

Unlike the old system, drinking water doesn't reset grief:

```typescript
// Old system (bad):
// Drink → hunger satisfied → happiness recalculated → grief gone

// New system (good):
// Drink → adds "drank_while_parched" (+15)
// witnessed_death (-30) still there
// Happiness = 55 - 30 + 15 = 40 (still unhappy)
```

---

## Tantrum Cascade

### Trigger Conditions

```typescript
const moodState = dwarf.moodState || "normal";
if (moodState === "normal") {
  const griefIntensity = getGriefIntensity(dwarf);
  const baseTantrumChance = griefIntensity > 0 ? 0.008 : 0.001;
  const tantrumChance = baseTantrumChance * Math.max(1, griefIntensity);
  const tantrumThreshold = griefIntensity > 0 ? 30 : 15;

  if (happiness < tantrumThreshold && Math.random() < tantrumChance) {
    // 50% berserk, 50% melancholic
  }
}
```

### Witnessed Tantrum Effect

When a dwarf snaps, nearby dwarves (within 5 tiles) receive `witnessed_tantrum`:

```typescript
const nearbyDwarves = state.dwarves.filter(d =>
  d.alive && d.id !== dwarf.id &&
  Math.abs(d.x - dwarf.x) <= 5 && Math.abs(d.y - dwarf.y) <= 5
);
for (const nearby of nearbyDwarves) {
  addThought(nearby, state.tick, "witnessed_tantrum",
             `witnessed ${dwarf.name}'s breakdown`);
}
```

### Cascade Probability

| Deaths | ~100 tick cumulative |
|--------|----------------------|
| 0 | ~10% |
| 1 | ~55% |
| 2 | ~80% |
| 6 | ~99% |

---

## Strange Moods

Dwarves can be struck by strange moods, claiming workshops to create legendary artifacts - or descending into madness.

### Trigger Conditions

- ~0.05% chance per tick (~once per 17 minutes)
- Requires at least one unclaimed workshop
- Unhappy dwarves 3-5x more likely
- Legendary dwarves are immune

### Mood Types

| Mood | Description |
|------|-------------|
| `fey` | Struck by a fey mood |
| `possessed` | Has been possessed |
| `secretive` | Has become secretive |
| `melancholic` | Failed mood - refuses to eat/drink |
| `berserk` | Failed mood - attacks other dwarves |

### Mood Flow

1. **Trigger**: Dwarf claims workshop, demands 1-2 materials, deadline 200 ticks
2. **Working**: Paths to workshop, progress 2%/tick, consumes 5 of each material
3. **Success**: Artifact created, `created_artifact` thought (+50), dwarf becomes legendary
4. **Failure**: 50% melancholic (starves), 50% berserk (attacks)

### Created Artifact Thought

```typescript
function completeMood(state: FortressState, dwarf: Dwarf): void {
  // ... artifact creation ...
  addThought(dwarf, state.tick, "created_artifact", `created ${artifactName}`);
  dwarf.happiness = calculateHappiness(dwarf);
}
```

---

## Work Penalty

Grieving dwarves work at 50% speed:

```typescript
function workOnJob(state: FortressState, dwarf: Dwarf, job: Job): boolean {
  let progressRate = 12;
  if (hasThought(dwarf, "witnessed_death")) {
    progressRate = 6;  // 50% slower
  }
  job.progress += progressRate;
  // ...
}
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Base hunger rate | 0.4/tick | ~250 ticks to starve |
| Base thirst rate | 0.7/tick | ~143 ticks to dehydrate |
| Hunger variation | 0.3-0.5 | Individual metabolism |
| Thirst variation | 0.5-0.9 | Individual metabolism |
| Base happiness | 45-64 | Personality trait |
| Resilience | 0.7-1.3 | Negative thought decay |
| Empathy | 0.7-1.3 | Grief intensity |
| Grief duration | 300 ticks | witnessed_death expiry |
| Tantrum witness duration | 150 ticks | witnessed_tantrum expiry |
| Base tantrum chance | 0.1%/tick | When happiness < 15 |
| Grieving tantrum chance | 0.8%/tick * intensity | When happiness < 30 |

---

## Files

| File | Contents |
|------|----------|
| `thoughts.ts` | Core thoughts system, personality generation |
| `dwarf.ts` | Dwarf creation, needs update, grief application |
| `moods.ts` | Strange mood system |
| `engine.ts` | Tantrum checks, event hooks for thoughts |
| `jobs.ts` | Work penalty for grieving dwarves |
| `types.ts` | Thought, ThoughtType, DwarfPersonality interfaces |

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Individual need rates | ✅ Implemented | Creates natural desync |
| Personality traits | ✅ Implemented | baseHappiness, resilience, empathy |
| Thoughts system | ✅ Implemented | Persistent, decaying memories |
| Grief stacking | ✅ Implemented | Multiple deaths compound |
| Tantrum chance scaling | ✅ Implemented | More deaths = higher chance |
| Witnessed tantrum spread | ✅ Implemented | Nearby dwarves affected |
| Strange moods | ✅ Implemented | Artifacts or madness |
| Work penalty for grief | ✅ Implemented | 50% slower when grieving |
| Relationships | ❌ Planned | Friend death hurts more |
