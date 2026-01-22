import { test, expect, describe } from "bun:test";
import { formatSummaryAsMarkdown } from "./markdown-formatter";
import type { FortressSummary } from "../scenarios/fortress/types";

/**
 * Unit tests for markdown formatter
 * Ensures summary output contains all expected sections and data
 */

// Minimal valid summary for testing
function createTestSummary(overrides: Partial<FortressSummary> = {}): FortressSummary {
  return {
    tick: 100,
    year: 251,
    season: "Spring",
    paused: false,
    resources: { wood: 20, stone: 15, food: 50, drink: 40 },
    dwarfCount: 7,
    aliveCount: 7,
    activeJobs: 5,
    jobs: {
      total: 5,
      byType: { dig: 2, chop: 1, build: 1, haul: 0, produce: 1 },
      inaccessible: 0,
    },
    items: { stone: 0, log: 0 },
    recentEvents: [],
    dwarves: [
      {
        id: 0,
        name: "Urist",
        position: { x: 5, y: 5 },
        labor: "mining",
        hunger: 30,
        thirst: 40,
        happiness: 70,
        alive: true,
        currentTask: "mining",
      },
    ],
    buildings: [],
    crises: {
      starving: [],
      dehydrating: [],
      inMood: [],
      recentDeaths: [],
    },
    statistics: {
      deaths: 0,
      deathsByStarvation: 0,
      deathsByDehydration: 0,
      deathsByInsanity: 0,
      deathsByBerserk: 0,
      peakPopulation: 7,
      artifactsCreated: 0,
      moodsTriggered: 0,
      moodsSucceeded: 0,
      moodsFailed: 0,
    },
    ...overrides,
  };
}

describe("formatSummaryAsMarkdown", () => {
  test("includes fortress name and time info", () => {
    const summary = createTestSummary({ tick: 150, year: 252, season: "Summer" });
    const md = formatSummaryAsMarkdown(summary, "Copperdeep");

    expect(md).toContain("# Fortress: Copperdeep");
    expect(md).toContain("Year 252");
    expect(md).toContain("Summer");
    expect(md).toContain("Tick 150");
  });

  test("includes resources section", () => {
    const summary = createTestSummary({
      resources: { wood: 25, stone: 30, food: 100, drink: 80 },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Resources");
    expect(md).toContain("25");  // wood
    expect(md).toContain("30");  // stone
    expect(md).toContain("100"); // food
    expect(md).toContain("80");  // drink
  });

  test("includes all job types in jobs section", () => {
    const summary = createTestSummary({
      jobs: {
        total: 10,
        byType: { dig: 3, chop: 2, build: 2, haul: 2, produce: 1 },
        inaccessible: 1,
      },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Jobs");
    expect(md).toContain("Dig: 3");
    expect(md).toContain("Chop: 2");
    expect(md).toContain("Build: 2");
    expect(md).toContain("Haul: 2");
    expect(md).toContain("Produce: 1");
  });

  test("shows inaccessible dig jobs", () => {
    const summary = createTestSummary({
      jobs: {
        total: 5,
        byType: { dig: 5, chop: 0, build: 0, haul: 0, produce: 0 },
        inaccessible: 3,
      },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("Dig: 5 (3 waiting for access)");
  });

  test("includes items on ground section when items exist", () => {
    const summary = createTestSummary({
      items: { stone: 5, log: 3 },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Items on Ground");
    expect(md).toContain("Stone: 5");
    expect(md).toContain("Logs: 3");
  });

  test("omits items section when no items on ground", () => {
    const summary = createTestSummary({
      items: { stone: 0, log: 0 },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).not.toContain("## Items on Ground");
  });

  test("includes dwarf table with all columns", () => {
    const summary = createTestSummary({
      dwarves: [
        {
          id: 1,
          name: "Lokum",
          position: { x: 10, y: 8 },
          labor: "hauling",
          hunger: 45,
          thirst: 55,
          happiness: 65,
          alive: true,
          currentTask: "hauling",
        },
      ],
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Dwarves");
    expect(md).toContain("| ID | Name");
    expect(md).toContain("Lokum");
    expect(md).toContain("hauling");
    expect(md).toContain("10,8");
  });

  test("shows dwarf thoughts when present", () => {
    const summary = createTestSummary({
      dwarves: [
        {
          id: 0,
          name: "Urist",
          position: { x: 5, y: 5 },
          labor: "mining",
          hunger: 30,
          thirst: 40,
          happiness: 20,
          alive: true,
          currentTask: "idle",
          topThoughts: ["witnessed death", "hungry"],
        },
      ],
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Thoughts");
    expect(md).toContain("Urist");
    expect(md).toContain("witnessed death");
  });

  test("includes buildings section", () => {
    const summary = createTestSummary({
      buildings: [
        { type: "workshop", x: 5, y: 5, producing: "drink" },
        { type: "stockpile", x: 3, y: 3 },
      ],
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Buildings");
    expect(md).toContain("workshop");
    expect(md).toContain("stockpile");
    expect(md).toContain("drink");
  });

  test("includes recent events", () => {
    const summary = createTestSummary({
      recentEvents: [
        { id: 1, tick: 95, message: "Tree felled", type: "info" },
        { id: 2, tick: 98, message: "Urist is hungry", type: "warning" },
      ],
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Recent Events");
    expect(md).toContain("Tree felled");
    expect(md).toContain("Urist is hungry");
  });

  test("includes crisis alerts", () => {
    const summary = createTestSummary({
      crises: {
        starving: ["Urist", "Lokum"],
        dehydrating: ["Zasit"],
        inMood: ["Fikod"],
        recentDeaths: [],
      },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Crises");
    expect(md).toContain("Starving");
    expect(md).toContain("Urist, Lokum");
    expect(md).toContain("Dehydrating");
    expect(md).toContain("Zasit");
    expect(md).toContain("In Mood");
    expect(md).toContain("Fikod");
  });

  test("includes statistics", () => {
    const summary = createTestSummary({
      statistics: {
        deaths: 2,
        deathsByStarvation: 1,
        deathsByDehydration: 1,
        deathsByInsanity: 0,
        deathsByBerserk: 0,
        peakPopulation: 9,
        artifactsCreated: 1,
        moodsTriggered: 0,
        moodsSucceeded: 0,
        moodsFailed: 0,
      },
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("## Statistics");
    expect(md).toContain("Deaths: 2");
    expect(md).toContain("starvation");
    expect(md).toContain("dehydration");
    expect(md).toContain("Peak: 9");
    expect(md).toContain("Artifacts: 1");
  });

  test("shows paused state", () => {
    const summary = createTestSummary({ paused: true });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("Paused");
  });

  test("shows running state", () => {
    const summary = createTestSummary({ paused: false });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("Running");
  });

  test("lists deceased dwarves separately", () => {
    const summary = createTestSummary({
      dwarves: [
        {
          id: 0,
          name: "Urist",
          position: { x: 5, y: 5 },
          labor: "mining",
          hunger: 100,
          thirst: 100,
          happiness: 0,
          alive: false,
          currentTask: undefined,
        },
      ],
    });
    const md = formatSummaryAsMarkdown(summary, "Test");

    expect(md).toContain("Deceased");
    expect(md).toContain("Urist");
  });
});
