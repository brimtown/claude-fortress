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
 * Generate the mountain edge x-coordinate for a given y position.
 * Creates an organic, wavy cliff face using layered sine waves.
 * Bottom 9 rows (y >= 11) are all mountain (outdoor is top-left only).
 */
function getMountainEdge(y: number, rng: Random): number {
  // Bottom 9 rows (y >= 11) are all mountain
  if (y >= 11) {
    return 0;
  }

  // Outdoor area shrinks as we go down (mountain expands from bottom)
  // y=0-6: full outdoor width, y=7-10: progressively narrower
  const baseEdge = y <= 6 ? 11 : Math.max(4, 11 - (y - 6) * 2);

  // Layered waves for organic feel
  const wave1 = Math.sin(y * 0.5) * 2;
  const wave2 = Math.sin(y * 0.3 + 1) * 1.5;
  const noise = (rng.next() - 0.5) * 1.5; // Small random jitter
  return Math.max(0, Math.round(baseEdge + wave1 + wave2 + noise));
}

/**
 * Generate a procedural fortress map with Dwarf Fortress-style layout:
 * - Left ~1/4: outdoor surface (grass, trees, water)
 * - Transition zone with scattered boulders
 * - Mountain with organic edge, ore veins, and underground lake
 */
export function generateMap(seed?: number): Tile[][] {
  const rng = new Random(seed || Date.now());
  const map: Tile[][] = [];

  // Pre-calculate mountain edge for each row (organic waviness)
  const mountainEdge: number[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    mountainEdge[y] = getMountainEdge(y, rng);
  }

  // Initialize map: grass outdoors, walls in mountain
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (x < mountainEdge[y]!) {
        // Outdoor area - grass
        map[y]![x] = { type: "grass" };
      } else {
        // Mountain - solid stone
        map[y]![x] = { type: "wall" };
      }
    }
  }

  // === OUTDOOR AREA (top-left) ===

  // Add trees in outdoor area (18-26 trees for denser forest)
  const treeCount = 18 + rng.int(9);
  for (let i = 0; i < treeCount; i++) {
    // Trees in the outdoor area, favor upper rows where outdoor is wider
    const y = rng.int(11); // Only in top 11 rows where outdoor exists
    const x = Math.min(rng.int(10) + rng.int(3), MAP_WIDTH - 1);
    if (x < mountainEdge[y]! && map[y]![x]!.type === "grass") {
      map[y]![x] = { type: "tree" };
    }
  }

  // Add a copse of trees at the edge of outdoor area (y=8-10)
  const copseCount = 6 + rng.int(4);
  for (let i = 0; i < copseCount; i++) {
    const y = 8 + rng.int(3); // y: 8-10
    const x = rng.int(6); // x: 0-5 (left side)
    if (y < MAP_HEIGHT && x < mountainEdge[y]! && map[y]![x]!.type === "grass") {
      map[y]![x] = { type: "tree" };
    }
  }

  // Add water source - small stream/pond in upper outdoor area
  const streamY = 2 + rng.int(6); // y: 2-7 (upper area only)
  const streamX = 1 + rng.int(3);  // x: 1-3 (near left edge)
  // Create irregular water shape (not just a rectangle)
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = 0; dx <= 2; dx++) {
      const y = streamY + dy;
      const x = streamX + dx;
      if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < mountainEdge[y]!) {
        // Skip corners for irregular shape
        if ((dy === -1 || dy === 2) && (dx === 0 || dx === 2) && rng.next() > 0.5) continue;
        map[y]![x] = { type: "water" };
      }
    }
  }

  // === TRANSITION ZONE (scattered boulders near mountain edge) ===

  // Add scattered boulders in transition area (single wall tiles)
  const boulderCount = 8 + rng.int(5);
  for (let i = 0; i < boulderCount; i++) {
    const y = rng.int(11); // Only where outdoor exists (y < 11)
    if (mountainEdge[y]! <= 0) continue; // Skip if no outdoor at this row
    // Place boulders 1-4 tiles before mountain edge
    const x = Math.max(0, mountainEdge[y]! - 1 - rng.int(4));
    if (map[y]![x]!.type === "grass") {
      map[y]![x] = { type: "wall" };
    }
  }

  // === MOUNTAIN INTERIOR ===

  // Add ore veins (clustered deposits) - more veins for larger mountain
  const oreTypes: Array<"iron" | "gold" | "copper"> = ["iron", "copper", "gold", "iron", "copper"];
  const veinCount = 5 + rng.int(3); // 5-7 veins

  for (let v = 0; v < veinCount; v++) {
    const oreType = oreTypes[v % oreTypes.length]!;
    // Veins deeper in mountain (gold deeper than others)
    const minX = oreType === "gold" ? 28 : 15;
    const veinX = minX + rng.int(MAP_WIDTH - minX - 3);
    const veinY = 2 + rng.int(MAP_HEIGHT - 4);
    const veinSize = 3 + rng.int(3); // 3-5 tiles per vein

    // Place vein in a cluster pattern
    for (let i = 0; i < veinSize; i++) {
      const dx = rng.int(3) - 1; // -1 to 1
      const dy = rng.int(3) - 1;
      const x = Math.max(0, Math.min(MAP_WIDTH - 1, veinX + dx));
      const y = Math.max(0, Math.min(MAP_HEIGHT - 1, veinY + dy));
      if (map[y]![x]!.type === "wall") {
        map[y]![x]!.resource = oreType;
      }
    }
  }

  // Add underground lake (4x3 to 5x4, deeper in mountain)
  const lakeWidth = 4 + rng.int(2);  // 4-5
  const lakeHeight = 3 + rng.int(2); // 3-4
  const lakeX = 20 + rng.int(12);    // x: 20-31
  const lakeY = 4 + rng.int(MAP_HEIGHT - lakeHeight - 6); // Avoid edges

  for (let dy = 0; dy < lakeHeight; dy++) {
    for (let dx = 0; dx < lakeWidth; dx++) {
      const y = lakeY + dy;
      const x = lakeX + dx;
      if (y < MAP_HEIGHT && x < MAP_WIDTH) {
        // Create slightly irregular shape by skipping some corners
        const isCorner = (dy === 0 || dy === lakeHeight - 1) &&
                         (dx === 0 || dx === lakeWidth - 1);
        if (!isCorner || rng.next() > 0.4) {
          map[y]![x] = { type: "water" };
        }
      }
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
      return "♣";
    case "grass":
      return ",";
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
    case "farm":
      return "%";
    case "corpse":
      return "†";
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
    case "grass":
      return "green";
    case "workshop":
      return "magenta";
    case "stockpile":
      return "cyan";
    case "bed":
      return "yellow";
    case "farm":
      return "green";
    case "corpse":
      return "red";
    default:
      return "white";
  }
}

export { MAP_WIDTH, MAP_HEIGHT };
