---
title: Agent Observability
date: 2026-01-12
status: implemented
---

# Agent Observability

Systems that allow Claude to perceive fortress state without visual access. The agent queries state via IPC and receives structured data optimized for token efficiency and actionable insights.

## Query Types

### getSummary (Recommended)

Lightweight query returning essential state without the map. Optimized for frequent polling.

```bash
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock
```

### getState (Full)

Complete state dump including the 40x20 map grid. Use sparingly due to size (~8KB+).

```bash
echo '{"type":"getState"}' | nc -U /tmp/canvas-fortress-1.sock
```

## FortressSummary Structure

```typescript
interface FortressSummary {
  // Time & status
  tick: number;
  year: number;
  season: Season;
  paused: boolean;

  // Resources
  resources: {
    wood: number;
    stone: number;
    food: number;
    drink: number;
  };

  // Population counts
  dwarfCount: number;      // Total (living + dead)
  aliveCount: number;      // Living only
  activeJobs: number;      // Pending work

  // Detailed views
  dwarves: DwarfStatus[];
  crises: CrisisAlerts;
  statistics: FortressStatistics;
  recentEvents: GameEvent[];  // Last 5 events
}
```

## DwarfStatus

Per-dwarf information surfaced to the agent:

```typescript
interface DwarfStatus {
  id: number;
  name: string;
  labor: Labor;
  hunger: number;       // 0-100, higher = hungrier
  thirst: number;       // 0-100, higher = thirstier
  happiness: number;    // 0-100, higher = happier
  alive: boolean;
  currentTask?: string; // "digging", "building", etc.
  moodState?: MoodState;
  moodDemands?: string[];
  isLegendary?: boolean;
}
```

## CrisisAlerts

Proactive alerts for situations requiring immediate attention:

```typescript
interface CrisisAlerts {
  starving: string[];      // Dwarf names with hunger > 80
  dehydrating: string[];   // Dwarf names with thirst > 80
  inMood: string[];        // Dwarf names in strange mood
  recentDeaths: string[];  // Last 5 deceased (newest last)
}
```

### Alert Thresholds

| Alert | Threshold | Urgency |
|-------|-----------|---------|
| Starving | hunger > 80 | High - death at 90+ for 100 ticks |
| Dehydrating | thirst > 80 | High - death at 90+ for 100 ticks |
| In Mood | moodState != normal | Medium - 200 tick deadline |

## GameEvent

Events provide a narrative log of fortress happenings:

```typescript
interface GameEvent {
  id: number;
  tick: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
}
```

### Event Types

| Type | Examples |
|------|----------|
| `info` | Season change, labor assignment, tiles designated |
| `warning` | Resource shortage, dwarf starving/dehydrating, mood demands |
| `success` | Building complete, artifact created, migrants arrived |
| `danger` | Dwarf death, berserk rampage, mood failure |

## FortressStatistics

Cumulative metrics for the fortress lifetime:

```typescript
interface FortressStatistics {
  deaths: number;
  deathsByStarvation: number;
  deathsByDehydration: number;
  deathsByInsanity: number;
  deathsByBerserk: number;
  peakPopulation: number;
  moodsTriggered: number;
  moodsSucceeded: number;
  moodsFailed: number;
  artifactsCreated: number;
}
```

## Recommended Query Patterns

### Routine Check
Query every 10-20 seconds to monitor general health:
```bash
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock
```
Focus on: `resources`, `crises`, `aliveCount`

### After Commands
Query immediately after sending commands to verify execution:
```bash
echo '{"type":"command","command":{...}}' | nc -U ...
echo '{"type":"getSummary"}' | nc -U ...  # Verify
```
Focus on: `activeJobs`, `recentEvents`

### Crisis Response
When `crises` arrays are non-empty, increase query frequency and check:
- `starving`/`dehydrating`: Build farms/stills, check `resources.food`/`resources.drink`
- `inMood`: Check dwarf's `moodDemands`, verify materials available
- `recentDeaths`: Review `statistics` for cause patterns

## Design Decisions

### Why Summary vs Full State?
- Summary: ~500 bytes, fits context easily, frequent polling OK
- Full state: ~8KB+, includes 800-tile map, use for debugging only

### Why Crisis Alerts?
Pre-computed alerts save the agent from scanning all dwarves each query. Thresholds (80) give warning before critical (90).

### Why 5 Recent Events?
Balance between context and token usage. Events are trimmed to 15 in-game but only 5 surfaced to agent.

### What's NOT Observable?
- Exact dwarf positions (x, y) - not in DwarfStatus
- Map layout - only in full getState
- Job details - only count in summary
- Building locations - not in summary

## Files

- `types.ts` - FortressSummary, DwarfStatus, CrisisAlerts interfaces
- `fortress.tsx:120-166` - Summary generation in IPC handler
- `ipc/types.ts` - getSummary message type
- `cli.ts` - `query` command implementation
