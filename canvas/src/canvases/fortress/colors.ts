// Shared color constants for fortress rendering
// Uses Ink's terminal color names: https://github.com/vadimdemedes/ink#color

import type { TileType } from "../../scenarios/fortress/types";

// Ink supports these base colors plus "Bright" variants
export type InkColor =
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray"
  | "blackBright" | "redBright" | "greenBright" | "yellowBright" | "blueBright"
  | "magentaBright" | "cyanBright" | "whiteBright";

// Dwarf colors - each dwarf gets their own based on ID
export const DWARF_COLORS: InkColor[] = [
  "cyan", "magenta", "yellow", "green", "blue", "red", "white"
];

// Event type colors
export const EVENT_COLORS: Record<string, InkColor> = {
  info: "white",
  warning: "yellow",
  success: "green",
  danger: "red",
};

// Resource colors based on amount thresholds
export function getResourceColor(amount: number, type: "wood" | "stone" | "food" | "drink"): InkColor {
  if (type === "stone") {
    return amount > 50 ? "white" : amount > 20 ? "yellow" : "red";
  }
  if (type === "drink") {
    return amount > 50 ? "cyan" : amount > 20 ? "yellow" : "red";
  }
  // wood, food use green
  return amount > 50 ? "green" : amount > 20 ? "yellow" : "red";
}

// Tile colors with position-based variation for visual depth
export function getTileColor(
  type: TileType,
  x: number,
  y: number,
  resource?: "stone" | "iron" | "gold" | "copper"
): InkColor {
  switch (type) {
    case "wall":
      if (resource === "gold") return "yellow";
      if (resource === "iron") return "white";
      if (resource === "copper") return "magenta";
      return "gray";
    case "floor":
      return "white";
    case "water":
      // Alternate cyan/cyanBright for wave effect
      return (x + y) % 2 === 0 ? "cyan" : "cyanBright";
    case "tree":
      // Alternate green/greenBright for depth
      return (x + y) % 3 === 0 ? "greenBright" : "green";
    case "workshop":
      return "magenta";
    case "stockpile":
      return "blue";
    case "bed":
      return "yellow";
    case "farm":
      return "green";
    case "corpse":
      return "red";
    case "soil":
    case "door":
    default:
      return "white";
  }
}

// Happiness color thresholds
export function getHappinessColor(happiness: number): InkColor {
  return happiness > 60 ? "green" : happiness > 30 ? "yellow" : "red";
}

// Wealth color thresholds
export function getWealthColor(wealth: number): InkColor {
  if (wealth >= 600) return "green";
  if (wealth >= 300) return "white";
  if (wealth >= 100) return "yellow";
  return "red";
}
