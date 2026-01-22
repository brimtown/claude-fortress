import { test, expect, describe, beforeEach } from "bun:test";
import {
  createDigJob,
  createBuildJob,
  createProductionJob,
  isJobAccessible,
  findJobForDwarf,
  assignJob,
  isAtJobLocation,
  workOnJob,
} from "./jobs";
import { createInitialState } from "./engine";
import { createDwarf } from "./dwarf";
import { addThought } from "./thoughts";
import type { FortressState, Job, Dwarf } from "../../scenarios/fortress/types";

describe("createDigJob", () => {
  test("creates job with correct type", () => {
    const job = createDigJob(10, 5);

    expect(job.type).toBe("dig");
    expect(job.x).toBe(10);
    expect(job.y).toBe(5);
    expect(job.requiredLabor).toBe("mining");
    expect(job.progress).toBe(0);
  });

  test("generates unique IDs", () => {
    const job1 = createDigJob(1, 1);
    const job2 = createDigJob(2, 2);
    expect(job1.id).not.toBe(job2.id);
  });
});

describe("createBuildJob", () => {
  test("creates job with correct properties", () => {
    const job = createBuildJob(5, 5, "workshop", "still");

    expect(job.type).toBe("build");
    expect(job.x).toBe(5);
    expect(job.y).toBe(5);
    expect(job.requiredLabor).toBe("carpentry");
    expect(job.buildingType).toBe("workshop");
    expect(job.buildingSubtype).toBe("still");
  });
});

describe("createProductionJob", () => {
  test("creates job with correct output", () => {
    const job = createProductionJob(5, 5, "still", "drink", "brewing");

    expect(job.type).toBe("produce");
    expect(job.outputType).toBe("drink");
    expect(job.requiredLabor).toBe("brewing");
    expect(job.outputQuantity).toBe(5);
  });
});

describe("isJobAccessible", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("returns true for tile adjacent to grass", () => {
    // Find the first wall tile at y=5 by scanning from left (grass transitions to wall)
    let wallX = 0;
    while (wallX < 39 && state.map[5]![wallX]!.type !== "wall") wallX++;
    // This wall tile should be adjacent to grass on its left side
    expect(state.map[5]![wallX - 1]!.type).toBe("grass");
    expect(isJobAccessible(state, wallX, 5)).toBe(true);
  });

  test("returns false for tile not adjacent to walkable", () => {
    // Tile at x:30, y:5 is deep in mountain territory
    expect(isJobAccessible(state, 30, 5)).toBe(false);
  });

  test("returns true for tile diagonal to grass", () => {
    // Find the first wall tile at y=5
    let wallX = 0;
    while (wallX < 39 && state.map[5]![wallX]!.type !== "wall") wallX++;
    // Move one tile into the mountain - it should be diagonally accessible to grass
    expect(isJobAccessible(state, wallX + 1, 5)).toBe(true);
  });
});

describe("findJobForDwarf", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("returns null for dead dwarf", () => {
    const dwarf = state.dwarves[0]!;
    dwarf.alive = false;

    state.jobs.push(createDigJob(20, 5));

    expect(findJobForDwarf(state, dwarf)).toBeNull();
  });

  test("returns null for dwarf with critical hunger", () => {
    const dwarf = state.dwarves.find((d) => d.labor === "mining")!;
    dwarf.hunger = 95;

    state.jobs.push(createDigJob(20, 5));

    expect(findJobForDwarf(state, dwarf)).toBeNull();
  });

  test("returns null for dwarf with critical thirst", () => {
    const dwarf = state.dwarves.find((d) => d.labor === "mining")!;
    dwarf.thirst = 95;

    state.jobs.push(createDigJob(20, 5));

    expect(findJobForDwarf(state, dwarf)).toBeNull();
  });

  test("matches job to dwarf labor", () => {
    const miner = state.dwarves.find((d) => d.labor === "mining")!;
    const carpenter = state.dwarves.find((d) => d.labor === "carpentry")!;

    // Find first accessible wall tile (at mountain edge) at y=5
    let wallX = 0;
    while (wallX < 39 && state.map[5]![wallX]!.type !== "wall") wallX++;

    const digJob = createDigJob(wallX, 5);
    const buildJob = createBuildJob(5, 5, "workshop");

    state.jobs.push(digJob, buildJob);

    expect(findJobForDwarf(state, miner)).toBe(digJob);
    expect(findJobForDwarf(state, carpenter)).toBe(buildJob);
  });

  test("only assigns accessible dig jobs", () => {
    const miner = state.dwarves.find((d) => d.labor === "mining")!;

    // Create an inaccessible dig job deep in walls
    const inaccessibleJob = createDigJob(30, 5);
    state.jobs.push(inaccessibleJob);

    // Should not be assigned because it's not adjacent to grass/floor
    expect(findJobForDwarf(state, miner)).toBeNull();
  });

  test("does not assign already assigned jobs", () => {
    const miners = state.dwarves.filter((d) => d.labor === "mining");
    const miner1 = miners[0]!;
    const miner2 = miners[1]!;

    // Find first accessible wall tile at y=5
    let wallX = 0;
    while (wallX < 39 && state.map[5]![wallX]!.type !== "wall") wallX++;

    const job = createDigJob(wallX, 5);
    state.jobs.push(job);

    // First miner gets the job
    const foundJob = findJobForDwarf(state, miner1);
    expect(foundJob).toBe(job);

    // Assign it
    job.assignedDwarfId = miner1.id;

    // Second miner should not get the same job
    expect(findJobForDwarf(state, miner2)).toBeNull();
  });
});

describe("assignJob", () => {
  test("links dwarf and job bidirectionally", () => {
    const dwarf = createDwarf(5, 5, "mining");
    const job = createDigJob(10, 5);

    assignJob(dwarf, job);

    expect(dwarf.currentJob).toBe(job);
    expect(job.assignedDwarfId).toBe(dwarf.id);
  });
});

describe("isAtJobLocation", () => {
  test("dig job requires adjacency (not exact location)", () => {
    const dwarf = createDwarf(10, 5, "mining");
    const digJob = createDigJob(11, 5);

    // Adjacent - should be true
    expect(isAtJobLocation(dwarf, digJob)).toBe(true);

    // Same location - should be false (can't stand on wall)
    dwarf.x = 11;
    dwarf.y = 5;
    expect(isAtJobLocation(dwarf, digJob)).toBe(false);
  });

  test("dig job allows diagonal adjacency", () => {
    const dwarf = createDwarf(10, 4, "mining");
    const digJob = createDigJob(11, 5);

    // Diagonally adjacent
    expect(isAtJobLocation(dwarf, digJob)).toBe(true);
  });

  test("build job requires exact location", () => {
    const dwarf = createDwarf(5, 5, "carpentry");
    const buildJob = createBuildJob(5, 5, "workshop");

    expect(isAtJobLocation(dwarf, buildJob)).toBe(true);

    dwarf.x = 6;
    expect(isAtJobLocation(dwarf, buildJob)).toBe(false);
  });

  test("produce job requires exact location", () => {
    const dwarf = createDwarf(5, 5, "brewing");
    const produceJob = createProductionJob(5, 5, "still", "drink", "brewing");

    expect(isAtJobLocation(dwarf, produceJob)).toBe(true);

    dwarf.y = 6;
    expect(isAtJobLocation(dwarf, produceJob)).toBe(false);
  });
});

describe("workOnJob", () => {
  let state: FortressState;
  let dwarf: Dwarf;
  let job: Job;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
    dwarf = state.dwarves[0]!;
    // Use x=20 to ensure we're in solid mountain (mountain edge is ~x=10)
    job = createDigJob(20, 5);
    state.jobs.push(job);
    assignJob(dwarf, job);
  });

  test("increments job progress", () => {
    const initialProgress = job.progress;
    workOnJob(state, dwarf, job);
    expect(job.progress).toBeGreaterThan(initialProgress);
  });

  test("returns false when job not complete", () => {
    job.progress = 0;
    expect(workOnJob(state, dwarf, job)).toBe(false);
  });

  test("returns true when job completes", () => {
    job.progress = 95;
    expect(workOnJob(state, dwarf, job)).toBe(true);
  });

  test("grief penalty slows work", () => {
    const normalDwarf = createDwarf(5, 5, "mining");
    const grievingDwarf = createDwarf(5, 5, "mining");
    // Add witnessed_death thought to trigger grief penalty
    addThought(grievingDwarf, 0, "witnessed_death");

    // Use x=20+ to ensure we're in solid mountain
    const job1 = createDigJob(20, 5);
    const job2 = createDigJob(20, 6);
    state.jobs.push(job1, job2);

    workOnJob(state, normalDwarf, job1);
    workOnJob(state, grievingDwarf, job2);

    // Grieving dwarf makes less progress
    expect(job2.progress).toBeLessThan(job1.progress);
  });

  test("completing dig job turns wall to floor", () => {
    // Setup: tile at (20, 5) is a wall (job.x, job.y from beforeEach)
    expect(state.map[5]![20]!.type).toBe("wall");

    // Complete the job
    job.progress = 95;
    workOnJob(state, dwarf, job);

    // Should now be floor
    expect(state.map[5]![20]!.type).toBe("floor");
    expect(state.map[5]![20]!.dug).toBe(true);
  });

  test("completing dig job spawns stone item", () => {
    const initialItemCount = state.items.length;

    job.progress = 95;
    workOnJob(state, dwarf, job);

    // Stone item should spawn at the dig location
    expect(state.items.length).toBe(initialItemCount + 1);
    const stoneItem = state.items.find(i => i.x === job.x && i.y === job.y);
    expect(stoneItem).toBeDefined();
    expect(stoneItem!.type).toBe("stone");
  });

  test("completed job is removed from queue", () => {
    expect(state.jobs).toContain(job);

    job.progress = 95;
    workOnJob(state, dwarf, job);

    expect(state.jobs).not.toContain(job);
  });
});
