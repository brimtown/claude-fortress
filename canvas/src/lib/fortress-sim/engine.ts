import type {
  FortressState,
  FortressCommand,
  FortressStatistics,
  Dwarf,
  Building,
  Season,
  Tile,
  Labor,
  DesignationType,
  Item,
} from "../../scenarios/fortress/types";
import { generateMap, MAP_WIDTH, MAP_HEIGHT } from "./map";
import { createStartingDwarves, updateDwarfNeeds, createDwarf, killDwarf, getLivingDwarfCount, calculateWealth, getRecentDeathCount, getGriefIntensity } from "./dwarf";
import { addThought, calculateHappiness } from "./thoughts";
import {
  createStartingResources,
  consumeResources,
  addResources,
  getBuildingCost,
  getResourceDeficit,
} from "./resources";
import { createEvent, trimEvents, EventMessages } from "./events";
import { updateAllDwarfMovement } from "./movement";
import { updateJobs, createDigJob, createChopJob, createHaulJob, createBuildJob, createProductionJob, cancelJob } from "./jobs";
import { updateMoods } from "./moods";

let nextBuildingId = 0;

/**
 * Create initial statistics
 */
function createInitialStatistics(): FortressStatistics {
  return {
    deaths: 0,
    deathsByStarvation: 0,
    deathsByDehydration: 0,
    deathsByInsanity: 0,
    deathsByBerserk: 0,
    artifactsCreated: 0,
    peakPopulation: 7,
    moodsTriggered: 0,
    moodsSucceeded: 0,
    moodsFailed: 0,
  };
}

/**
 * Create initial fortress state
 */
export function createInitialState(fortressName: string, seed?: number): FortressState {
  return {
    map: generateMap(seed),
    dwarves: createStartingDwarves(),
    resources: createStartingResources(),
    buildings: [],
    jobs: [],
    items: [],
    events: [
      createEvent(0, `Welcome to ${fortressName}!`, "success"),
      createEvent(0, "The fortress is established. Strike the earth!", "info"),
    ],
    tick: 0,
    year: 251,
    season: "Spring",
    paused: false,
    statistics: createInitialStatistics(),
    fallen: false,
    wealth: 0,
  };
}

/**
 * Process a single simulation tick
 */
export function processTick(state: FortressState): void {
  if (state.paused) return;

  state.tick++;

  // Update job assignments and work progress
  updateJobs(state);

  // Create haul jobs for items on the ground
  createHaulJobsForItems(state);

  // Update dwarf movement (paths to jobs, wanders when idle)
  updateAllDwarfMovement(state);

  // Update dwarf needs - only for living dwarves
  for (const dwarf of state.dwarves) {
    // Skip dead dwarves
    if (!dwarf.alive) continue;

    updateDwarfNeeds(dwarf, 1, state.tick);

    // Handle critical needs - STARVATION
    if (dwarf.hunger > 90) {
      // Try to eat
      if (state.resources.food > 0) {
        // Add thought for eating while very hungry
        if (dwarf.hunger > 80) {
          addThought(dwarf, state.tick, "ate_while_starving");
          dwarf.happiness = calculateHappiness(dwarf);
        }
        state.resources.food--;
        dwarf.hunger = 0;
        dwarf.starvationTicks = 0; // Reset counter
      } else {
        // Increment starvation counter
        dwarf.starvationTicks = (dwarf.starvationTicks || 0) + 1;

        // Death after 100 ticks of starvation (~50 seconds)
        if (dwarf.starvationTicks >= 100) {
          killDwarf(state, dwarf, "starvation");
          continue; // Skip further processing for this dwarf
        }

        // Starving warning every 50 ticks
        if (state.tick % 50 === 0) {
          state.events.push(
            createEvent(state.tick, EventMessages.dwarfStarving(dwarf.name), "danger")
          );
        }
      }
    } else {
      dwarf.starvationTicks = 0; // Reset if no longer starving
    }

    // Handle critical needs - DEHYDRATION
    if (dwarf.thirst > 90) {
      // Try to drink
      if (state.resources.drink > 0) {
        // Add thought for drinking while very thirsty
        if (dwarf.thirst > 80) {
          addThought(dwarf, state.tick, "drank_while_parched");
          dwarf.happiness = calculateHappiness(dwarf);
        }
        state.resources.drink--;
        dwarf.thirst = 0;
        dwarf.dehydrationTicks = 0; // Reset counter
      } else {
        // Increment dehydration counter
        dwarf.dehydrationTicks = (dwarf.dehydrationTicks || 0) + 1;

        // Death after 100 ticks of dehydration (~50 seconds)
        if (dwarf.dehydrationTicks >= 100) {
          killDwarf(state, dwarf, "dehydration");
          continue; // Skip further processing for this dwarf
        }

        // Dehydrated warning every 50 ticks
        if (state.tick % 50 === 0) {
          state.events.push(
            createEvent(state.tick, EventMessages.dwarfDehydrated(dwarf.name), "danger")
          );
        }
      }
    } else {
      dwarf.dehydrationTicks = 0; // Reset if no longer dehydrated
    }

    // Tantrum check - very unhappy dwarves can snap
    // Grief dramatically increases berserk chance (death cascades are real)
    // Grief intensity from witnessed_death thoughts stacks, multiplying tantrum risk
    const moodState = dwarf.moodState || "normal";
    if (moodState === "normal") {
      const griefIntensity = getGriefIntensity(dwarf);  // Stacked witnessed_death thoughts
      const baseTantrumChance = griefIntensity > 0 ? 0.008 : 0.001;  // 0.8% when grieving
      const tantrumChance = baseTantrumChance * Math.max(1, griefIntensity);  // Stacks!
      const tantrumThreshold = griefIntensity > 0 ? 30 : 15;

      if (dwarf.happiness < tantrumThreshold && Math.random() < tantrumChance) {
        // Apply witnessed_tantrum to nearby dwarves before the tantrum
        const nearbyDwarves = state.dwarves.filter(d =>
          d.alive && d.id !== dwarf.id &&
          Math.abs(d.x - dwarf.x) <= 5 && Math.abs(d.y - dwarf.y) <= 5
        );
        for (const nearby of nearbyDwarves) {
          addThought(nearby, state.tick, "witnessed_tantrum", `witnessed ${dwarf.name}'s breakdown`);
          nearby.happiness = calculateHappiness(nearby);
        }

        if (Math.random() < 0.5) {
          dwarf.moodState = "berserk";
          dwarf.currentTask = "BERSERK!";
          state.events.push(
            createEvent(state.tick, EventMessages.tantrum(dwarf.name, "berserk"), "danger")
          );
        } else {
          dwarf.moodState = "melancholic";
          dwarf.currentTask = "melancholy...";
          state.events.push(
            createEvent(state.tick, EventMessages.tantrum(dwarf.name, "melancholic"), "warning")
          );
        }
      }
    }
  }

  // Track peak population
  const livingCount = getLivingDwarfCount(state.dwarves);
  if (livingCount > state.statistics.peakPopulation) {
    state.statistics.peakPopulation = livingCount;
  }

  // Update Strange Moods system
  updateMoods(state);

  // Wealth-based migration (every 500 ticks)
  if (state.tick % 500 === 0 && state.tick > 0) {
    const wealth = calculateWealth(state);
    state.wealth = wealth; // Cache for UI
    const currentLivingCount = getLivingDwarfCount(state.dwarves);
    const recentDeaths = getRecentDeathCount(state, 500);

    if (currentLivingCount === 0) {
      // No one to welcome migrants - fortress fallen
    } else if (recentDeaths >= 2) {
      // Dangerous reputation blocks migrants
      state.events.push(
        createEvent(state.tick, EventMessages.migrationBlocked(recentDeaths), "warning")
      );
    } else {
      // Wealth tiers determine migrant count
      let migrantCount = 0;
      if (wealth >= 600) {
        migrantCount = 1 + Math.floor(Math.random() * 3); // 1-3
      } else if (wealth >= 300) {
        migrantCount = 1 + Math.floor(Math.random() * 2); // 1-2
      } else if (wealth >= 100) {
        migrantCount = 1;
      }

      if (migrantCount > 0) {
        const labors: Labor[] = ["mining", "woodcutting", "carpentry", "brewing", "farming", "hauling"];
        for (let i = 0; i < migrantCount; i++) {
          const labor = labors[Math.floor(Math.random() * labors.length)];
          const newDwarf = createDwarf(5, 3, labor);
          state.dwarves.push(newDwarf);
        }
        state.events.push(
          createEvent(state.tick, EventMessages.migrantWave(migrantCount), "success")
        );
      } else {
        state.events.push(
          createEvent(state.tick, EventMessages.noMigrants(), "warning")
        );
      }
    }
  }

  // Check for resource shortages every 100 ticks
  if (state.tick % 100 === 0) {
    if (state.resources.food < 20) {
      state.events.push(
        createEvent(state.tick, EventMessages.resourceShortage("food"), "warning")
      );
    }
    if (state.resources.drink < 20) {
      state.events.push(
        createEvent(state.tick, EventMessages.resourceShortage("drink"), "warning")
      );
    }
  }

  // Update season every 300 ticks (~2.5 minutes real-time at 500ms tick)
  if (state.tick % 300 === 0 && state.tick > 0) {
    const seasons: Season[] = ["Spring", "Summer", "Autumn", "Winter"];
    const currentIndex = seasons.indexOf(state.season);
    const nextIndex = (currentIndex + 1) % seasons.length;
    state.season = seasons[nextIndex]!;

    // New year after Winter
    if (state.season === "Spring") {
      state.year++;
    }

    state.events.push(
      createEvent(state.tick, EventMessages.seasonChange(state.season, state.year), "info")
    );
  }

  // Auto-queue production jobs for workshops and farms every 20 ticks
  if (state.tick % 20 === 0) {
    for (const building of state.buildings) {
      // Skip if building already has an active job
      if (building.activeJobId !== undefined) continue;

      // Check if there's already a production job at this location
      const existingJob = state.jobs.find(
        j => j.type === "produce" && j.x === building.x && j.y === building.y
      );
      if (existingJob) {
        building.activeJobId = existingJob.id;
        continue;
      }

      // Create production jobs for stills (brewing) and farms (farming)
      if (building.type === "workshop" && building.subtype === "still") {
        const job = createProductionJob(building.x, building.y, "still", "drink", "brewing");
        state.jobs.push(job);
        building.activeJobId = job.id;
      } else if (building.type === "farm" || building.subtype === "farm") {
        const job = createProductionJob(building.x, building.y, "farm", "food", "farming");
        state.jobs.push(job);
        building.activeJobId = job.id;
      }
    }
  }

  // Check for fortress collapse (all dwarves dead)
  if (!state.fallen && getLivingDwarfCount(state.dwarves) === 0) {
    state.fallen = true;
    state.paused = true;
    state.events.push(
      createEvent(state.tick, EventMessages.fortressFallen(), "danger")
    );
  }

  // Trim events to keep memory reasonable
  state.events = trimEvents(state.events, 15);
}

/**
 * Handle a command from Claude
 */
export function handleCommand(state: FortressState, command: FortressCommand): boolean {
  switch (command.type) {
    case "designate":
      return handleDesignateCommand(state, command.designation, command.area);

    case "build":
      return handleBuildCommand(
        state,
        command.structure,
        command.location,
        command.subtype
      );

    case "assign":
      return handleAssignCommand(state, command.dwarfId, command.labor);

    case "pause":
      state.paused = command.paused;
      state.events.push(
        createEvent(
          state.tick,
          command.paused ? "Simulation paused" : "Simulation resumed",
          "info"
        )
      );
      return true;

    case "save":
      // Save command will be handled by the canvas layer
      state.events.push(createEvent(state.tick, "Fortress saved", "success"));
      return true;

    case "cancel":
      return handleCancelCommand(state, command.area);

    default:
      return false;
  }
}

/**
 * Handle designate command - unified designation for dig/chop
 *
 * Strategy: Create jobs for ALL valid tiles in the area (like real DF).
 * The job assignment system will handle accessibility - dwarves will only
 * work on tiles adjacent to existing floors, and as they work, more tiles
 * become accessible naturally.
 */
function handleDesignateCommand(
  state: FortressState,
  designation: DesignationType,
  area: { x: number; y: number; width: number; height: number }
): boolean {
  let jobsCreated = 0;
  let validTilesFound = 0;
  let alreadyDesignated = 0;

  const targetTileType = designation === "dig" ? "wall" : "tree";
  const jobType = designation === "dig" ? "dig" : "chop";

  for (let dy = 0; dy < area.height; dy++) {
    for (let dx = 0; dx < area.width; dx++) {
      const x = area.x + dx;
      const y = area.y + dy;

      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;

      const row = state.map[y];
      if (!row) continue;

      const tile = row[x];
      if (!tile) continue;

      // Check if this tile matches the designation type
      if (tile.type === targetTileType) {
        validTilesFound++;

        // For dig, skip already-dug tiles
        if (designation === "dig" && tile.dug) continue;

        // Check for existing job
        const existingJob = state.jobs.find(j => j.type === jobType && j.x === x && j.y === y);
        if (!existingJob) {
          if (designation === "dig") {
            state.jobs.push(createDigJob(x, y));
          } else {
            state.jobs.push(createChopJob(x, y));
          }
          jobsCreated++;
        } else {
          alreadyDesignated++;
        }
      }
    }
  }

  // Provide helpful feedback
  const actionVerb = designation === "dig" ? "mining" : "chopping";
  const targetName = designation === "dig" ? "walls" : "trees";

  if (jobsCreated > 0) {
    state.events.push(
      createEvent(
        state.tick,
        `Designated ${jobsCreated} ${jobsCreated === 1 ? "tile" : "tiles"} for ${actionVerb}`,
        "info"
      )
    );
    return true;
  } else if (alreadyDesignated > 0) {
    state.events.push(
      createEvent(
        state.tick,
        `${alreadyDesignated} ${alreadyDesignated === 1 ? "tile" : "tiles"} already designated`,
        "info"
      )
    );
    return true;
  } else if (validTilesFound === 0) {
    state.events.push(
      createEvent(
        state.tick,
        `No ${targetName} in that area`,
        "warning"
      )
    );
    return false;
  }

  return false;
}

/**
 * Handle cancel command - remove dig/chop designations from an area
 */
function handleCancelCommand(
  state: FortressState,
  area: { x: number; y: number; width: number; height: number }
): boolean {
  let jobsCancelled = 0;

  for (let dy = 0; dy < area.height; dy++) {
    for (let dx = 0; dx < area.width; dx++) {
      const x = area.x + dx;
      const y = area.y + dy;

      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;

      // Find and remove unassigned dig or chop jobs at this location
      const jobIndex = state.jobs.findIndex(
        (j) => (j.type === "dig" || j.type === "chop") && j.x === x && j.y === y && !j.assignedDwarfId
      );

      if (jobIndex !== -1) {
        state.jobs.splice(jobIndex, 1);
        jobsCancelled++;
      }
    }
  }

  if (jobsCancelled > 0) {
    state.events.push(
      createEvent(state.tick, `Cancelled ${jobsCancelled} designation${jobsCancelled > 1 ? "s" : ""}`, "info")
    );
    return true;
  } else {
    state.events.push(
      createEvent(state.tick, "No unassigned designations in that area", "warning")
    );
    return false;
  }
}

/**
 * Handle build command - construct a building
 */
function handleBuildCommand(
  state: FortressState,
  structure: "workshop" | "stockpile" | "bed" | "farm",
  location: { x: number; y: number },
  subtype?: string
): boolean {
  // Check if location is valid (bounds check)
  if (
    location.x < 0 ||
    location.x >= MAP_WIDTH ||
    location.y < 0 ||
    location.y >= MAP_HEIGHT
  ) {
    state.events.push(
      createEvent(state.tick, `Cannot build at (${location.x}, ${location.y}) - coordinates out of bounds`, "warning")
    );
    return false;
  }

  const tile = state.map[location.y]?.[location.x];
  if (!tile || (tile.type !== "floor" && tile.type !== "grass")) {
    state.events.push(
      createEvent(state.tick, `Cannot build at (${location.x}, ${location.y}) - must be on floor or grass`, "warning")
    );
    return false;
  }

  // Check resource cost (farms are free, just need floor)
  if (structure !== "farm") {
    const cost = getBuildingCost(structure, subtype);
    if (!consumeResources(state.resources, cost)) {
      const deficit = getResourceDeficit(state.resources, cost);
      state.events.push(
        createEvent(state.tick, `Insufficient resources: ${deficit}`, "warning")
      );
      return false;
    }
  }

  // Create building
  const building: Building = {
    id: nextBuildingId++,
    type: structure,
    subtype: structure === "farm" ? "farm" : (subtype as Building["subtype"]),
    x: location.x,
    y: location.y,
    width: structure === "workshop" ? 3 : 1,
    height: structure === "workshop" ? 3 : 1,
    built: true,
  };

  state.buildings.push(building);

  // Update map tile
  tile!.type = structure;

  state.events.push(
    createEvent(state.tick, EventMessages.buildingComplete(structure, subtype), "success")
  );

  return true;
}

/**
 * Handle assign command - change dwarf's labor
 */
const VALID_LABORS: Labor[] = ["mining", "woodcutting", "carpentry", "brewing", "farming", "hauling"];

function handleAssignCommand(
  state: FortressState,
  dwarfId: number,
  labor: string
): boolean {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);

  if (!dwarf) {
    state.events.push(
      createEvent(state.tick, `Dwarf #${dwarfId} does not exist`, "warning")
    );
    return false;
  }

  if (!dwarf.alive) {
    state.events.push(
      createEvent(state.tick, `${dwarf.name} is dead and cannot be assigned`, "warning")
    );
    return false;
  }

  if (!VALID_LABORS.includes(labor as Labor)) {
    state.events.push(
      createEvent(state.tick, `Invalid labor "${labor}". Valid options: ${VALID_LABORS.join(", ")}`, "warning")
    );
    return false;
  }

  // Cancel current job before changing labor (clears currentTask, drops carried items)
  if (dwarf.currentJob) {
    cancelJob(dwarf, state);
  }

  dwarf.labor = labor as Labor;
  state.events.push(
    createEvent(state.tick, `${dwarf.name} assigned to ${labor}`, "info")
  );

  return true;
}

/**
 * Create haul jobs for items on the ground that need to be moved to stockpiles
 */
function createHaulJobsForItems(state: FortressState): void {
  for (const item of state.items) {
    // Skip if being carried
    if (item.carriedBy !== undefined) continue;

    // Skip if already has a haul job
    const existingJob = state.jobs.find(
      j => j.type === "haul" && j.itemId === item.id
    );
    if (existingJob) continue;

    // Find matching stockpile
    // Stockpiles with matching subtype are preferred, but generic stockpiles (no subtype) accept all
    const stockpileSubtype = item.type === "stone" ? "stone" : "wood";
    let stockpile = state.buildings.find(
      b => b.type === "stockpile" && b.subtype === stockpileSubtype
    );
    // Fall back to generic stockpile if no typed one exists
    if (!stockpile) {
      stockpile = state.buildings.find(
        b => b.type === "stockpile" && !b.subtype
      );
    }

    // No matching stockpile - item stays on ground
    if (!stockpile) continue;

    // Create haul job
    const job = createHaulJob(item, stockpile.x, stockpile.y);
    state.jobs.push(job);
  }
}
