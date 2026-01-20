import { test, expect, describe, beforeEach } from "bun:test";
import {
  generatePersonality,
  addThought,
  removeConditionThought,
  hasThought,
  getThoughtIntensity,
  decayThoughts,
  calculateHappiness,
  getTopThoughts,
  THOUGHT_CONFIG,
} from "./thoughts";
import { createDwarf } from "./dwarf";
import type { Dwarf, DwarfPersonality } from "../../scenarios/fortress/types";

// Helper to create a dwarf with deterministic personality for testing
function createTestDwarf(baseHappiness: number = 50): Dwarf {
  const dwarf = createDwarf(5, 5, "mining");
  // Override with deterministic personality
  dwarf.personality = {
    baseHappiness,
    resilience: 1.0,
    empathy: 1.0,
  };
  dwarf.thoughts = [];
  dwarf.happiness = baseHappiness;
  return dwarf;
}

describe("generatePersonality", () => {
  test("generates personality with valid ranges", () => {
    for (let i = 0; i < 100; i++) {
      const personality = generatePersonality();

      expect(personality.baseHappiness).toBeGreaterThanOrEqual(45);
      expect(personality.baseHappiness).toBeLessThanOrEqual(64);

      expect(personality.resilience).toBeGreaterThanOrEqual(0.7);
      expect(personality.resilience).toBeLessThanOrEqual(1.3);

      expect(personality.empathy).toBeGreaterThanOrEqual(0.7);
      expect(personality.empathy).toBeLessThanOrEqual(1.3);
    }
  });
});

describe("addThought", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("adds a new thought", () => {
    addThought(dwarf, 100, "starving");

    expect(dwarf.thoughts!.length).toBe(1);
    expect(dwarf.thoughts![0]!.type).toBe("starving");
    expect(dwarf.thoughts![0]!.createdAt).toBe(100);
    expect(dwarf.thoughts![0]!.modifier).toBe(-20);
    expect(dwarf.thoughts![0]!.intensity).toBe(1);
  });

  test("stacking thought increments intensity", () => {
    addThought(dwarf, 100, "witnessed_death");
    addThought(dwarf, 150, "witnessed_death");
    addThought(dwarf, 200, "witnessed_death");

    expect(dwarf.thoughts!.length).toBe(1);
    expect(dwarf.thoughts![0]!.type).toBe("witnessed_death");
    expect(dwarf.thoughts![0]!.intensity).toBe(3);
    // Timer should be refreshed to latest
    expect(dwarf.thoughts![0]!.createdAt).toBe(200);
  });

  test("non-stacking thought refreshes timer", () => {
    addThought(dwarf, 100, "starving");
    const originalExpiry = dwarf.thoughts![0]!.expiresAt;

    addThought(dwarf, 200, "starving");

    expect(dwarf.thoughts!.length).toBe(1);
    expect(dwarf.thoughts![0]!.intensity).toBe(1); // No stacking
    expect(dwarf.thoughts![0]!.createdAt).toBe(200);
  });

  test("custom description is preserved", () => {
    addThought(dwarf, 100, "witnessed_death", "witnessed Urist's death");

    expect(dwarf.thoughts![0]!.description).toBe("witnessed Urist's death");
  });
});

describe("removeConditionThought", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("removes a specific thought type", () => {
    addThought(dwarf, 100, "starving");
    addThought(dwarf, 100, "dehydrated");

    removeConditionThought(dwarf, "starving");

    expect(dwarf.thoughts!.length).toBe(1);
    expect(dwarf.thoughts![0]!.type).toBe("dehydrated");
  });

  test("does nothing if thought doesn't exist", () => {
    addThought(dwarf, 100, "starving");

    removeConditionThought(dwarf, "well_fed");

    expect(dwarf.thoughts!.length).toBe(1);
  });
});

describe("hasThought", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("returns true when thought exists", () => {
    addThought(dwarf, 100, "starving");

    expect(hasThought(dwarf, "starving")).toBe(true);
  });

  test("returns false when thought doesn't exist", () => {
    addThought(dwarf, 100, "starving");

    expect(hasThought(dwarf, "well_fed")).toBe(false);
  });
});

describe("getThoughtIntensity", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("returns intensity for stacking thoughts", () => {
    addThought(dwarf, 100, "witnessed_death");
    addThought(dwarf, 150, "witnessed_death");
    addThought(dwarf, 200, "witnessed_death");

    expect(getThoughtIntensity(dwarf, "witnessed_death")).toBe(3);
  });

  test("returns 0 for missing thoughts", () => {
    expect(getThoughtIntensity(dwarf, "witnessed_death")).toBe(0);
  });
});

describe("decayThoughts", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("removes expired thoughts", () => {
    addThought(dwarf, 100, "ate_while_starving"); // 100 tick duration

    // Before expiry
    decayThoughts(dwarf, 150);
    expect(dwarf.thoughts!.length).toBe(1);

    // After expiry
    decayThoughts(dwarf, 250);
    expect(dwarf.thoughts!.length).toBe(0);
  });

  test("keeps condition-based thoughts", () => {
    addThought(dwarf, 100, "starving"); // Infinite duration

    decayThoughts(dwarf, 10000);
    expect(dwarf.thoughts!.length).toBe(1);
  });

  test("resilient dwarves recover faster from negative thoughts", () => {
    dwarf.personality!.resilience = 2.0; // Very resilient
    addThought(dwarf, 0, "witnessed_death"); // 300 tick base duration

    // At half the normal duration, should be expired for resilient dwarf
    decayThoughts(dwarf, 160);
    expect(dwarf.thoughts!.length).toBe(0);
  });
});

describe("calculateHappiness", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("returns base happiness with no thoughts", () => {
    expect(calculateHappiness(dwarf)).toBe(50);
  });

  test("applies positive thought modifier", () => {
    addThought(dwarf, 100, "well_fed"); // +5

    expect(calculateHappiness(dwarf)).toBe(55);
  });

  test("applies negative thought modifier", () => {
    addThought(dwarf, 100, "starving"); // -20

    expect(calculateHappiness(dwarf)).toBe(30);
  });

  test("applies stacked thought modifier correctly", () => {
    addThought(dwarf, 100, "witnessed_death"); // -30 each
    addThought(dwarf, 150, "witnessed_death");
    addThought(dwarf, 200, "witnessed_death");

    // 50 + (-30 * 3) = -40, clamped to 0
    expect(calculateHappiness(dwarf)).toBe(0);
  });

  test("combines multiple thoughts", () => {
    addThought(dwarf, 100, "well_fed"); // +5
    addThought(dwarf, 100, "well_hydrated"); // +5
    addThought(dwarf, 100, "starving"); // -20

    // 50 + 5 + 5 - 20 = 40
    expect(calculateHappiness(dwarf)).toBe(40);
  });

  test("clamps happiness to 0-100", () => {
    dwarf.personality!.baseHappiness = 60;

    // Add very positive thoughts
    addThought(dwarf, 100, "created_artifact"); // +50

    // 60 + 50 = 110, clamped to 100
    expect(calculateHappiness(dwarf)).toBe(100);
  });
});

describe("getTopThoughts", () => {
  let dwarf: Dwarf;

  beforeEach(() => {
    dwarf = createTestDwarf(50);
  });

  test("returns empty array with no thoughts", () => {
    expect(getTopThoughts(dwarf, 3)).toEqual([]);
  });

  test("returns thoughts sorted by impact", () => {
    addThought(dwarf, 100, "well_fed"); // +5
    addThought(dwarf, 100, "starving"); // -20
    addThought(dwarf, 100, "exhausted"); // -10

    const top = getTopThoughts(dwarf, 3);

    // Sorted by absolute impact: -20, -10, +5
    expect(top.length).toBe(3);
    expect(top[0]).toContain("-20");
    expect(top[1]).toContain("-10");
    expect(top[2]).toContain("+5");
  });

  test("limits to requested count", () => {
    addThought(dwarf, 100, "well_fed");
    addThought(dwarf, 100, "starving");
    addThought(dwarf, 100, "exhausted");

    expect(getTopThoughts(dwarf, 2).length).toBe(2);
  });

  test("shows stacked intensity in output", () => {
    addThought(dwarf, 100, "witnessed_death");
    addThought(dwarf, 150, "witnessed_death");

    const top = getTopThoughts(dwarf, 1);

    expect(top[0]).toContain("-60"); // -30 * 2
    expect(top[0]).toContain("x2");
  });
});

describe("grief cascade scenario", () => {
  test("multiple deaths compound unhappiness", () => {
    const dwarf = createTestDwarf(55);

    // Witness 3 deaths
    addThought(dwarf, 100, "witnessed_death");
    addThought(dwarf, 200, "witnessed_death");
    addThought(dwarf, 300, "witnessed_death");

    // 55 + (-30 * 3) = -35, clamped to 0
    expect(calculateHappiness(dwarf)).toBe(0);
    expect(getThoughtIntensity(dwarf, "witnessed_death")).toBe(3);
  });

  test("drinking doesn't wash out grief", () => {
    const dwarf = createTestDwarf(55);

    // Witness a death
    addThought(dwarf, 100, "witnessed_death");

    // Then drink (satisfying)
    addThought(dwarf, 150, "drank_while_parched");

    // Grief should still be there
    expect(hasThought(dwarf, "witnessed_death")).toBe(true);

    // 55 - 30 + 15 = 40
    expect(calculateHappiness(dwarf)).toBe(40);
  });

  test("grief decays over time but stacks refresh timer", () => {
    const dwarf = createTestDwarf(55);

    addThought(dwarf, 100, "witnessed_death");
    addThought(dwarf, 200, "witnessed_death"); // Timer refreshed

    // At tick 450, first death would have expired but stack refreshed to 200
    // 200 + 300 = 500 expiry
    decayThoughts(dwarf, 450);
    expect(hasThought(dwarf, "witnessed_death")).toBe(true);

    // After 500+, should be gone
    decayThoughts(dwarf, 501);
    expect(hasThought(dwarf, "witnessed_death")).toBe(false);
  });
});
