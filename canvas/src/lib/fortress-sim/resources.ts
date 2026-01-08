import type { Resources } from "../../scenarios/fortress/types";

/**
 * Create initial starting resources
 */
export function createStartingResources(): Resources {
  return {
    wood: 20,
    stone: 10,
    food: 100,
    drink: 80,
  };
}

/**
 * Check if we have enough resources for a cost
 */
export function hasResources(current: Resources, cost: Resources): boolean {
  return (
    current.wood >= cost.wood &&
    current.stone >= cost.stone &&
    current.food >= cost.food &&
    current.drink >= cost.drink
  );
}

/**
 * Subtract resources (returns true if successful)
 */
export function consumeResources(
  current: Resources,
  cost: Resources
): boolean {
  if (!hasResources(current, cost)) {
    return false;
  }

  current.wood -= cost.wood;
  current.stone -= cost.stone;
  current.food -= cost.food;
  current.drink -= cost.drink;

  return true;
}

/**
 * Add resources
 */
export function addResources(current: Resources, gained: Resources): void {
  current.wood += gained.wood;
  current.stone += gained.stone;
  current.food += gained.food;
  current.drink += gained.drink;
}

/**
 * Get resource cost for building types
 */
export function getBuildingCost(
  type: "workshop" | "stockpile" | "bed",
  subtype?: string
): Resources {
  switch (type) {
    case "workshop":
      return { wood: 10, stone: 15, food: 0, drink: 0 };
    case "stockpile":
      return { wood: 2, stone: 0, food: 0, drink: 0 };
    case "bed":
      return { wood: 5, stone: 0, food: 0, drink: 0 };
    default:
      return { wood: 0, stone: 0, food: 0, drink: 0 };
  }
}
