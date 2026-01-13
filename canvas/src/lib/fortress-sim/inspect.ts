// Spatial inspection for fortress state
// Returns structured data about tiles, dwarves, buildings, and jobs at a location

import type {
  FortressState,
  InspectResult,
  TileInfo,
  BuildingInfo,
  JobInfo,
  DwarfStatus,
  Dwarf,
  Job,
  Building,
} from "../../scenarios/fortress/types";

/**
 * Check if a point is within radius of center
 */
function inRadius(x: number, y: number, centerX: number, centerY: number, radius: number): boolean {
  if (radius === 0) {
    return x === centerX && y === centerY;
  }
  // Use Chebyshev distance (square radius)
  return Math.abs(x - centerX) <= radius && Math.abs(y - centerY) <= radius;
}

/**
 * Convert full Dwarf to DwarfStatus for inspection results
 */
function dwarfToStatus(dwarf: Dwarf): DwarfStatus {
  return {
    id: dwarf.id,
    name: dwarf.name,
    position: { x: dwarf.x, y: dwarf.y },
    labor: dwarf.labor,
    hunger: dwarf.hunger,
    thirst: dwarf.thirst,
    happiness: dwarf.happiness,
    alive: dwarf.alive,
    currentTask: dwarf.currentTask,
    moodState: dwarf.moodState,
    moodDemands: dwarf.moodDemands,
    isLegendary: dwarf.isLegendary,
  };
}

/**
 * Convert Job to JobInfo for inspection results
 */
function jobToInfo(job: Job, dwarves: Dwarf[]): JobInfo {
  const assignedDwarf = job.assignedDwarfId
    ? dwarves.find(d => d.id === job.assignedDwarfId)
    : undefined;

  return {
    id: job.id,
    x: job.x,
    y: job.y,
    type: job.type,
    progress: job.progress,
    assignedTo: assignedDwarf?.name,
  };
}

/**
 * Convert Building to BuildingInfo for inspection results
 */
function buildingToInfo(building: Building): BuildingInfo {
  return {
    x: building.x,
    y: building.y,
    type: building.type as BuildingInfo["type"],
    producing: building.subtype,
  };
}

/**
 * Build inspection result for a location and radius
 */
export function buildInspectResult(
  state: FortressState,
  centerX: number,
  centerY: number,
  radius: number = 0
): InspectResult {
  const tiles: TileInfo[] = [];
  const dwarves: DwarfStatus[] = [];
  const buildings: BuildingInfo[] = [];
  const jobs: JobInfo[] = [];

  // Clamp radius to reasonable max
  const effectiveRadius = Math.min(radius, 10);

  // Collect tiles in radius
  const minX = Math.max(0, centerX - effectiveRadius);
  const maxX = Math.min(state.map[0]?.length ?? 40, centerX + effectiveRadius + 1);
  const minY = Math.max(0, centerY - effectiveRadius);
  const maxY = Math.min(state.map.length, centerY + effectiveRadius + 1);

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      if (!inRadius(x, y, centerX, centerY, effectiveRadius)) continue;

      const tile = state.map[y]?.[x];
      if (!tile) continue;

      // Check for dig designation
      const digJob = state.jobs.find(j => j.type === "dig" && j.x === x && j.y === y);

      const tileInfo: TileInfo = {
        x,
        y,
        type: tile.type,
      };

      if (tile.resource) {
        tileInfo.resource = tile.resource;
      }

      if (digJob) {
        tileInfo.designation = "dig";
      }

      tiles.push(tileInfo);
    }
  }

  // Collect dwarves in radius
  for (const dwarf of state.dwarves) {
    if (inRadius(dwarf.x, dwarf.y, centerX, centerY, effectiveRadius)) {
      dwarves.push(dwarfToStatus(dwarf));
    }
  }

  // Collect buildings in radius
  const addedBuildingIds = new Set<number>();
  for (const building of state.buildings) {
    if (addedBuildingIds.has(building.id)) continue;
    // Check if any part of building is in radius
    outer: for (let by = building.y; by < building.y + building.height; by++) {
      for (let bx = building.x; bx < building.x + building.width; bx++) {
        if (inRadius(bx, by, centerX, centerY, effectiveRadius)) {
          buildings.push(buildingToInfo(building));
          addedBuildingIds.add(building.id);
          break outer;
        }
      }
    }
  }

  // Collect jobs in radius
  for (const job of state.jobs) {
    if (inRadius(job.x, job.y, centerX, centerY, effectiveRadius)) {
      jobs.push(jobToInfo(job, state.dwarves));
    }
  }

  return {
    center: { x: centerX, y: centerY },
    radius: effectiveRadius,
    tiles,
    dwarves,
    buildings,
    jobs,
  };
}
