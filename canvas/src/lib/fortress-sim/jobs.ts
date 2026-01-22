import type { Job, Dwarf, FortressState, Labor, Building, Item } from "../../scenarios/fortress/types";
import { createEvent } from "./events";
import { MAP_WIDTH, MAP_HEIGHT } from "./map";
import { hasThought } from "./thoughts";

let nextJobId = 0;
let nextItemId = 0;

/**
 * Create a dig job
 */
export function createDigJob(x: number, y: number): Job {
  return {
    id: nextJobId++,
    type: "dig",
    x,
    y,
    progress: 0,
    requiredLabor: "mining",
  };
}

/**
 * Create a chop job (for trees)
 */
export function createChopJob(x: number, y: number): Job {
  return {
    id: nextJobId++,
    type: "chop",
    x,
    y,
    progress: 0,
    requiredLabor: "woodcutting",
  };
}

/**
 * Create a haul job for an item
 */
export function createHaulJob(item: Item, stockpileX: number, stockpileY: number): Job {
  return {
    id: nextJobId++,
    type: "haul",
    x: item.x,
    y: item.y,
    targetX: stockpileX,
    targetY: stockpileY,
    itemId: item.id,
    phase: "pickup",
    progress: 0,
    requiredLabor: "hauling",
  };
}

/**
 * Create an item on the ground
 */
export function createItem(type: Item["type"], x: number, y: number): Item {
  return {
    id: nextItemId++,
    type,
    x,
    y,
  };
}

/**
 * Create a build job
 */
export function createBuildJob(
  x: number,
  y: number,
  buildingType: "workshop" | "stockpile" | "bed" | "farm",
  buildingSubtype?: string
): Job {
  return {
    id: nextJobId++,
    type: "build",
    x,
    y,
    progress: 0,
    requiredLabor: "carpentry",
    buildingType,
    buildingSubtype,
  };
}

/**
 * Create a production job at a workshop/farm
 */
export function createProductionJob(
  x: number,
  y: number,
  buildingSubtype: string,
  outputType: "food" | "drink",
  requiredLabor: Labor
): Job {
  return {
    id: nextJobId++,
    type: "produce",
    x,
    y,
    progress: 0,
    requiredLabor,
    buildingSubtype,
    outputType,
    outputQuantity: 5, // Produce 5 units per job
  };
}

/**
 * Check if a tile is accessible (adjacent to a floor tile)
 * This ensures dwarves can only work on tiles they can reach
 */
export function isJobAccessible(state: FortressState, x: number, y: number): boolean {
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],  // cardinal
    [-1, -1], [1, -1], [-1, 1], [1, 1]  // diagonal
  ];

  for (const dir of directions) {
    const [dx, dy] = dir as [number, number];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;

    const neighbor = state.map[ny]?.[nx];
    // Job is accessible if adjacent to walkable tile (floor, grass, or previously dug)
    if (neighbor?.type === "floor" || neighbor?.type === "grass" || neighbor?.dug) {
      return true;
    }
  }
  return false;
}

/**
 * Find an available job for a dwarf
 * Prioritizes accessible jobs (adjacent to existing floors)
 */
export function findJobForDwarf(state: FortressState, dwarf: Dwarf): Job | null {
  // Dead dwarves don't work
  if (!dwarf.alive) {
    return null;
  }

  // Don't assign jobs if critical needs
  if (dwarf.hunger > 90 || dwarf.thirst > 90) {
    return null;
  }

  // Find unassigned job matching dwarf's labor
  // For dig/chop jobs, only assign accessible ones (next to walkable tiles)
  for (const job of state.jobs) {
    if (!job.assignedDwarfId && job.requiredLabor === dwarf.labor) {
      // Dig and chop jobs must be accessible (adjacent to walkable tile)
      if (job.type === "dig" || job.type === "chop") {
        if (isJobAccessible(state, job.x, job.y)) {
          return job;
        }
        // Skip inaccessible jobs for now - they'll become accessible as work progresses
      } else {
        // Non-dig/chop jobs don't have accessibility requirements
        return job;
      }
    }
  }

  return null;
}

/**
 * Assign a job to a dwarf
 */
export function assignJob(dwarf: Dwarf, job: Job): void {
  dwarf.currentJob = job;
  job.assignedDwarfId = dwarf.id;
  dwarf.pathingTicks = 0;  // Reset pathing counter
}

/**
 * Check if dwarf is at job location (or adjacent for dig/chop jobs)
 */
export function isAtJobLocation(dwarf: Dwarf, job: Job): boolean {
  // For dig/chop jobs, dwarf needs to be ADJACENT (can't stand on wall/tree)
  if (job.type === "dig" || job.type === "chop") {
    const dx = Math.abs(dwarf.x - job.x);
    const dy = Math.abs(dwarf.y - job.y);
    // Adjacent if within 1 tile (including diagonal)
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  // For haul jobs in pickup phase, need to be at or adjacent to item
  if (job.type === "haul" && job.phase === "pickup") {
    const dx = Math.abs(dwarf.x - job.x);
    const dy = Math.abs(dwarf.y - job.y);
    return dx <= 1 && dy <= 1;
  }

  // For haul jobs in carry/dropoff phase, need to be at stockpile
  if (job.type === "haul" && (job.phase === "carry" || job.phase === "dropoff")) {
    return dwarf.x === job.targetX && dwarf.y === job.targetY;
  }

  // For other jobs, need to be at exact location
  return dwarf.x === job.x && dwarf.y === job.y;
}

/**
 * Process work on a job
 * Returns true if job is complete
 */
export function workOnJob(state: FortressState, dwarf: Dwarf, job: Job): boolean {
  // Haul jobs work differently - phase-based, not progress-based
  if (job.type === "haul") {
    return workOnHaulJob(state, dwarf, job);
  }

  // Work rate: 12 progress per tick (~8 ticks to complete)
  // Grief penalty: 50% slower while grieving (has witnessed_death thought)
  let progressRate = 12;
  if (hasThought(dwarf, "witnessed_death")) {
    progressRate = 6;
  }
  job.progress += progressRate;

  if (job.progress >= 100) {
    completeJob(state, job, dwarf);
    return true;
  }

  return false;
}

/**
 * Process work on a haul job (phase-based)
 *
 * Phases:
 * - pickup: Dwarf is at item, picks it up, transitions to carry
 * - carry: Dwarf is walking to stockpile (movement handled by movement.ts)
 *          When dwarf reaches stockpile, isAtJobLocation returns true and we deposit
 *
 * Note: workOnHaulJob is only called when isAtJobLocation returns true:
 * - pickup phase: dwarf is at/near item location
 * - carry phase: dwarf has reached the stockpile
 */
function workOnHaulJob(state: FortressState, dwarf: Dwarf, job: Job): boolean {
  const item = state.items.find(i => i.id === job.itemId);

  // Item gone - cancel job and remove from queue
  if (!item) {
    dwarf.carriedItem = undefined;
    const jobIndex = state.jobs.indexOf(job);
    if (jobIndex > -1) {
      state.jobs.splice(jobIndex, 1);
    }
    return true;
  }

  if (job.phase === "pickup") {
    // Pick up the item
    item.carriedBy = dwarf.id;
    item.x = dwarf.x;  // Item moves to dwarf's position
    item.y = dwarf.y;
    dwarf.carriedItem = item.id;
    job.phase = "carry";
    dwarf.currentTask = "hauling";
    return false;  // Job continues - dwarf will now walk to stockpile
  }

  if (job.phase === "carry") {
    // Dwarf has reached stockpile (isAtJobLocation verified this)
    // Deposit the item
    const stockpile = state.buildings.find(
      b => b.type === "stockpile" && b.x === job.targetX && b.y === job.targetY
    );

    if (stockpile) {
      // Add resource based on item type
      if (item.type === "stone") {
        state.resources.stone += 1;
      } else if (item.type === "log") {
        state.resources.wood += 1;
      }
    }

    // Remove item from game
    const itemIndex = state.items.indexOf(item);
    if (itemIndex > -1) {
      state.items.splice(itemIndex, 1);
    }

    // Clear dwarf's carried item
    dwarf.carriedItem = undefined;

    // Remove completed job from queue
    const jobIndex = state.jobs.indexOf(job);
    if (jobIndex > -1) {
      state.jobs.splice(jobIndex, 1);
    }

    return true;  // Job complete
  }

  return false;
}

/**
 * Complete a job and apply its effects
 */
function completeJob(state: FortressState, job: Job, dwarf?: Dwarf): void {
  if (job.type === "dig") {
    // Actually dig the tile
    const tile = state.map[job.y]?.[job.x];
    if (tile && tile.type === "wall") {
      tile.type = "floor";
      tile.dug = true;

      // Spawn stone item instead of directly adding to resources
      const stoneItem = createItem("stone", job.x, job.y);
      state.items.push(stoneItem);

      // Check for special resources
      if (tile.resource) {
        state.events.push(
          createEvent(state.tick, `Struck ${tile.resource} at (${job.x},${job.y})!`, "success")
        );
      }
    }
  } else if (job.type === "chop") {
    // Chop down the tree
    const tile = state.map[job.y]?.[job.x];
    if (tile && tile.type === "tree") {
      tile.type = "grass";

      // Spawn log item
      const logItem = createItem("log", job.x, job.y);
      state.items.push(logItem);

      state.events.push(
        createEvent(state.tick, "Tree felled", "info")
      );
    }
  } else if (job.type === "build" && job.buildingType) {
    // Actually construct the building
    const tile = state.map[job.y]?.[job.x];
    if (tile) {
      tile.type = job.buildingType;

      state.buildings.push({
        id: state.buildings.length,
        type: job.buildingType,
        subtype: job.buildingSubtype as Building["subtype"],
        x: job.x,
        y: job.y,
        width: job.buildingType === "workshop" ? 3 : 1,
        height: job.buildingType === "workshop" ? 3 : 1,
        built: true,
      });

      const name = job.buildingSubtype || job.buildingType;
      state.events.push(
        createEvent(state.tick, `${name} construction completed`, "success")
      );
    }
  } else if (job.type === "produce" && job.outputType) {
    // Production job completed - add resources (no event spam for routine production)
    const quantity = job.outputQuantity || 5;

    if (job.outputType === "food") {
      state.resources.food += quantity;
    } else if (job.outputType === "drink") {
      state.resources.drink += quantity;
    }

    // Clear the building's active job reference
    const building = state.buildings.find(b => b.x === job.x && b.y === job.y);
    if (building) {
      building.activeJobId = undefined;
    }
  }

  // Remove job from queue
  const index = state.jobs.indexOf(job);
  if (index > -1) {
    state.jobs.splice(index, 1);
  }
}

/**
 * Cancel a dwarf's current job
 * If the dwarf was carrying an item, drop it at their current location
 */
export function cancelJob(dwarf: Dwarf, state?: FortressState): void {
  if (dwarf.currentJob) {
    const job = dwarf.currentJob;

    // If dwarf was carrying an item (haul job in "carry" phase), drop it
    if (dwarf.carriedItem !== undefined && state) {
      const item = state.items.find(i => i.id === dwarf.carriedItem);
      if (item) {
        // Drop item at dwarf's current location
        item.x = dwarf.x;
        item.y = dwarf.y;
        item.carriedBy = undefined;
      }
      dwarf.carriedItem = undefined;

      // Remove the haul job entirely - a fresh one will be created for the dropped item
      // This prevents stale phase/coordinates from causing issues
      if (job.type === "haul" && state) {
        const jobIndex = state.jobs.indexOf(job);
        if (jobIndex > -1) {
          state.jobs.splice(jobIndex, 1);
        }
      }
    }

    job.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
    dwarf.currentTask = undefined;
    dwarf.pathingTicks = undefined;
  }
}

// How many ticks a dwarf will try to reach a job before giving up
const JOB_PATHING_TIMEOUT = 40;

/**
 * Update job system each tick
 */
export function updateJobs(state: FortressState): void {
  for (const dwarf of state.dwarves) {
    // Skip dead dwarves
    if (!dwarf.alive) continue;

    // Cancel job if critical needs
    if (dwarf.currentJob && (dwarf.hunger > 90 || dwarf.thirst > 90)) {
      cancelJob(dwarf, state);
      continue;
    }

    // If dwarf has no job, try to find one
    if (!dwarf.currentJob) {
      const job = findJobForDwarf(state, dwarf);
      if (job) {
        assignJob(dwarf, job);
        // Properly conjugate job type to -ing form
        const taskNames: Record<string, string> = {
          dig: "mining",
          chop: "chopping",
          build: "building",
          haul: "hauling",
          produce: "producing",
        };
        dwarf.currentTask = taskNames[job.type] || `${job.type}ing`;
      }
    }

    // If dwarf has job and is at location, work on it
    if (dwarf.currentJob && isAtJobLocation(dwarf, dwarf.currentJob)) {
      dwarf.pathingTicks = 0;  // Reset - we reached the job
      const complete = workOnJob(state, dwarf, dwarf.currentJob);
      if (complete) {
        cancelJob(dwarf, state);
      }
    } else if (dwarf.currentJob) {
      // Dwarf has job but isn't at location - track pathing time
      dwarf.pathingTicks = (dwarf.pathingTicks || 0) + 1;

      // Abandon job if stuck for too long
      if (dwarf.pathingTicks >= JOB_PATHING_TIMEOUT) {
        const jobType = dwarf.currentJob.type;
        state.events.push(
          createEvent(state.tick, `${dwarf.name} cancelled ${jobType} job: can't find path`, "warning")
        );
        cancelJob(dwarf, state);
      }
    }
  }
}
