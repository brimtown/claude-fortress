import { test, expect, describe, beforeEach } from "bun:test";
import {
  createDwarf,
  createStartingDwarves,
  updateDwarfNeeds,
  killDwarf,
  getLivingDwarfCount,
  getAverageHappiness,
  getDwarfMood,
  calculateWealth,
} from "./dwarf";
import { createInitialState } from "./engine";
import type { FortressState, Dwarf } from "../../scenarios/fortress/types";

describe("createStartingDwarves", () => {
  test("creates 7 dwarves", () => {
    const dwarves = createStartingDwarves();
    expect(dwarves.length).toBe(7);
  });

  test("all dwarves are alive", () => {
    const dwarves = createStartingDwarves();
    expect(dwarves.every((d) => d.alive)).toBe(true);
  });

  test("dwarves have correct labor distribution", () => {
    const dwarves = createStartingDwarves();
    const labors = dwarves.map((d) => d.labor);

    expect(labors.filter((l) => l === "mining").length).toBe(2);
    expect(labors.filter((l) => l === "carpentry").length).toBe(1);
    expect(labors.filter((l) => l === "brewing").length).toBe(1);
    expect(labors.filter((l) => l === "farming").length).toBe(1);
    expect(labors.filter((l) => l === "hauling").length).toBe(2);
  });

  test("dwarves have valid positions in starting area", () => {
    const dwarves = createStartingDwarves();
    for (const dwarf of dwarves) {
      // Starting area is upper outdoor grass region (x: 2-6, y: 3-7)
      expect(dwarf.x).toBeGreaterThanOrEqual(2);
      expect(dwarf.x).toBeLessThanOrEqual(6);
      expect(dwarf.y).toBeGreaterThanOrEqual(3);
      expect(dwarf.y).toBeLessThanOrEqual(7);
    }
  });
});

describe("createDwarf", () => {
  test("creates dwarf at specified position", () => {
    const dwarf = createDwarf(10, 15, "mining");

    expect(dwarf.x).toBe(10);
    expect(dwarf.y).toBe(15);
    expect(dwarf.labor).toBe("mining");
    expect(dwarf.alive).toBe(true);
  });

  test("defaults to hauling labor if not specified", () => {
    const dwarf = createDwarf(5, 5);
    expect(dwarf.labor).toBe("hauling");
  });

  test("generates unique IDs", () => {
    const dwarf1 = createDwarf(1, 1);
    const dwarf2 = createDwarf(2, 2);
    expect(dwarf1.id).not.toBe(dwarf2.id);
  });
});

describe("updateDwarfNeeds", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createDwarf(5, 5, "mining");
  });

  test("increases hunger over time", () => {
    const initialHunger = dwarf.hunger;
    updateDwarfNeeds(dwarf);
    expect(dwarf.hunger).toBeGreaterThan(initialHunger);
  });

  test("increases thirst over time", () => {
    const initialThirst = dwarf.thirst;
    updateDwarfNeeds(dwarf);
    expect(dwarf.thirst).toBeGreaterThan(initialThirst);
  });

  test("thirst increases faster than hunger", () => {
    updateDwarfNeeds(dwarf);
    expect(dwarf.thirst).toBeGreaterThan(dwarf.hunger);
  });

  test("caps hunger at 100", () => {
    dwarf.hunger = 99;
    updateDwarfNeeds(dwarf, 10);
    expect(dwarf.hunger).toBe(100);
  });

  test("caps thirst at 100", () => {
    dwarf.thirst = 99;
    updateDwarfNeeds(dwarf, 10);
    expect(dwarf.thirst).toBe(100);
  });

  test("high hunger decreases happiness", () => {
    dwarf.hunger = 80;
    updateDwarfNeeds(dwarf);
    expect(dwarf.happiness).toBeLessThan(50);
  });

  test("high thirst decreases happiness", () => {
    dwarf.thirst = 80;
    updateDwarfNeeds(dwarf);
    expect(dwarf.happiness).toBeLessThan(50);
  });
});

describe("killDwarf", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("sets alive to false", () => {
    const dwarf = state.dwarves[0]!;
    killDwarf(state, dwarf, "starvation");
    expect(dwarf.alive).toBe(false);
  });

  test("sets death cause", () => {
    const dwarf = state.dwarves[0]!;
    killDwarf(state, dwarf, "dehydration");
    expect(dwarf.deathCause).toBe("dehydration");
  });

  test("sets death tick", () => {
    state.tick = 100;
    const dwarf = state.dwarves[0]!;
    killDwarf(state, dwarf, "starvation");
    expect(dwarf.deathTick).toBe(100);
  });

  test("increments death statistics", () => {
    const initialDeaths = state.statistics.deaths;
    const dwarf = state.dwarves[0]!;
    killDwarf(state, dwarf, "starvation");
    expect(state.statistics.deaths).toBe(initialDeaths + 1);
  });

  test("tracks starvation deaths", () => {
    const initial = state.statistics.deathsByStarvation;
    killDwarf(state, state.dwarves[0]!, "starvation");
    expect(state.statistics.deathsByStarvation).toBe(initial + 1);
  });

  test("tracks dehydration deaths", () => {
    const initial = state.statistics.deathsByDehydration;
    killDwarf(state, state.dwarves[0]!, "dehydration");
    expect(state.statistics.deathsByDehydration).toBe(initial + 1);
  });

  test("applies grief to surviving dwarves", () => {
    const victim = state.dwarves[0]!;
    const survivor = state.dwarves[1]!;
    const initialHappiness = survivor.happiness;

    killDwarf(state, victim, "starvation");

    expect(survivor.happiness).toBeLessThan(initialHappiness);
    expect(survivor.griefTicks).toBeGreaterThan(0);
  });

  test("does not kill already dead dwarf", () => {
    const dwarf = state.dwarves[0]!;
    dwarf.alive = false;
    const initialDeaths = state.statistics.deaths;

    killDwarf(state, dwarf, "starvation");

    expect(state.statistics.deaths).toBe(initialDeaths);
  });
});

describe("getLivingDwarfCount", () => {
  test("counts all dwarves when all alive", () => {
    const dwarves = createStartingDwarves();
    expect(getLivingDwarfCount(dwarves)).toBe(7);
  });

  test("excludes dead dwarves", () => {
    const dwarves = createStartingDwarves();
    dwarves[0]!.alive = false;
    dwarves[1]!.alive = false;
    expect(getLivingDwarfCount(dwarves)).toBe(5);
  });

  test("returns 0 when all dead", () => {
    const dwarves = createStartingDwarves();
    for (const d of dwarves) {
      d.alive = false;
    }
    expect(getLivingDwarfCount(dwarves)).toBe(0);
  });
});

describe("getAverageHappiness", () => {
  test("calculates average of living dwarves", () => {
    const dwarves = createStartingDwarves();
    dwarves[0]!.happiness = 100;
    dwarves[1]!.happiness = 50;
    dwarves[2]!.happiness = 0;

    // (100 + 50 + 0 + 50*4) / 7 = 350/7 = 50
    expect(getAverageHappiness(dwarves)).toBeCloseTo(50, 0);
  });

  test("excludes dead dwarves from calculation", () => {
    const dwarves = createStartingDwarves();
    dwarves[0]!.happiness = 100;
    dwarves[0]!.alive = false;

    // Should not include the dead dwarf's 100
    const avg = getAverageHappiness(dwarves);
    expect(avg).toBe(50); // All remaining have 50
  });

  test("returns 0 when all dwarves dead", () => {
    const dwarves = createStartingDwarves();
    for (const d of dwarves) {
      d.alive = false;
    }
    expect(getAverageHappiness(dwarves)).toBe(0);
  });
});

describe("getDwarfMood", () => {
  test("returns Ecstatic for high happiness", () => {
    expect(getDwarfMood(80)).toBe("Ecstatic");
    expect(getDwarfMood(100)).toBe("Ecstatic");
  });

  test("returns Happy for good happiness", () => {
    expect(getDwarfMood(60)).toBe("Happy");
    expect(getDwarfMood(79)).toBe("Happy");
  });

  test("returns Content for moderate happiness", () => {
    expect(getDwarfMood(40)).toBe("Content");
    expect(getDwarfMood(59)).toBe("Content");
  });

  test("returns Unhappy for low happiness", () => {
    expect(getDwarfMood(20)).toBe("Unhappy");
    expect(getDwarfMood(39)).toBe("Unhappy");
  });

  test("returns Miserable for very low happiness", () => {
    expect(getDwarfMood(0)).toBe("Miserable");
    expect(getDwarfMood(19)).toBe("Miserable");
  });
});

describe("calculateWealth", () => {
  let state: FortressState;

  beforeEach(() => {
    state = createInitialState("TestFortress", 42);
  });

  test("includes resources in wealth", () => {
    const baseWealth = calculateWealth(state);

    state.resources.wood += 10;
    state.resources.stone += 10;

    expect(calculateWealth(state)).toBe(baseWealth + 20);
  });

  test("includes buildings in wealth (10 points each)", () => {
    const baseWealth = calculateWealth(state);

    state.buildings.push({
      id: 0,
      type: "workshop",
      x: 5,
      y: 5,
      width: 3,
      height: 3,
      built: true,
    });

    expect(calculateWealth(state)).toBe(baseWealth + 10);
  });

  test("includes living dwarves in wealth (20 points each)", () => {
    const baseWealth = calculateWealth(state);
    const initialDwarves = getLivingDwarfCount(state.dwarves);

    state.dwarves[0]!.alive = false;

    expect(calculateWealth(state)).toBe(baseWealth - 20);
  });

  test("includes artifacts in wealth (100 points each)", () => {
    const baseWealth = calculateWealth(state);

    state.statistics.artifactsCreated = 2;

    expect(calculateWealth(state)).toBe(baseWealth + 200);
  });
});
