import type { FortressState, Labor } from "../scenarios/fortress/types";
import { MAP_WIDTH, MAP_HEIGHT } from "../lib/fortress-sim/map";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID_LABORS: Labor[] = ["mining", "carpentry", "brewing", "farming", "hauling"];

const VALID_BUILDING_TYPES = ["workshop", "stockpile", "bed"] as const;
const VALID_WORKSHOP_SUBTYPES = ["still", "carpenter", "smelter"] as const;

/**
 * Validate dig command coordinates and dimensions
 */
export function validateDigCommand(
  x: number,
  y: number,
  width: number,
  height: number,
  state?: FortressState
): ValidationResult {
  // Check if coordinates are numbers
  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return { valid: false, error: "All coordinates must be numbers" };
  }

  // Check if dimensions are positive
  if (width <= 0 || height <= 0) {
    return { valid: false, error: `Dimensions must be positive (got width=${width}, height=${height})` };
  }

  // Check starting position in bounds
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) {
    return {
      valid: false,
      error: `Dig coordinates (${x},${y}) out of bounds - map is ${MAP_WIDTH}x${MAP_HEIGHT}`
    };
  }

  // Check ending position in bounds
  const endX = x + width - 1;
  const endY = y + height - 1;

  if (endX >= MAP_WIDTH || endY >= MAP_HEIGHT) {
    return {
      valid: false,
      error: `Dig area extends to (${endX},${endY}) - map ends at (${MAP_WIDTH-1},${MAP_HEIGHT-1})`
    };
  }

  // Optional: Check if area has any diggable walls (requires state)
  if (state) {
    let hasWalls = false;
    for (let dy = 0; dy < height && !hasWalls; dy++) {
      for (let dx = 0; dx < width && !hasWalls; dx++) {
        const tile = state.map[y + dy]?.[x + dx];
        if (tile?.type === "wall" && !tile.dug) {
          hasWalls = true;
        }
      }
    }

    if (!hasWalls) {
      return {
        valid: false,
        error: `No diggable walls in area (${x},${y}) to (${endX},${endY}) - already dug or invalid terrain`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate build command location and resources
 */
export function validateBuildCommand(
  type: string,
  x: number,
  y: number,
  subtype?: string,
  state?: FortressState
): ValidationResult {
  // Check if coordinates are numbers
  if (isNaN(x) || isNaN(y)) {
    return { valid: false, error: "Coordinates must be numbers" };
  }

  // Check coordinates in bounds
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) {
    return {
      valid: false,
      error: `Build coordinates (${x},${y}) out of bounds - map is ${MAP_WIDTH}x${MAP_HEIGHT}`
    };
  }

  // Validate building type
  if (!VALID_BUILDING_TYPES.includes(type as any)) {
    return {
      valid: false,
      error: `Invalid building type '${type}' - valid: ${VALID_BUILDING_TYPES.join(", ")}`
    };
  }

  // Validate workshop subtype
  if (type === "workshop") {
    if (!subtype) {
      return {
        valid: false,
        error: `Workshop requires subtype - valid: ${VALID_WORKSHOP_SUBTYPES.join(", ")}`
      };
    }
    if (!VALID_WORKSHOP_SUBTYPES.includes(subtype as any)) {
      return {
        valid: false,
        error: `Invalid workshop subtype '${subtype}' - valid: ${VALID_WORKSHOP_SUBTYPES.join(", ")}`
      };
    }
  }

  // If we have state, validate location and resources
  if (state) {
    const tile = state.map[y]?.[x];

    if (!tile) {
      return { valid: false, error: `Tile at (${x},${y}) does not exist` };
    }

    if (tile.type !== "floor") {
      return {
        valid: false,
        error: `Can't build at (${x},${y}) - tile is ${tile.type}, need floor (dig it first)`
      };
    }

    // Check resources (approximate costs)
    const costs = {
      workshop: { wood: 10, stone: 15 },
      stockpile: { wood: 5, stone: 5 },
      bed: { wood: 5, stone: 0 },
    };

    const cost = costs[type as keyof typeof costs];
    if (cost) {
      if (state.resources.wood < cost.wood) {
        return {
          valid: false,
          error: `Insufficient wood: need ${cost.wood}, have ${state.resources.wood}`
        };
      }
      if (state.resources.stone < cost.stone) {
        return {
          valid: false,
          error: `Insufficient stone: need ${cost.stone}, have ${state.resources.stone}`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate assign command dwarf ID and labor
 */
export function validateAssignCommand(
  dwarfId: number,
  labor: string,
  state?: FortressState
): ValidationResult {
  // Check if dwarfId is a number
  if (isNaN(dwarfId) || !Number.isInteger(dwarfId)) {
    return { valid: false, error: "Dwarf ID must be an integer" };
  }

  // Check if labor is valid
  if (!VALID_LABORS.includes(labor as Labor)) {
    return {
      valid: false,
      error: `Invalid labor '${labor}' - valid: ${VALID_LABORS.join(", ")}`
    };
  }

  // If we have state, validate dwarf exists
  if (state) {
    const dwarf = state.dwarves.find(d => d.id === dwarfId);
    if (!dwarf) {
      const maxId = state.dwarves.length > 0 ? Math.max(...state.dwarves.map(d => d.id)) : -1;
      return {
        valid: false,
        error: `Dwarf ID ${dwarfId} not found - fortress has ${state.dwarves.length} dwarves (IDs 0-${maxId})`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate query command detail level
 */
export function validateQueryCommand(detailLevel?: string): ValidationResult {
  const validLevels = ["quick", "full", "dwarves", "jobs"];

  if (detailLevel && !validLevels.includes(detailLevel)) {
    return {
      valid: false,
      error: `Invalid detail level '${detailLevel}' - valid: ${validLevels.join(", ")}`
    };
  }

  return { valid: true };
}
