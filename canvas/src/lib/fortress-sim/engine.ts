import type {
  FortressState,
  FortressCommand,
  FortressStatistics,
  Dwarf,
  Building,
  Season,
  Tile,
  Labor,
} from "../../scenarios/fortress/types";
import { generateMap, MAP_WIDTH, MAP_HEIGHT } from "./map";
import { createStartingDwarves, updateDwarfNeeds, createDwarf, killDwarf, getLivingDwarfCount, calculateWealth, getRecentDeathCount } from "./dwarf";
import {
  createStartingResources,
  consumeResources,
  addResources,
  getBuildingCost,
} from "./resources";
import { createEvent, trimEvents, EventMessages } from "./events";
import { updateAllDwarfMovement } from "./movement";
import { updateJobs, createDigJob, createBuildJob, createProductionJob } from "./jobs";
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

  // Update dwarf movement (paths to jobs, wanders when idle)
  updateAllDwarfMovement(state);

  // Update dwarf needs - only for living dwarves
  for (const dwarf of state.dwarves) {
    // Skip dead dwarves
    if (!dwarf.alive) continue;

    updateDwarfNeeds(dwarf);

    // Handle critical needs - STARVATION
    if (dwarf.hunger > 90) {
      // Try to eat
      if (state.resources.food > 0) {
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

    // Grief recovery - countdown grief ticks
    if (dwarf.griefTicks && dwarf.griefTicks > 0) {
      dwarf.griefTicks--;
    }

    // Tantrum check - very unhappy dwarves can snap
    const moodState = dwarf.moodState || "normal";
    if (dwarf.happiness < 20 && moodState === "normal") {
      // 0.5% chance per tick to snap when very unhappy
      if (Math.random() < 0.005) {
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
        const labors: Labor[] = ["mining", "carpentry", "brewing", "farming", "hauling"];
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
    state.season = seasons[nextIndex];

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
    case "dig":
      return handleDigCommand(state, command.area);

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

    default:
      return false;
  }
}

/**
 * Handle dig command - designate area for mining (creates jobs for miners)
 *
 * Strategy: Create jobs for ALL wall tiles in the area (like real DF).
 * The job assignment system will handle accessibility - dwarves will only
 * work on tiles adjacent to existing floors, and as they dig, more tiles
 * become accessible naturally.
 */
function handleDigCommand(
  state: FortressState,
  area: { x: number; y: number; width: number; height: number }
): boolean {
  let jobsCreated = 0;
  let wallsFound = 0;
  let alreadyDesignated = 0;

  for (let dy = 0; dy < area.height; dy++) {
    for (let dx = 0; dx < area.width; dx++) {
      const x = area.x + dx;
      const y = area.y + dy;

      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;

      const row = state.map[y];
      if (!row) continue;

      const tile = row[x];
      if (!tile) continue;

      // Count wall tiles for better feedback
      if (tile.type === "wall") {
        wallsFound++;

        // Create job for any undesignated wall tile
        if (!tile.dug) {
          const existingJob = state.jobs.find(j => j.type === "dig" && j.x === x && j.y === y);
          if (!existingJob) {
            state.jobs.push(createDigJob(x, y));
            jobsCreated++;
          } else {
            alreadyDesignated++;
          }
        }
      }
    }
  }

  // Provide helpful feedback
  if (jobsCreated > 0) {
    state.events.push(
      createEvent(
        state.tick,
        `Designated ${jobsCreated} tiles for mining`,
        "info"
      )
    );
    return true;
  } else if (alreadyDesignated > 0) {
    state.events.push(
      createEvent(
        state.tick,
        `${alreadyDesignated} tiles already designated`,
        "info"
      )
    );
    return true;
  } else if (wallsFound === 0) {
    state.events.push(
      createEvent(
        state.tick,
        `No diggable walls in that area (already dug or invalid terrain)`,
        "warning"
      )
    );
    return false;
  }

  return false;
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
  // Check if location is valid (must be on floor)
  if (
    location.x < 0 ||
    location.x >= MAP_WIDTH ||
    location.y < 0 ||
    location.y >= MAP_HEIGHT
  ) {
    return false;
  }

  const tile = state.map[location.y][location.x];
  if (tile.type !== "floor") {
    state.events.push(
      createEvent(state.tick, "Cannot build here - must be on dug floor", "warning")
    );
    return false;
  }

  // Check resource cost (farms are free, just need floor)
  if (structure !== "farm") {
    const cost = getBuildingCost(structure, subtype);
    if (!consumeResources(state.resources, cost)) {
      state.events.push(
        createEvent(state.tick, "Insufficient resources for construction", "warning")
      );
      return false;
    }
  }

  // Create building
  const building: Building = {
    id: nextBuildingId++,
    type: structure,
    subtype: structure === "farm" ? "farm" : subtype,
    x: location.x,
    y: location.y,
    width: structure === "workshop" ? 3 : 1,
    height: structure === "workshop" ? 3 : 1,
    built: true,
  };

  state.buildings.push(building);

  // Update map tile
  tile.type = structure;

  state.events.push(
    createEvent(state.tick, EventMessages.buildingComplete(structure, subtype), "success")
  );

  return true;
}

/**
 * Handle assign command - change dwarf's labor
 */
function handleAssignCommand(
  state: FortressState,
  dwarfId: number,
  labor: string
): boolean {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);

  if (!dwarf) {
    return false;
  }

  dwarf.labor = labor as any;
  state.events.push(
    createEvent(state.tick, `${dwarf.name} assigned to ${labor}`, "info")
  );

  return true;
}
