import type { Dwarf, Labor, DeathCause, FortressState } from "../../scenarios/fortress/types";
import { createEvent, EventMessages } from "./events";

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
  return {
    id: nextDwarfId++,
    name: generateDwarfName(),
    x,
    y,
    hunger: 0,
    thirst: 0,
    energy: 100,
    labor: labor || "hauling",
    happiness: 50,
    alive: true,
  };
}

/**
 * Create the starting 7 dwarves
 */
export function createStartingDwarves(): Dwarf[] {
  const dwarves: Dwarf[] = [];
  const labors: Labor[] = ["mining", "mining", "carpentry", "brewing", "farming", "hauling", "hauling"];

  for (let i = 0; i < 7; i++) {
    // Place them in the starting area
    const x = 3 + (i % 4) * 2;
    const y = 2 + Math.floor(i / 4) * 2;
    dwarves.push(createDwarf(x, y, labors[i]));
  }

  return dwarves;
}

/**
 * Update dwarf needs over time
 */
export function updateDwarfNeeds(dwarf: Dwarf, delta: number = 1): void {
  // Increase hunger and thirst over time
  dwarf.hunger = Math.min(100, dwarf.hunger + delta * 0.5);
  dwarf.thirst = Math.min(100, dwarf.thirst + delta * 1.0);

  // Decrease energy if working
  if (dwarf.currentTask) {
    dwarf.energy = Math.max(0, dwarf.energy - delta * 0.3);
  } else {
    // Recover energy when idle
    dwarf.energy = Math.min(100, dwarf.energy + delta * 0.5);
  }

  // Happiness affected by needs
  let happiness = 50; // Base happiness

  if (dwarf.hunger > 70) happiness -= 20;
  else if (dwarf.hunger < 30) happiness += 10;

  if (dwarf.thirst > 70) happiness -= 25;
  else if (dwarf.thirst < 30) happiness += 10;

  if (dwarf.energy < 20) happiness -= 15;
  else if (dwarf.energy > 80) happiness += 5;

  dwarf.happiness = Math.max(0, Math.min(100, happiness));
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
}

/**
 * Get count of living dwarves
 */
export function getLivingDwarfCount(dwarves: Dwarf[]): number {
  return dwarves.filter(d => d.alive).length;
}
