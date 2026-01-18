import type { Job, Dwarf, FortressState, Labor, Building } from "../../scenarios/fortress/types";
import { createEvent } from "./events";
import { MAP_WIDTH, MAP_HEIGHT } from "./map";

let nextJobId = 0;

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
    if (neighbor?.type === "floor" || neighbor?.dug) {
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
  // For dig jobs, only assign accessible ones (next to existing floors)
  for (const job of state.jobs) {
    if (!job.assignedDwarfId && job.requiredLabor === dwarf.labor) {
      // Dig jobs must be accessible (adjacent to floor)
      if (job.type === "dig") {
        if (isJobAccessible(state, job.x, job.y)) {
          return job;
        }
        // Skip inaccessible dig jobs for now - they'll become accessible as digging progresses
      } else {
        // Non-dig jobs don't have accessibility requirements
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
}

/**
 * Check if dwarf is at job location (or adjacent for dig jobs)
 */
export function isAtJobLocation(dwarf: Dwarf, job: Job): boolean {
  // For dig jobs, dwarf needs to be ADJACENT (can't stand on wall)
  if (job.type === "dig") {
    const dx = Math.abs(dwarf.x - job.x);
    const dy = Math.abs(dwarf.y - job.y);
    // Adjacent if within 1 tile (including diagonal)
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  // For other jobs, need to be at exact location
  return dwarf.x === job.x && dwarf.y === job.y;
}

/**
 * Process work on a job
 * Returns true if job is complete
 */
export function workOnJob(state: FortressState, dwarf: Dwarf, job: Job): boolean {
  // Work rate: ~10 progress per tick (10 ticks to complete)
  // Grief penalty: 50% slower while grieving
  let progressRate = 10;
  if (dwarf.griefTicks && dwarf.griefTicks > 0) {
    progressRate = 5;
  }
  job.progress += progressRate;

  if (job.progress >= 100) {
    completeJob(state, job);
    return true;
  }

  return false;
}

/**
 * Complete a job and apply its effects
 */
function completeJob(state: FortressState, job: Job): void {
  if (job.type === "dig") {
    // Actually dig the tile
    const tile = state.map[job.y]?.[job.x];
    if (tile && tile.type === "wall") {
      tile.type = "floor";
      tile.dug = true;
      state.resources.stone += 1;

      // Check for special resources
      if (tile.resource) {
        state.events.push(
          createEvent(state.tick, `Struck ${tile.resource} at (${job.x},${job.y})!`, "success")
        );
      }
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
    // Production job completed - add resources
    const quantity = job.outputQuantity || 5;

    if (job.outputType === "food") {
      state.resources.food += quantity;
      state.events.push(
        createEvent(state.tick, `Farm harvest: +${quantity} food`, "success")
      );
    } else if (job.outputType === "drink") {
      state.resources.drink += quantity;
      state.events.push(
        createEvent(state.tick, `Still produced: +${quantity} drink`, "success")
      );
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
 */
export function cancelJob(dwarf: Dwarf): void {
  if (dwarf.currentJob) {
    dwarf.currentJob.assignedDwarfId = undefined;
    dwarf.currentJob = undefined;
    dwarf.currentTask = undefined;
  }
}

/**
 * Update job system each tick
 */
export function updateJobs(state: FortressState): void {
  for (const dwarf of state.dwarves) {
    // Skip dead dwarves
    if (!dwarf.alive) continue;

    // Cancel job if critical needs
    if (dwarf.currentJob && (dwarf.hunger > 90 || dwarf.thirst > 90)) {
      cancelJob(dwarf);
      continue;
    }

    // If dwarf has no job, try to find one
    if (!dwarf.currentJob) {
      const job = findJobForDwarf(state, dwarf);
      if (job) {
        assignJob(dwarf, job);
        // Properly conjugate job type to -ing form
        const taskNames: Record<string, string> = {
          dig: "digging",
          build: "building",
          produce: "producing",
        };
        dwarf.currentTask = taskNames[job.type] || `${job.type}ing`;
      }
    }

    // If dwarf has job and is at location, work on it
    if (dwarf.currentJob && isAtJobLocation(dwarf, dwarf.currentJob)) {
      const complete = workOnJob(state, dwarf, dwarf.currentJob);
      if (complete) {
        cancelJob(dwarf);
      }
    }
  }
}
