import { test, expect, describe, beforeEach } from "bun:test";
import { createInitialState, processTick, handleCommand } from "./engine";
import { hasThought } from "./thoughts";
import type { FortressState } from "../../scenarios/fortress/types";

describe("createInitialState", () => {
  test("returns correct defaults", () => {
    const state = createInitialState("TestFortress");

    expect(state.tick).toBe(0);
    expect(state.year).toBe(251);
    expect(state.season).toBe("Spring");
    expect(state.paused).toBe(false);
    expect(state.fallen).toBe(false);
    expect(state.dwarves.length).toBe(7);
    expect(state.buildings.length).toBe(0);
    expect(state.jobs.length).toBe(0);
  });

  test("creates 7 dwarves with correct labors", () => {
    const state = createInitialState("TestFortress");
    const labors = state.dwarves.map((d) => d.labor);

    expect(labors.filter((l) => l === "mining").length).toBe(2);
    expect(labors.filter((l) => l === "woodcutting").length).toBe(1);
    expect(labors.filter((l) => l === "carpentry").length).toBe(1);
    expect(labors.filter((l) => l === "brewing").length).toBe(1);
    expect(labors.filter((l) => l === "farming").length).toBe(1);
    expect(labors.filter((l) => l === "hauling").length).toBe(1);
  });

  test("uses seed for deterministic map generation", () => {
    const state1 = createInitialState("Test", 12345);
    const state2 = createInitialState("Test", 12345);

    // Same seed should produce same map
    expect(state1.map[5]![10]!.type).toBe(state2.map[5]![10]!.type);
  });
});

describe("processTick", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("increments tick when not paused", () => {
    const initialTick = state.tick;
    processTick(state);
    expect(state.tick).toBe(initialTick + 1);
  });

  test("does not increment tick when paused", () => {
    state.paused = true;
    const initialTick = state.tick;
    processTick(state);
    expect(state.tick).toBe(initialTick);
  });

  test("increases dwarf hunger and thirst over time", () => {
    const dwarf = state.dwarves[0]!;
    const initialHunger = dwarf.hunger;
    const initialThirst = dwarf.thirst;

    processTick(state);

    expect(dwarf.hunger).toBeGreaterThan(initialHunger);
    expect(dwarf.thirst).toBeGreaterThan(initialThirst);
  });

  test("changes season every 300 ticks", () => {
    expect(state.season).toBe("Spring");

    // Advance to tick 300
    state.tick = 299;
    processTick(state);

    expect(state.season).toBe("Summer");
  });

  test("increments year after Winter", () => {
    state.season = "Winter" as const;
    state.tick = 299;
    const initialYear = state.year;

    processTick(state);

    expect(state.season as string).toBe("Spring");
    expect(state.year).toBe(initialYear + 1);
  });

  test("fortress falls when all dwarves die", () => {
    // Kill all dwarves
    for (const dwarf of state.dwarves) {
      dwarf.alive = false;
    }

    processTick(state);

    expect(state.fallen).toBe(true);
    expect(state.paused).toBe(true);
  });
});

describe("handleCommand", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("pause command sets paused state", () => {
    const result = handleCommand(state, { type: "pause", paused: true });
    expect(result).toBe(true);
    expect(state.paused).toBe(true);

    handleCommand(state, { type: "pause", paused: false });
    expect(state.paused).toBe(false);
  });

  test("designate dig command creates jobs for wall tiles", () => {
    const initialJobs = state.jobs.length;

    // Dig in an area with walls (right side of map)
    handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 15, y: 5, width: 3, height: 3 },
    });

    expect(state.jobs.length).toBeGreaterThan(initialJobs);
    expect(state.jobs.some((j) => j.type === "dig")).toBe(true);
  });

  test("designate dig command does not create jobs for floor tiles", () => {
    // Starting area is already dug (floor)
    const result = handleCommand(state, {
      type: "designate",
      designation: "dig",
      area: { x: 2, y: 2, width: 3, height: 3 },
    });

    // Should return false - no diggable walls
    expect(result).toBe(false);
    expect(state.jobs.filter((j) => j.type === "dig").length).toBe(0);
  });

  test("assign command changes dwarf labor", () => {
    const dwarf = state.dwarves[0]!;
    const dwarfId = dwarf.id;

    handleCommand(state, {
      type: "assign",
      dwarfId,
      labor: "brewing",
    });

    expect(dwarf.labor).toBe("brewing");
  });

  test("build command requires floor tile", () => {
    // Try to build on a wall tile
    const result = handleCommand(state, {
      type: "build",
      structure: "workshop",
      subtype: "still",
      location: { x: 15, y: 5 },
    });

    expect(result).toBe(false);
  });

  test("build command succeeds on floor tile with resources", () => {
    // Build on dug floor in starting area
    const result = handleCommand(state, {
      type: "build",
      structure: "workshop",
      subtype: "still",
      location: { x: 5, y: 3 },
    });

    expect(result).toBe(true);
    expect(state.buildings.length).toBe(1);
    expect(state.buildings[0]!.type).toBe("workshop");
    expect(state.buildings[0]!.subtype).toBe("still");
  });
});

describe("thought triggers in processTick", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("adds ate_while_starving thought when eating at high hunger", () => {
    const dwarf = state.dwarves[0]!;
    dwarf.hunger = 95; // Critical hunger (>90 triggers eating, >80 triggers thought)
    state.resources.food = 10;

    expect(hasThought(dwarf, "ate_while_starving")).toBe(false);

    processTick(state);

    expect(hasThought(dwarf, "ate_while_starving")).toBe(true);
    expect(dwarf.hunger).toBe(0); // Should have eaten
  });

  test("adds drank_while_parched thought when drinking at high thirst", () => {
    const dwarf = state.dwarves[0]!;
    dwarf.thirst = 95; // Critical thirst (>90 triggers drinking, >80 triggers thought)
    state.resources.drink = 10;

    expect(hasThought(dwarf, "drank_while_parched")).toBe(false);

    processTick(state);

    expect(hasThought(dwarf, "drank_while_parched")).toBe(true);
    expect(dwarf.thirst).toBe(0); // Should have drunk
  });

  test("does not add ate_while_starving when hunger is moderate", () => {
    const dwarf = state.dwarves[0]!;
    dwarf.hunger = 75; // Not critical enough to eat
    state.resources.food = 10;

    processTick(state);

    // Hunger wasn't high enough to trigger eating
    expect(hasThought(dwarf, "ate_while_starving")).toBe(false);
  });
});
