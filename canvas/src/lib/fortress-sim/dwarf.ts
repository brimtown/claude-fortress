import type { Dwarf, Labor, DeathCause, FortressState } from "../../scenarios/fortress/types";
import { createEvent, EventMessages } from "./events";
import {
  generatePersonality,
  addThought,
  removeConditionThought,
  hasThought,
  decayThoughts,
  calculateHappiness,
  getThoughtIntensity,
} from "./thoughts";

const FIRST_NAMES = [
  "Urist", "Kol", "Domas", "Rigoth", "Sigun", "Kulet", "Zasit",
  "Dodok", "Melbil", "Rovod", "Eral", "Kogsak", "Lokum", "Shem"
];

const LAST_NAMES = [
  "McDigger", "Stonebeard", "Ironhelm", "Copperhand", "Goldtooth",
  "Boulderback", "Craftsman", "Brewmaster", "Carpenter", "Miner",
  "Steelforge", "Hammerhold", "Deepdelve", "Mountainhome"
];

let nextDwarfId = 0;

/**
 * Generate a random dwarf name
 */
export function generateDwarfName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

/**
 * Create a new dwarf with default stats
 */
export function createDwarf(x: number, y: number, labor?: Labor): Dwarf {
  const personality = generatePersonality();
  return {
    id: nextDwarfId++,
    name: generateDwarfName(),
    x,
    y,
    hunger: Math.random() * 20,           // Start with slight variation (0-20)
    thirst: Math.random() * 20,           // Start with slight variation (0-20)
    energy: 80 + Math.random() * 20,      // Start with slight variation (80-100)
    labor: labor || "hauling",
    happiness: personality.baseHappiness, // Start at base happiness from personality
    alive: true,
    // Individual metabolism - creates natural variation in when dwarves need resources
    needRates: {
      hunger: 0.3 + Math.random() * 0.2,  // 0.3-0.5 (base 0.4)
      thirst: 0.5 + Math.random() * 0.4,  // 0.5-0.9 (base 0.7)
    },
    // Thoughts system
    thoughts: [],
    personality,
  };
}

/**
 * Create the starting 7 dwarves
 * Spawns in the outdoor area (top-left of map) in a loose group
 */
export function createStartingDwarves(): Dwarf[] {
  const dwarves: Dwarf[] = [];
  const labors: Labor[] = ["mining", "mining", "carpentry", "brewing", "farming", "hauling", "hauling"];

  for (let i = 0; i < 7; i++) {
    // Place them in the upper outdoor area (grass), where outdoor is widest
    const x = 2 + (i % 3) * 2;           // x: 2, 4, 6, 2, 4, 6, 2
    const y = 3 + Math.floor(i / 3) * 2; // y: 3, 3, 3, 5, 5, 5, 7
    dwarves.push(createDwarf(x, y, labors[i]));
  }

  return dwarves;
}

/**
 * Update dwarf needs over time
 * Now uses the thoughts system for persistent, decaying happiness modifiers
 */
export function updateDwarfNeeds(dwarf: Dwarf, delta: number = 1, currentTick: number = 0): void {
  // Increase hunger and thirst over time using individual rates
  const hungerRate = dwarf.needRates?.hunger ?? 0.4;
  const thirstRate = dwarf.needRates?.thirst ?? 0.7;
  dwarf.hunger = Math.min(100, dwarf.hunger + delta * hungerRate);
  dwarf.thirst = Math.min(100, dwarf.thirst + delta * thirstRate);

  // Decrease energy if working
  if (dwarf.currentTask) {
    dwarf.energy = Math.max(0, dwarf.energy - delta * 0.3);
  } else {
    // Recover energy when idle
    dwarf.energy = Math.min(100, dwarf.energy + delta * 0.5);
  }

  // Decay expired thoughts
  decayThoughts(dwarf, currentTick);

  // Update condition-based thoughts based on current needs
  // Hunger thoughts
  if (dwarf.hunger > 70) {
    if (!hasThought(dwarf, "starving")) {
      addThought(dwarf, currentTick, "starving");
    }
    removeConditionThought(dwarf, "well_fed");
  } else if (dwarf.hunger < 30) {
    if (!hasThought(dwarf, "well_fed")) {
      addThought(dwarf, currentTick, "well_fed");
    }
    removeConditionThought(dwarf, "starving");
  } else {
    removeConditionThought(dwarf, "starving");
    removeConditionThought(dwarf, "well_fed");
  }

  // Thirst thoughts
  if (dwarf.thirst > 70) {
    if (!hasThought(dwarf, "dehydrated")) {
      addThought(dwarf, currentTick, "dehydrated");
    }
    removeConditionThought(dwarf, "well_hydrated");
  } else if (dwarf.thirst < 30) {
    if (!hasThought(dwarf, "well_hydrated")) {
      addThought(dwarf, currentTick, "well_hydrated");
    }
    removeConditionThought(dwarf, "dehydrated");
  } else {
    removeConditionThought(dwarf, "dehydrated");
    removeConditionThought(dwarf, "well_hydrated");
  }

  // Energy thoughts
  if (dwarf.energy < 20) {
    if (!hasThought(dwarf, "exhausted")) {
      addThought(dwarf, currentTick, "exhausted");
    }
  } else {
    removeConditionThought(dwarf, "exhausted");
  }

  // Calculate happiness from personality + thoughts
  dwarf.happiness = calculateHappiness(dwarf);
}

/**
 * Get dwarf status string
 */
export function getDwarfStatus(dwarf: Dwarf): string {
  if (dwarf.hunger > 90) return "Starving!";
  if (dwarf.thirst > 90) return "Dehydrated!";
  if (dwarf.energy < 10) return "Exhausted";
  if (dwarf.currentTask) return dwarf.currentTask;
  return "Idle";
}

/**
 * Get overall mood based on happiness
 */
export function getDwarfMood(happiness: number): string {
  if (happiness >= 80) return "Ecstatic";
  if (happiness >= 60) return "Happy";
  if (happiness >= 40) return "Content";
  if (happiness >= 20) return "Unhappy";
  return "Miserable";
}

/**
 * Get average happiness across all living dwarves
 */
export function getAverageHappiness(dwarves: Dwarf[]): number {
  const livingDwarves = dwarves.filter(d => d.alive);
  if (livingDwarves.length === 0) return 0;
  const total = livingDwarves.reduce((sum, d) => sum + d.happiness, 0);
  return Math.round(total / livingDwarves.length);
}

/**
 * Kill a dwarf - set dead state, create corpse event, update statistics
 */
export function killDwarf(
  state: FortressState,
  dwarf: Dwarf,
  cause: DeathCause
): void {
  if (!dwarf.alive) return; // Already dead

  dwarf.alive = false;
  dwarf.deathCause = cause;
  dwarf.deathTick = state.tick;

  // Cancel any current job
  if (dwarf.currentJob) {
    dwarf.currentJob.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
    dwarf.currentTask = undefined;
  }

  // Update statistics
  state.statistics.deaths++;
  switch (cause) {
    case "starvation":
      state.statistics.deathsByStarvation++;
      break;
    case "dehydration":
      state.statistics.deathsByDehydration++;
      break;
    case "insanity":
      state.statistics.deathsByInsanity++;
      break;
    case "berserk_attack":
      state.statistics.deathsByBerserk++;
      break;
  }

  // Create dramatic death event
  state.events.push(
    createEvent(state.tick, EventMessages.dwarfDeath(dwarf.name, cause), "danger")
  );

  // Apply grief to all living dwarves
  applyGrief(state, dwarf);
}

/**
 * Get count of living dwarves
 */
export function getLivingDwarfCount(dwarves: Dwarf[]): number {
  return dwarves.filter(d => d.alive).length;
}

/**
 * Apply grief to all living dwarves when someone dies
 * Part of the tantrum spiral mechanic - now uses thoughts system
 */
export function applyGrief(state: FortressState, deadDwarf: Dwarf): void {
  const livingDwarves = state.dwarves.filter(d => d.alive && d.id !== deadDwarf.id);

  for (const dwarf of livingDwarves) {
    // Apply empathy modifier to grief intensity
    // Higher empathy = feels grief more strongly (but we add the same thought, it stacks)
    addThought(dwarf, state.tick, "witnessed_death", `witnessed ${deadDwarf.name}'s death`);

    // Immediately recalculate happiness
    dwarf.happiness = calculateHappiness(dwarf);
  }
}

/**
 * Get grief intensity for tantrum calculations
 * Returns the number of stacked witnessed_death thoughts
 */
export function getGriefIntensity(dwarf: Dwarf): number {
  return getThoughtIntensity(dwarf, "witnessed_death");
}

/**
 * Get count of recent deaths (for migration blocking)
 */
export function getRecentDeathCount(state: FortressState, windowTicks: number): number {
  const cutoff = state.tick - windowTicks;
  return state.dwarves.filter(d =>
    !d.alive && d.deathTick !== undefined && d.deathTick >= cutoff
  ).length;
}

/**
 * Calculate fortress wealth for migration
 */
export function calculateWealth(state: FortressState): number {
  let wealth = 0;

  // Resources (1 point each)
  wealth += state.resources.wood;
  wealth += state.resources.stone;
  wealth += state.resources.food;
  wealth += state.resources.drink;

  // Buildings (10 points each)
  wealth += state.buildings.length * 10;

  // Artifacts (100 points each)
  wealth += (state.statistics.artifactsCreated || 0) * 100;

  // Living dwarves (20 points each)
  wealth += getLivingDwarfCount(state.dwarves) * 20;

  return wealth;
}
