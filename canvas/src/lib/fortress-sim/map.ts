import type { Tile, TileType } from "../../scenarios/fortress/types";

const MAP_WIDTH = 40;
const MAP_HEIGHT = 20;

/**
 * Simple seeded random number generator (LCG)
 */
class Random {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}

/**
 * Generate a procedural fortress map
 */
export function generateMap(seed?: number): Tile[][] {
  const rng = new Random(seed || Date.now());
  const map: Tile[][] = [];

  // Initialize with stone walls
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      map[y][x] = { type: "wall" };
    }
  }

  // Create a basic starting area in the top-left (pre-dug entrance area)
  for (let y = 1; y < 8; y++) {
    for (let x = 1; x < 12; x++) {
      map[y][x] = { type: "floor", dug: true };
    }
  }

  // Add some trees on the surface (right side)
  for (let i = 0; i < 8; i++) {
    const x = MAP_WIDTH - 15 + rng.int(10);
    const y = rng.int(MAP_HEIGHT);
    if (map[y][x].type === "wall") {
      map[y][x] = { type: "tree" };
    }
  }

  // Add a water source (small pond)
  const pondY = 8 + rng.int(6);
  const pondX = MAP_WIDTH - 20 + rng.int(5);
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const y = pondY + dy;
      const x = pondX + dx;
      if (y < MAP_HEIGHT && x < MAP_WIDTH) {
        map[y][x] = { type: "water" };
      }
    }
  }

  // Add some valuable resources in the walls
  for (let i = 0; i < 5; i++) {
    const x = rng.int(MAP_WIDTH);
    const y = rng.int(MAP_HEIGHT);
    if (map[y][x].type === "wall") {
      const resources: Array<"stone" | "iron" | "gold" | "copper"> = ["iron", "gold", "copper"];
      map[y][x].resource = resources[rng.int(resources.length)];
    }
  }

  return map;
}

/**
 * Get ASCII character for tile type
 */
export function getTileChar(tile: Tile): string {
  switch (tile.type) {
    case "wall":
      return "#";
    case "floor":
      return ".";
    case "water":
      return "~";
    case "tree":
      return "^";
    case "soil":
      return "·";
    case "door":
      return "+";
    case "workshop":
      return "X";
    case "stockpile":
      return "≈";
    case "bed":
      return "=";
    default:
      return "?";
  }
}

/**
 * Get color for tile (for potential terminal coloring)
 */
export function getTileColor(tile: Tile): string {
  if (tile.resource === "gold") return "yellow";
  if (tile.resource === "iron") return "gray";
  if (tile.resource === "copper") return "orange";

  switch (tile.type) {
    case "wall":
      return "gray";
    case "floor":
      return "white";
    case "water":
      return "blue";
    case "tree":
      return "green";
    case "workshop":
      return "magenta";
    case "stockpile":
      return "cyan";
    case "bed":
      return "yellow";
    default:
      return "white";
  }
}

export { MAP_WIDTH, MAP_HEIGHT };
