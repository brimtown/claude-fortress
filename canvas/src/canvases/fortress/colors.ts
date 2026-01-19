// Shared color constants for fortress rendering
// Uses Ink's color support: https://github.com/vadimdemedes/ink#color
// Supports two modes:
// - "full": Hex colors for consistent appearance across terminals
// - "theme": ANSI named colors that respect terminal theme

import type { TileType } from "../../scenarios/fortress/types";
import type { ColorMode } from "../../lib/fortress-sim/settings";

// Ink supports named colors, hex (#rrggbb), and rgb()
export type InkColor =
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray"
  | "blackBright" | "redBright" | "greenBright" | "yellowBright" | "blueBright"
  | "magentaBright" | "cyanBright" | "whiteBright";

// Hex colors for "full" mode - consistent across all terminal themes
const HEX_COLORS = {
  // Terrain
  grass: "#50fa7b",       // Bright vibrant green
  tree: "#228b22",        // Forest green (darker)
  water: "#00d7ff",       // Bright cyan
  waterAlt: "#5fd7ff",    // Lighter cyan for wave effect
  wall: "#6c6c6c",        // Gray stone
  floor: "#b0b0b0",       // Light gray

  // Resources (in walls)
  gold: "#ffd700",        // Gold
  iron: "#c0c0c0",        // Silver/light gray
  copper: "#cd7f32",      // Copper/bronze

  // Buildings
  workshop: "#ff79c6",    // Pink/magenta
  stockpile: "#6272a4",   // Muted blue
  bed: "#f1fa8c",         // Yellow
  farm: "#50fa7b",        // Green (same as grass)

  // Other
  corpse: "#ff5555",      // Red
  door: "#f8f8f2",        // Off-white
  soil: "#b0b0b0",        // Same as floor

  // Dwarves
  dwarf1: "#8be9fd",      // Cyan
  dwarf2: "#ff79c6",      // Pink
  dwarf3: "#f1fa8c",      // Yellow
  dwarf4: "#50fa7b",      // Green
  dwarf5: "#bd93f9",      // Purple
  dwarf6: "#ff5555",      // Red
  dwarf7: "#f8f8f2",      // White
} as const;

// Dwarf colors - each dwarf gets their own based on ID
export const DWARF_COLORS: InkColor[] = [
  "cyan", "magenta", "yellow", "green", "blue", "red", "white"
];

// Hex colors for dwarves in full mode
export const DWARF_COLORS_HEX = [
  HEX_COLORS.dwarf1, HEX_COLORS.dwarf2, HEX_COLORS.dwarf3, HEX_COLORS.dwarf4,
  HEX_COLORS.dwarf5, HEX_COLORS.dwarf6, HEX_COLORS.dwarf7,
];

/**
 * Get dwarf color based on mode
 */
export function getDwarfColor(dwarfId: number, colorMode: ColorMode): string {
  if (colorMode === "full") {
    return DWARF_COLORS_HEX[dwarfId % DWARF_COLORS_HEX.length] ?? HEX_COLORS.dwarf1;
  }
  return DWARF_COLORS[dwarfId % DWARF_COLORS.length] ?? "white";
}

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
// Returns hex color in "full" mode, ANSI named color in "theme" mode
export function getTileColor(
  type: TileType,
  x: number,
  y: number,
  resource?: "stone" | "iron" | "gold" | "copper",
  colorMode: ColorMode = "full"
): string {
  // Full mode: use hex colors for consistency
  if (colorMode === "full") {
    switch (type) {
      case "wall":
        if (resource === "gold") return HEX_COLORS.gold;
        if (resource === "iron") return HEX_COLORS.iron;
        if (resource === "copper") return HEX_COLORS.copper;
        return HEX_COLORS.wall;
      case "floor":
        return HEX_COLORS.floor;
      case "water":
        return (x + y) % 2 === 0 ? HEX_COLORS.water : HEX_COLORS.waterAlt;
      case "tree":
        return HEX_COLORS.tree;
      case "grass":
        return HEX_COLORS.grass;
      case "workshop":
        return HEX_COLORS.workshop;
      case "stockpile":
        return HEX_COLORS.stockpile;
      case "bed":
        return HEX_COLORS.bed;
      case "farm":
        return HEX_COLORS.farm;
      case "corpse":
        return HEX_COLORS.corpse;
      case "soil":
        return HEX_COLORS.soil;
      case "door":
        return HEX_COLORS.door;
      default:
        return HEX_COLORS.floor;
    }
  }

  // Theme mode: use ANSI named colors (respects terminal theme)
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
      // Trees are darker green for contrast with grass
      return "green";
    case "grass":
      // Grass is bright/vibrant green - the outdoor surface
      return "greenBright";
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
