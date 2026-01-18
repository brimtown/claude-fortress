/**
 * Strange Moods System
 *
 * In Dwarf Fortress, strange moods cause dwarves to:
 * 1. Claim a workshop
 * 2. Demand specific materials
 * 3. Create a legendary artifact (success) OR go insane (failure)
 *
 * This creates dramatic tension and emergent narratives.
 */

import type { Dwarf, FortressState, MoodState, Building } from "../../scenarios/fortress/types";
import { createEvent, EventMessages } from "./events";
import { killDwarf } from "./dwarf";

// Artifact name components for generating legendary item names
const ARTIFACT_PREFIXES = [
  "Golden", "Silver", "Iron", "Stone", "Bloody", "Sacred", "Ancient",
  "Glittering", "Dark", "Bright", "Frozen", "Burning", "Eternal"
];

const ARTIFACT_NOUNS = [
  "Crown", "Scepter", "Hammer", "Shield", "Throne", "Goblet", "Ring",
  "Helm", "Blade", "Chalice", "Amulet", "Totem", "Statue", "Door"
];

const ARTIFACT_SUFFIXES = [
  "of Destiny", "of Ages", "of Power", "of Doom", "of Light", "of Shadows",
  "the Magnificent", "the Terrible", "the Wise", "the Eternal"
];

// Mood types with their characteristics
const MOOD_TYPES: MoodState[] = ["fey", "possessed", "secretive"];

// Materials that can be demanded (simple version - from available resources)
const DEMANDABLE_MATERIALS = ["wood", "stone", "food"];

/**
 * Generate a legendary artifact name
 */
export function generateArtifactName(): string {
  const prefix = ARTIFACT_PREFIXES[Math.floor(Math.random() * ARTIFACT_PREFIXES.length)];
  const noun = ARTIFACT_NOUNS[Math.floor(Math.random() * ARTIFACT_NOUNS.length)];
  const suffix = ARTIFACT_SUFFIXES[Math.floor(Math.random() * ARTIFACT_SUFFIXES.length)];
  return `${prefix} ${noun} ${suffix}`;
}

/**
 * Generate random material demands (1-2 materials)
 */
function generateMoodDemands(): string[] {
  const numDemands = 1 + Math.floor(Math.random() * 2); // 1 or 2 materials
  const demands: string[] = [];

  for (let i = 0; i < numDemands; i++) {
    const material = DEMANDABLE_MATERIALS[Math.floor(Math.random() * DEMANDABLE_MATERIALS.length)]!;
    if (!demands.includes(material)) {
      demands.push(material);
    }
  }

  return demands;
}

/**
 * Check if the fortress has the required materials for a mood
 */
export function hasMoodMaterials(state: FortressState, demands: string[]): boolean {
  for (const demand of demands) {
    switch (demand) {
      case "wood":
        if (state.resources.wood < 5) return false;
        break;
      case "stone":
        if (state.resources.stone < 5) return false;
        break;
      case "food":
        if (state.resources.food < 5) return false;
        break;
    }
  }
  return true;
}

/**
 * Consume materials for mood completion
 */
function consumeMoodMaterials(state: FortressState, demands: string[]): void {
  for (const demand of demands) {
    switch (demand) {
      case "wood":
        state.resources.wood = Math.max(0, state.resources.wood - 5);
        break;
      case "stone":
        state.resources.stone = Math.max(0, state.resources.stone - 5);
        break;
      case "food":
        state.resources.food = Math.max(0, state.resources.food - 5);
        break;
    }
  }
}

/**
 * Find an available workshop for a dwarf to claim
 */
function findAvailableWorkshop(state: FortressState): Building | null {
  // Find workshops not already claimed
  const availableWorkshops = state.buildings.filter(
    b => b.type === "workshop" && !b.claimedByDwarfId
  );

  if (availableWorkshops.length === 0) return null;

  // Return random available workshop
  return availableWorkshops[Math.floor(Math.random() * availableWorkshops.length)] ?? null;
}

/**
 * Trigger a strange mood on a dwarf
 */
export function triggerStrangeMood(state: FortressState, dwarf: Dwarf): boolean {
  // Can't trigger mood if already in one
  if (dwarf.moodState && dwarf.moodState !== "normal") return false;

  // Can't trigger if dead
  if (!dwarf.alive) return false;

  // Find available workshop
  const workshop = findAvailableWorkshop(state);
  if (!workshop) {
    // No workshop available - mood fails immediately with melancholy
    dwarf.moodState = "melancholic";
    state.events.push(
      createEvent(state.tick, `${dwarf.name} could not find a workshop for their mood...`, "warning")
    );
    state.statistics.moodsTriggered++;
    state.statistics.moodsFailed++;
    return false;
  }

  // Pick random mood type
  const moodType = MOOD_TYPES[Math.floor(Math.random() * MOOD_TYPES.length)];

  // Generate demands
  const demands = generateMoodDemands();

  // Set up mood state on dwarf
  dwarf.moodState = moodType;
  dwarf.claimedBuildingId = workshop.id;
  dwarf.moodDemands = demands;
  dwarf.moodProgress = 0;
  dwarf.moodStartTick = state.tick;
  dwarf.moodDeadline = state.tick + 200; // ~100 seconds to complete

  // Mark workshop as claimed
  workshop.claimedByDwarfId = dwarf.id;
  workshop.claimedAtTick = state.tick;

  // Cancel any current job
  if (dwarf.currentJob) {
    dwarf.currentJob.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
  }
  dwarf.currentTask = "strange mood!";

  // Update statistics
  state.statistics.moodsTriggered++;

  // Create events
  state.events.push(
    createEvent(
      state.tick,
      EventMessages.moodStruck(dwarf.name, moodType!, workshop.subtype || "workshop"),
      "warning"
    )
  );
  state.events.push(
    createEvent(state.tick, EventMessages.moodDemands(dwarf.name, demands), "info")
  );

  return true;
}

/**
 * Update mood progress for a single dwarf
 * Called each tick for dwarves in a mood
 */
export function updateMoodProgress(state: FortressState, dwarf: Dwarf): void {
  // Skip if not in a mood
  if (!dwarf.moodState || dwarf.moodState === "normal") return;

  // Skip if dead
  if (!dwarf.alive) return;

  // Handle insanity states (melancholic or berserk)
  if (dwarf.moodState === "melancholic") {
    // Melancholic dwarves refuse to eat/drink and eventually starve
    // Speed up starvation
    dwarf.hunger = Math.min(100, dwarf.hunger + 2);
    dwarf.thirst = Math.min(100, dwarf.thirst + 2);

    // Death is handled by the normal death system
    return;
  }

  if (dwarf.moodState === "berserk") {
    // Berserk dwarves attack nearest living dwarf
    const targets = state.dwarves.filter(d => d.alive && d.id !== dwarf.id);
    if (targets.length > 0) {
      // Find nearest target
      let nearest = targets[0]!;
      let nearestDist = Math.abs(nearest.x - dwarf.x) + Math.abs(nearest.y - dwarf.y);

      for (const target of targets) {
        const dist = Math.abs(target.x - dwarf.x) + Math.abs(target.y - dwarf.y);
        if (dist < nearestDist) {
          nearest = target;
          nearestDist = dist;
        }
      }

      // If adjacent, attack!
      if (nearestDist <= 1) {
        state.events.push(
          createEvent(state.tick, EventMessages.berserkAttack(dwarf.name, nearest.name), "danger")
        );
        // Kill the victim
        killDwarf(state, nearest, "berserk_attack");

        // 50% chance berserk dwarf dies too in the fight
        if (Math.random() < 0.5) {
          killDwarf(state, dwarf, "berserk_attack");
        }
      } else {
        // Move toward nearest target
        const dx = Math.sign(nearest.x - dwarf.x);
        const dy = Math.sign(nearest.y - dwarf.y);
        dwarf.x += dx;
        dwarf.y += dy;
      }
    }
    return;
  }

  // Check deadline - did the mood fail?
  if (state.tick > (dwarf.moodDeadline || Infinity)) {
    failMood(state, dwarf);
    return;
  }

  // Find claimed workshop
  const workshop = state.buildings.find(b => b.id === dwarf.claimedBuildingId);
  if (!workshop) {
    // Workshop destroyed? Fail the mood
    failMood(state, dwarf);
    return;
  }

  // Check if dwarf is at workshop
  const atWorkshop =
    Math.abs(dwarf.x - workshop.x) <= 1 && Math.abs(dwarf.y - workshop.y) <= 1;

  if (!atWorkshop) {
    // Move toward workshop (simple greedy pathfinding)
    const dx = Math.sign(workshop.x - dwarf.x);
    const dy = Math.sign(workshop.y - dwarf.y);

    // Try to move (check if target is walkable)
    const newX = dwarf.x + dx;
    const newY = dwarf.y + dy;
    const tile = state.map[newY]?.[newX];
    if (tile && (tile.type === "floor" || tile.type === "workshop")) {
      dwarf.x = newX;
      dwarf.y = newY;
    }
    return;
  }

  // At workshop - check if we have materials
  if (!dwarf.moodDemands || !hasMoodMaterials(state, dwarf.moodDemands)) {
    // Can't make progress without materials
    // Show warning every 50 ticks
    if (state.tick % 50 === 0) {
      state.events.push(
        createEvent(
          state.tick,
          `${dwarf.name} waits impatiently for materials...`,
          "warning"
        )
      );
    }
    return;
  }

  // Make progress on artifact
  dwarf.moodProgress = (dwarf.moodProgress || 0) + 2; // ~50 ticks to complete

  // Check for completion
  if (dwarf.moodProgress >= 100) {
    completeMood(state, dwarf);
  }
}

/**
 * Complete a mood successfully - create artifact
 */
function completeMood(state: FortressState, dwarf: Dwarf): void {
  // Consume materials
  if (dwarf.moodDemands) {
    consumeMoodMaterials(state, dwarf.moodDemands);
  }

  // Generate artifact name
  const artifactName = generateArtifactName();
  dwarf.artifactCreated = artifactName;
  dwarf.isLegendary = true;

  // Reset mood state
  dwarf.moodState = "normal";
  dwarf.claimedBuildingId = undefined;
  dwarf.moodDemands = undefined;
  dwarf.moodProgress = undefined;
  dwarf.moodStartTick = undefined;
  dwarf.moodDeadline = undefined;
  dwarf.currentTask = undefined;

  // Clear workshop claim
  const workshop = state.buildings.find(b => b.claimedByDwarfId === dwarf.id);
  if (workshop) {
    workshop.claimedByDwarfId = undefined;
    workshop.claimedAtTick = undefined;
  }

  // Boost happiness
  dwarf.happiness = 100;

  // Update statistics
  state.statistics.artifactsCreated++;
  state.statistics.moodsSucceeded++;

  // Create event
  state.events.push(
    createEvent(state.tick, EventMessages.moodSuccess(dwarf.name, artifactName), "success")
  );
}

/**
 * Fail a mood - dwarf goes insane
 */
function failMood(state: FortressState, dwarf: Dwarf): void {
  // Clear workshop claim
  const workshop = state.buildings.find(b => b.claimedByDwarfId === dwarf.id);
  if (workshop) {
    workshop.claimedByDwarfId = undefined;
    workshop.claimedAtTick = undefined;
  }

  // 50% chance berserk, 50% melancholic
  const outcome = Math.random() < 0.5 ? "berserk" : "melancholic";
  dwarf.moodState = outcome;

  // Clear mood tracking (but not the moodState itself)
  dwarf.claimedBuildingId = undefined;
  dwarf.moodDemands = undefined;
  dwarf.moodProgress = undefined;
  dwarf.moodDeadline = undefined;
  dwarf.currentTask = outcome === "berserk" ? "BERSERK!" : "melancholy...";

  // Update statistics
  state.statistics.moodsFailed++;

  // Create event
  state.events.push(
    createEvent(state.tick, EventMessages.moodFailed(dwarf.name, outcome), "danger")
  );
}

/**
 * Check if any dwarf should enter a strange mood
 * Called from the main game loop
 */
export function checkForStrangeMoods(state: FortressState): void {
  // Low probability per tick: ~0.05% chance (about once per 2000 ticks / ~17 minutes)
  if (Math.random() > 0.0005) return;

  // Need at least one workshop
  const hasWorkshop = state.buildings.some(b => b.type === "workshop" && !b.claimedByDwarfId);
  if (!hasWorkshop) return;

  // Find eligible dwarves (alive, not already in mood, somewhat unhappy increases chance)
  const eligibleDwarves = state.dwarves.filter(d =>
    d.alive &&
    (!d.moodState || d.moodState === "normal") &&
    !d.isLegendary // Legendary dwarves don't get moods
  );

  if (eligibleDwarves.length === 0) return;

  // Weight by unhappiness - unhappy dwarves are more likely
  const weights = eligibleDwarves.map(d => {
    // Base weight
    let weight = 1;
    // Unhappy dwarves 3x more likely
    if (d.happiness < 40) weight = 3;
    // Very unhappy 5x more likely
    if (d.happiness < 20) weight = 5;
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < eligibleDwarves.length; i++) {
    random -= weights[i]!;
    if (random <= 0) {
      triggerStrangeMood(state, eligibleDwarves[i]!);
      return;
    }
  }
}

/**
 * Update all moods in the game
 * Called each tick from the main game loop
 */
export function updateMoods(state: FortressState): void {
  // Update progress for all dwarves in moods
  for (const dwarf of state.dwarves) {
    if (dwarf.moodState && dwarf.moodState !== "normal") {
      updateMoodProgress(state, dwarf);
    }
  }

  // Check if any new mood should trigger
  checkForStrangeMoods(state);
}
