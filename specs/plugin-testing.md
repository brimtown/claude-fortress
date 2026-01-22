---
title: Plugin Testing
date: 2026-01-21
status: implemented
dependencies: []
---

# Plugin Testing

This spec documents the testing strategy for Claude Fortress, covering the three levels of testing and when to use each.

## Testing Pyramid

```
                    ┌─────────────────┐
                    │    Agent        │  ← Manual, exploratory
                    │  Playthroughs   │    Catches: UX, gameplay, emergent behavior
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │   Simulation    │  ← Automated integration
                    │     Tests       │    Catches: System interactions, invariants
                    └────────┬────────┘
                             │
           ┌─────────────────┴─────────────────┐
           │           Unit Tests              │  ← Automated, fast
           │  (functions, modules in isolation) │    Catches: Logic errors
           └───────────────────────────────────┘
```

## Test Levels

### 1. Unit Tests

**Location:** `canvas/src/lib/fortress-sim/*.test.ts` (co-located with modules)

**Purpose:** Test individual functions in isolation.

**Characteristics:**
- Fast (< 100ms per test)
- Isolated (no multi-system interactions)
- Deterministic (use fixed seeds)

**Example bugs caught:**
- Incorrect calculations
- Missing null checks
- Wrong return values

**Example:**
```typescript
test("createDigJob sets correct properties", () => {
  const job = createDigJob(10, 5);
  expect(job.type).toBe("dig");
  expect(job.requiredLabor).toBe("mining");
  expect(job.progress).toBe(0);
});
```

### 2. Simulation Tests

**Location:** `canvas/src/lib/fortress-sim/simulation.test.ts`

**Purpose:** Test multi-system interactions by running the actual game loop.

**Characteristics:**
- Run `processTick()` in loops
- Set up specific scenarios
- Verify emergent behavior and invariants
- Slower than unit tests but still automated

**Example bugs caught:**
- State corruption from system interactions
- Jobs not completing end-to-end
- Invariant violations (orphaned references)
- Workflows that break mid-way

#### Test Categories

##### Invariant Tests
Run simulation and check state invariants every tick:

```typescript
test("invariants hold over 200 ticks", () => {
  const state = createInitialState("Test", 42);

  for (let tick = 0; tick < 200; tick++) {
    processTick(state);

    // Check invariants
    for (const dwarf of state.dwarves) {
      // Living dwarf with task must have job
      if (dwarf.alive && dwarf.currentTask && !dwarf.moodState) {
        expect(dwarf.currentJob).toBeDefined();
      }
    }
  }
});
```

**Key invariants to test:**
- `currentTask` implies `currentJob` (caught the reassignment bug!)
- `currentJob` references job in `state.jobs`
- `carriedItem` references item in `state.items`
- Dead dwarves have no jobs
- Assigned jobs reference living dwarves

##### Scenario Tests
Set up specific state, run ticks, verify outcome:

```typescript
test("dwarf abandons unreachable job", () => {
  const state = createStateWithBlockedJob();

  runTicks(state, 50);

  expect(state.dwarves[0].currentJob).toBeUndefined();
  expect(state.events.some(e => e.message.includes("can't find path"))).toBe(true);
});
```

##### Workflow Tests
Verify multi-step processes complete end-to-end:

```typescript
test("mining workflow: dig → item → haul → resource", () => {
  const state = createStateWithMinerAndStockpile();
  const initial = state.resources.stone;

  handleCommand(state, { type: "designate", designation: "dig", ... });
  runTicksUntil(state, () => state.resources.stone > initial, 200);

  expect(state.resources.stone).toBeGreaterThan(initial);
});
```

### 3. Agent Playthroughs

**Location:** `playtests/` (session logs and fun ratings)

**Purpose:** End-to-end validation with AI playing the game.

**Characteristics:**
- Manual/semi-automated
- Tests full MCP integration
- Catches UX and gameplay issues
- Subjective (measures "Fun")

**Example bugs caught:**
- Confusing MCP tool responses
- Missing information in summaries
- Gameplay balance issues
- Emergent behavior problems

**Process:**
1. Run fortress with plugin: `claude --plugin-dir /path/to/claude-fortress/canvas`
2. Use `/claude-fortress:embark` to start
3. Play through session
4. Record fun rating in `playtests/fun-ratings.json`

## When to Add Tests

### Add Unit Tests When:
- Writing a new function
- Fixing a calculation bug
- Adding new job/building/item type

### Add Simulation Tests When:
- Bug involves multiple systems interacting
- State gets corrupted over time
- Workflow breaks mid-way
- Adding new invariants the system should maintain

### Do Agent Playthrough When:
- Major feature complete
- Significant rebalancing
- After fixing emergent behavior bugs
- Before releases

## Test Helpers

Common patterns in simulation tests:

```typescript
// Run N ticks
function runTicks(state: FortressState, n: number): void {
  for (let i = 0; i < n; i++) {
    processTick(state);
  }
}

// Run until condition or timeout
function runTicksUntil(
  state: FortressState,
  condition: () => boolean,
  maxTicks: number
): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (condition()) return true;
    processTick(state);
  }
  return condition();
}

// Find dwarf by labor
function findDwarfByLabor(state: FortressState, labor: string): Dwarf | undefined {
  return state.dwarves.find(d => d.labor === labor && d.alive);
}
```

## Bug → Test Mapping

When fixing a bug, ask: "What test would have caught this?"

| Bug Type | Test Level | Example |
|----------|------------|---------|
| Function returns wrong value | Unit | `calculateHappiness` returns NaN |
| State not cleared on action | Simulation | Reassigning labor doesn't clear task |
| Workflow doesn't complete | Simulation | Mining doesn't produce items |
| Dwarf gets stuck forever | Simulation | Unreachable job not abandoned |
| UX confusion | Playthrough | Summary doesn't show enough info |
| Balance issue | Playthrough | Dwarves die too fast |

## Running Tests

```bash
# All tests
cd canvas && bun test

# Specific file
bun test simulation.test.ts

# Watch mode
bun test --watch
```

## Test File Organization

```
canvas/src/lib/fortress-sim/
├── dwarf.ts
├── dwarf.test.ts      # Unit tests for dwarf module
├── jobs.ts
├── jobs.test.ts       # Unit tests for jobs module
├── engine.ts
├── engine.test.ts     # Unit tests for engine module
├── thoughts.ts
├── thoughts.test.ts   # Unit tests for thoughts module
└── simulation.test.ts # Integration/simulation tests (all systems)
```

## Coverage Goals

- **Unit tests:** All public functions should have basic coverage
- **Simulation tests:** All major workflows, all state invariants
- **Playthroughs:** At least one per minor version bump

## Adding New Invariants

When adding new state relationships, add corresponding invariant checks:

1. Document the invariant in the relevant spec
2. Add to `checkInvariants()` in simulation.test.ts
3. Run full test suite to verify it holds

Example: When adding `carriedItem` to Dwarf:
```typescript
// Invariant: carriedItem must reference existing item
if (dwarf.carriedItem !== undefined) {
  const itemExists = state.items.some(i => i.id === dwarf.carriedItem);
  expect(itemExists).toBe(true);
}
```
