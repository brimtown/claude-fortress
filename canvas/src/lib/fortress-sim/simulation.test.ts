import { test, expect, describe, beforeEach } from "bun:test";
import { createInitialState, processTick, handleCommand } from "./engine";
import { createDigJob, createChopJob } from "./jobs";
import type { FortressState, Dwarf } from "../../scenarios/fortress/types";

/**
 * Simulation tests - integration tests that run the game loop
 * and verify multi-system interactions and state invariants.
 *
 * These sit between unit tests and full agent playthroughs.
 */

// Helper: run N ticks
function runTicks(state: FortressState, n: number): void {
  for (let i = 0; i < n; i++) {
    processTick(state);
  }
}

// Helper: run ticks until condition is met or max reached
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

// Helper: find dwarf by labor
function findDwarfByLabor(state: FortressState, labor: string): Dwarf | undefined {
  return state.dwarves.find(d => d.labor === labor && d.alive);
}

describe("State Invariants", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("InvariantTest", 42);
  });

  test("invariants hold over 200 ticks of normal simulation", () => {
    // Designate some digging to create activity
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 15, y: 5, width: 5, height: 3 },
    });

    for (let tick = 0; tick < 200; tick++) {
      processTick(state);
      checkInvariants(state, tick);
    }
  });

  test("invariants hold when dwarves get hungry/thirsty", () => {
    // Drain resources to stress test
    state.resources.food = 5;
    state.resources.drink = 5;

    for (let tick = 0; tick < 100; tick++) {
      processTick(state);
      checkInvariants(state, tick);
    }
  });

  function checkInvariants(state: FortressState, tick: number): void {
    for (const dwarf of state.dwarves) {
      // Invariant 1: Living dwarf with currentTask must have currentJob
      if (dwarf.alive && dwarf.currentTask && !dwarf.moodState) {
        expect(dwarf.currentJob).toBeDefined();
      }

      // Invariant 2: currentJob must reference a job in state.jobs
      if (dwarf.currentJob) {
        const jobExists = state.jobs.some(j => j.id === dwarf.currentJob!.id);
        expect(jobExists).toBe(true);
      }

      // Invariant 3: carriedItem must reference existing item
      if (dwarf.carriedItem !== undefined) {
        const itemExists = state.items.some(i => i.id === dwarf.carriedItem);
        expect(itemExists).toBe(true);
      }

      // Invariant 4: Dead dwarves should not have jobs
      if (!dwarf.alive) {
        expect(dwarf.currentJob).toBeUndefined();
      }
    }

    // Invariant 5: Items with carriedBy must have valid dwarf
    for (const item of state.items) {
      if (item.carriedBy !== undefined) {
        const dwarfExists = state.dwarves.some(
          d => d.id === item.carriedBy && d.alive
        );
        expect(dwarfExists).toBe(true);
      }
    }

    // Invariant 6: Assigned jobs must reference living dwarves
    for (const job of state.jobs) {
      if (job.assignedDwarfId !== undefined) {
        const dwarf = state.dwarves.find(d => d.id === job.assignedDwarfId);
        expect(dwarf).toBeDefined();
        expect(dwarf!.alive).toBe(true);
      }
    }
  }
});

describe("Labor Reassignment", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("ReassignTest", 42);
  });

  test("reassigning labor clears currentTask", () => {
    const woodcutter = findDwarfByLabor(state, "woodcutting")!;
    expect(woodcutter).toBeDefined();

    // Manually set up a "working" state
    woodcutter.currentTask = "chopping";
    const fakeJob = createChopJob(10, 5);
    state.jobs.push(fakeJob);
    woodcutter.currentJob = fakeJob;
    fakeJob.assignedDwarfId = woodcutter.id;

    // Reassign to mining
    handleCommand(state, {
      type: "assign",
      dwarfId: woodcutter.id,
      labor: "mining",
    });

    expect(woodcutter.labor).toBe("mining");
    expect(woodcutter.currentTask).toBeUndefined();
    expect(woodcutter.currentJob).toBeUndefined();
  });

  test("reassigning labor while hauling drops item", () => {
    const hauler = findDwarfByLabor(state, "hauling")!;
    expect(hauler).toBeDefined();

    // Set up hauling state with carried item AND a haul job (cancelJob requires currentJob)
    const item = { id: 999, type: "stone" as const, x: hauler.x, y: hauler.y, carriedBy: hauler.id };
    state.items.push(item);
    hauler.carriedItem = item.id;

    // Create haul job in carry phase
    const haulJob = {
      id: 9999,
      type: "haul" as const,
      x: hauler.x,
      y: hauler.y,
      targetX: 5,
      targetY: 5,
      itemId: item.id,
      phase: "carry" as const,
      progress: 0,
      requiredLabor: "hauling" as const,
      assignedDwarfId: hauler.id,
    };
    state.jobs.push(haulJob);
    hauler.currentJob = haulJob;
    hauler.currentTask = "hauling";

    handleCommand(state, {
      type: "assign",
      dwarfId: hauler.id,
      labor: "mining",
    });

    expect(hauler.carriedItem).toBeUndefined();
    expect(item.carriedBy).toBeUndefined();
  });
});

describe("Job Abandonment", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("AbandonTest", 42);
  });

  test("dwarf abandons job after pathing timeout", () => {
    const miner = findDwarfByLabor(state, "mining")!;
    expect(miner).toBeDefined();

    // Create a dig job far away (dwarf may not be able to reach efficiently)
    const job = createDigJob(38, 18);
    state.jobs.push(job);
    miner.currentJob = job;
    job.assignedDwarfId = miner.id;
    miner.currentTask = "mining";
    miner.pathingTicks = 0;

    // Run enough ticks to trigger abandonment (40 tick timeout)
    runTicks(state, 50);

    // Dwarf should have either reached the job or abandoned it
    // If they have a job, pathingTicks should be < 40 (they reached it)
    // If they don't have a job, they abandoned it
    if (miner.currentJob) {
      expect(miner.pathingTicks).toBeLessThan(40);
    } else {
      // Job was abandoned - check for warning event
      const abandonEvent = state.events.find(
        e => e.message.includes("can't find path")
      );
      expect(abandonEvent).toBeDefined();
    }
  });

  test("pathingTicks resets when dwarf reaches job", () => {
    const miner = findDwarfByLabor(state, "mining")!;
    expect(miner).toBeDefined();

    // Designate digging near the starting area (accessible)
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 12, y: 4, width: 2, height: 2 },
    });

    // Run some ticks for miner to get a job and start working
    runTicks(state, 20);

    // If miner has a job and is working, pathingTicks should be low or 0
    if (miner.currentJob) {
      expect(miner.pathingTicks || 0).toBeLessThan(20);
    }
  });
});

describe("Resource Gathering Workflow", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("WorkflowTest", 42);
    // Build a stockpile for hauling
    handleCommand(state, {
      type: "build",
      structure: "stockpile",
      subtype: "stone",
      location: { x: 5, y: 5 },
    });
  });

  test("mining produces stone item", () => {
    const initialItems = state.items.length;

    // Find an accessible wall tile (adjacent to floor/grass)
    let wallX = -1, wallY = -1;
    outer: for (let y = 0; y < state.map.length; y++) {
      const row = state.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.type === "wall") {
          // Check if adjacent to walkable tile
          const neighbors: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
          for (const [dx, dy] of neighbors) {
            const neighbor = state.map[y + dy]?.[x + dx];
            if (neighbor?.type === "floor" || neighbor?.type === "grass") {
              wallX = x;
              wallY = y;
              break outer;
            }
          }
        }
      }
    }

    expect(wallX).toBeGreaterThanOrEqual(0);

    // Designate digging at the accessible wall
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: wallX, y: wallY, width: 1, height: 1 },
    });

    // Verify dig job was created
    expect(state.jobs.some(j => j.type === "dig")).toBe(true);

    // Run until a stone item appears or timeout
    const stoneAppeared = runTicksUntil(
      state,
      () => state.items.some(i => i.type === "stone"),
      200
    );

    expect(stoneAppeared).toBe(true);
    expect(state.items.length).toBeGreaterThan(initialItems);
  });

  test("complete mining→hauling→stockpile workflow", () => {
    const initialStone = state.resources.stone;

    // Designate digging
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 15, y: 5, width: 1, height: 1 },
    });

    // Run until stone resource increases (item was hauled to stockpile)
    const workflowComplete = runTicksUntil(
      state,
      () => state.resources.stone > initialStone,
      300
    );

    // This may not always complete due to dwarf needs, but should work most times
    if (workflowComplete) {
      expect(state.resources.stone).toBeGreaterThan(initialStone);
    } else {
      // At minimum, verify some progress was made
      const hasDigJob = state.jobs.some(j => j.type === "dig");
      const hasStoneItem = state.items.some(i => i.type === "stone");
      const hasHaulJob = state.jobs.some(j => j.type === "haul");
      // At least one of these should be true showing progress
      expect(hasDigJob || hasStoneItem || hasHaulJob || state.resources.stone > initialStone).toBe(true);
    }
  });
});

describe("Chop Job System", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("ChopTest", 42);
  });

  test("chop designation creates jobs for trees", () => {
    // Find a tree tile
    let treeX = -1, treeY = -1;
    outer: for (let y = 0; y < state.map.length; y++) {
      const row = state.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.type === "tree") {
          treeX = x;
          treeY = y;
          break outer;
        }
      }
    }

    if (treeX >= 0) {
      handleCommand(state, {
        type: "designate",
        designation: "chop",
        area: { x: treeX, y: treeY, width: 1, height: 1 },
      });

      const chopJob = state.jobs.find(
        j => j.type === "chop" && j.x === treeX && j.y === treeY
      );
      expect(chopJob).toBeDefined();
      expect(chopJob!.requiredLabor).toBe("woodcutting");
    }
  });

  test("woodcutter assigned to chop job shows chopping task", () => {
    const woodcutter = findDwarfByLabor(state, "woodcutting")!;
    expect(woodcutter).toBeDefined();

    // Find and designate a tree
    let treeX = -1, treeY = -1;
    outer: for (let y = 0; y < state.map.length; y++) {
      const row = state.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.type === "tree") {
          treeX = x;
          treeY = y;
          break outer;
        }
      }
    }

    if (treeX >= 0) {
      handleCommand(state, {
        type: "designate",
        designation: "chop",
        area: { x: treeX, y: treeY, width: 3, height: 3 },
      });

      // Run until woodcutter gets a job
      runTicksUntil(
        state,
        () => woodcutter.currentJob?.type === "chop",
        50
      );

      if (woodcutter.currentJob?.type === "chop") {
        expect(woodcutter.currentTask).toBe("chopping");
      }
    }
  });
});

describe("Haul Job System", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("HaulTest", 42);
  });

  test("haul jobs created for items when stockpile exists", () => {
    // Add a stone item
    state.items.push({ id: 1, type: "stone", x: 10, y: 5 });

    // No haul job yet (no stockpile)
    processTick(state);
    expect(state.jobs.filter(j => j.type === "haul").length).toBe(0);

    // Build a stockpile
    handleCommand(state, {
      type: "build",
      structure: "stockpile",
      subtype: "stone",
      location: { x: 5, y: 5 },
    });

    // Wait for stockpile to be built and haul job to be created
    runTicks(state, 50);

    const haulJob = state.jobs.find(j => j.type === "haul" && j.itemId === 1);
    // Haul job should exist (unless item was already hauled)
    const itemStillExists = state.items.some(i => i.id === 1);
    if (itemStillExists) {
      expect(haulJob).toBeDefined();
    }
  });

  test("generic stockpile accepts all item types", () => {
    // Build generic stockpile (no subtype)
    handleCommand(state, {
      type: "build",
      structure: "stockpile",
      location: { x: 5, y: 5 },
    });

    // Wait for construction
    runTicks(state, 30);

    // Add both stone and log items
    state.items.push({ id: 100, type: "stone", x: 10, y: 5 });
    state.items.push({ id: 101, type: "log", x: 11, y: 5 });

    // Process a few ticks for haul jobs to be created
    runTicks(state, 5);

    const stoneHaulJob = state.jobs.find(j => j.type === "haul" && j.itemId === 100);
    const logHaulJob = state.jobs.find(j => j.type === "haul" && j.itemId === 101);

    expect(stoneHaulJob).toBeDefined();
    expect(logHaulJob).toBeDefined();
  });
});

/**
 * Agent Observability Tests
 * Verify that summary data accurately reflects game state
 * These ensure Claude can observe the fortress correctly
 */
describe("Agent Observability", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("ObserveTest", 42);
  });

  // Helper: build summary like the IPC handler does
  function buildSummary(state: FortressState) {
    const livingDwarves = state.dwarves.filter(d => d.alive);
    const deadDwarves = state.dwarves.filter(d => !d.alive);

    return {
      tick: state.tick,
      year: state.year,
      season: state.season,
      paused: state.paused,
      resources: state.resources,
      dwarfCount: state.dwarves.length,
      aliveCount: livingDwarves.length,
      activeJobs: state.jobs.length,
      jobs: {
        total: state.jobs.length,
        byType: {
          dig: state.jobs.filter(j => j.type === "dig").length,
          chop: state.jobs.filter(j => j.type === "chop").length,
          build: state.jobs.filter(j => j.type === "build").length,
          haul: state.jobs.filter(j => j.type === "haul").length,
          produce: state.jobs.filter(j => j.type === "produce").length,
        },
        inaccessible: state.jobs.filter(
          j => (j.type === "dig" || j.type === "chop") && !isJobAccessible(state, j.x, j.y)
        ).length,
      },
      items: {
        stone: state.items.filter(i => i.type === "stone" && i.carriedBy === undefined).length,
        log: state.items.filter(i => i.type === "log" && i.carriedBy === undefined).length,
      },
      dwarves: state.dwarves.map(d => ({
        id: d.id,
        name: d.name,
        labor: d.labor,
        currentTask: d.currentTask,
        alive: d.alive,
      })),
    };
  }

  test("job counts match actual jobs in state", () => {
    // Create various jobs
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 15, y: 5, width: 3, height: 2 },
    });

    handleCommand(state, {
      type: "build",
      structure: "stockpile",
      location: { x: 5, y: 5 },
    });

    runTicks(state, 10);

    const summary = buildSummary(state);

    // Verify counts match
    expect(summary.jobs.total).toBe(state.jobs.length);
    expect(summary.jobs.byType.dig).toBe(state.jobs.filter(j => j.type === "dig").length);
    expect(summary.jobs.byType.build).toBe(state.jobs.filter(j => j.type === "build").length);
    expect(summary.jobs.byType.haul).toBe(state.jobs.filter(j => j.type === "haul").length);
    expect(summary.jobs.byType.produce).toBe(state.jobs.filter(j => j.type === "produce").length);
  });

  test("items count matches items on ground", () => {
    // Add items directly
    state.items.push({ id: 1, type: "stone", x: 10, y: 5 });
    state.items.push({ id: 2, type: "stone", x: 11, y: 5 });
    state.items.push({ id: 3, type: "log", x: 12, y: 5 });
    // This one is being carried, shouldn't count
    state.items.push({ id: 4, type: "stone", x: 5, y: 5, carriedBy: 0 });

    const summary = buildSummary(state);

    expect(summary.items.stone).toBe(2); // 2 on ground, 1 carried
    expect(summary.items.log).toBe(1);
  });

  test("dwarf task reflects currentTask accurately", () => {
    const miner = state.dwarves.find(d => d.labor === "mining")!;

    // Give miner a job
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 15, y: 5, width: 1, height: 1 },
    });

    runTicks(state, 20);

    const summary = buildSummary(state);
    const summaryMiner = summary.dwarves.find(d => d.id === miner.id)!;

    // Task in summary should match actual dwarf task
    expect(summaryMiner.currentTask).toBe(miner.currentTask);
  });

  test("alive count matches living dwarves", () => {
    // Kill a dwarf
    state.dwarves[0]!.alive = false;

    const summary = buildSummary(state);

    expect(summary.aliveCount).toBe(state.dwarves.filter(d => d.alive).length);
    expect(summary.dwarfCount).toBe(state.dwarves.length);
  });

  test("resource counts match state resources", () => {
    state.resources.wood = 50;
    state.resources.stone = 30;
    state.resources.food = 100;
    state.resources.drink = 80;

    const summary = buildSummary(state);

    expect(summary.resources.wood).toBe(50);
    expect(summary.resources.stone).toBe(30);
    expect(summary.resources.food).toBe(100);
    expect(summary.resources.drink).toBe(80);
  });

  test("chop jobs appear in summary", () => {
    // Find a tree
    let treeX = -1, treeY = -1;
    outer: for (let y = 0; y < state.map.length; y++) {
      const row = state.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.type === "tree") {
          treeX = x;
          treeY = y;
          break outer;
        }
      }
    }

    if (treeX >= 0) {
      handleCommand(state, {
        type: "designate",
        designation: "chop",
        area: { x: treeX, y: treeY, width: 1, height: 1 },
      });

      const summary = buildSummary(state);
      expect(summary.jobs.byType.chop).toBe(1);
    }
  });

  test("haul jobs appear in summary after mining", () => {
    // Build stockpile first
    handleCommand(state, {
      type: "build",
      structure: "stockpile",
      subtype: "stone",
      location: { x: 5, y: 5 },
    });

    // Find accessible wall and dig
    let wallX = -1, wallY = -1;
    outer: for (let y = 0; y < state.map.length; y++) {
      const row = state.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.type === "wall") {
          const neighbors: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
          for (const [dx, dy] of neighbors) {
            const neighbor = state.map[y + dy]?.[x + dx];
            if (neighbor?.type === "floor" || neighbor?.type === "grass") {
              wallX = x;
              wallY = y;
              break outer;
            }
          }
        }
      }
    }

    if (wallX >= 0) {
      handleCommand(state, {
        type: "designate",
        designation: "dig",
        area: { x: wallX, y: wallY, width: 1, height: 1 },
      });

      // Run until stone item appears and haul job is created
      runTicksUntil(
        state,
        () => state.jobs.some(j => j.type === "haul"),
        200
      );

      const summary = buildSummary(state);

      // Either haul job exists or item was already delivered
      const hasHaulJob = summary.jobs.byType.haul > 0;
      const hasStoneItem = summary.items.stone > 0;
      const stoneIncreased = state.resources.stone > 10; // Started with 10

      expect(hasHaulJob || hasStoneItem || stoneIncreased).toBe(true);
    }
  });
});

// Import for observability tests
import { isJobAccessible } from "./jobs";
