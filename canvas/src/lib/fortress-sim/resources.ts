import type { Resources } from "../../scenarios/fortress/types";

/**
 * Create initial starting resources
 */
export function createStartingResources(): Resources {
  return {
    wood: 20,
    stone: 20,
    food: 100,
    drink: 15,
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
 * Get a human-readable string describing resource deficits
 * Returns null if no deficit exists
 */
export function getResourceDeficit(
  current: Resources,
  cost: Resources
): string | null {
  const deficits: string[] = [];

  if (cost.wood > current.wood) {
    deficits.push(`${cost.wood - current.wood} more wood`);
  }
  if (cost.stone > current.stone) {
    deficits.push(`${cost.stone - current.stone} more stone`);
  }
  if (cost.food > current.food) {
    deficits.push(`${cost.food - current.food} more food`);
  }
  if (cost.drink > current.drink) {
    deficits.push(`${cost.drink - current.drink} more drink`);
  }

  return deficits.length > 0 ? `Need ${deficits.join(", ")}` : null;
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
