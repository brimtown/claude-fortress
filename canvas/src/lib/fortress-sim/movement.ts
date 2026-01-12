import type { Dwarf, FortressState } from "../../scenarios/fortress/types";
import { MAP_WIDTH, MAP_HEIGHT } from "./map";

/**
 * Simple pathfinding: find adjacent walkable tiles
 */
function getWalkableTiles(state: FortressState, x: number, y: number): Array<{ x: number; y: number }> {
  const walkable: Array<{ x: number; y: number }> = [];
  const directions = [
    { dx: -1, dy: 0 },  // left
    { dx: 1, dy: 0 },   // right
    { dx: 0, dy: -1 },  // up
    { dx: 0, dy: 1 },   // down
    { dx: -1, dy: -1 }, // diagonal up-left
    { dx: 1, dy: -1 },  // diagonal up-right
    { dx: -1, dy: 1 },  // diagonal down-left
    { dx: 1, dy: 1 },   // diagonal down-right
  ];

  for (const { dx, dy } of directions) {
    const newX = x + dx;
    const newY = y + dy;

    // Check bounds
    if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) {
      continue;
    }

    const row = state.map[newY];
    if (!row) continue;

    const tile = row[newX];
    if (!tile) continue;

    // Can walk on floor, workshop, stockpile, bed
    if (tile.type === "floor" || tile.type === "workshop" ||
        tile.type === "stockpile" || tile.type === "bed") {
      walkable.push({ x: newX, y: newY });
    }
  }

  return walkable;
}

/**
 * Calculate Manhattan distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Find nearest tile of a specific type
 */
function findNearestTileType(
  state: FortressState,
  fromX: number,
  fromY: number,
  tileType: string
): { x: number; y: number } | null {
  let nearest: { x: number; y: number; dist: number } | null = null;

  for (let y = 0; y < state.map.length; y++) {
    const row = state.map[y];
    if (!row) continue;

    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (!tile) continue;

      if (tile.type === tileType) {
        const dist = distance(fromX, fromY, x, y);
        if (!nearest || dist < nearest.dist) {
          nearest = { x, y, dist };
        }
      }
    }
  }

  return nearest ? { x: nearest.x, y: nearest.y } : null;
}

/**
 * Move a dwarf one step toward a target
 */
function moveToward(
  state: FortressState,
  dwarf: Dwarf,
  targetX: number,
  targetY: number
): void {
  const walkable = getWalkableTiles(state, dwarf.x, dwarf.y);
  if (walkable.length === 0) return;

  // Find the walkable tile closest to target
  let best = walkable[0];
  if (!best) return;

  let bestDist = distance(best.x, best.y, targetX, targetY);

  for (const tile of walkable) {
    const dist = distance(tile.x, tile.y, targetX, targetY);
    if (dist < bestDist) {
      best = tile;
      bestDist = dist;
    }
  }

  dwarf.x = best.x;
  dwarf.y = best.y;
}

/**
 * Random wandering movement
 */
function wander(state: FortressState, dwarf: Dwarf): void {
  const walkable = getWalkableTiles(state, dwarf.x, dwarf.y);
  if (walkable.length === 0) return;

  // 70% chance to move, 30% to stay put
  if (Math.random() < 0.7) {
    const randomTile = walkable[Math.floor(Math.random() * walkable.length)];
    if (!randomTile) return;

    dwarf.x = randomTile.x;
    dwarf.y = randomTile.y;
  }
}

/**
 * Update dwarf movement based on needs and behavior
 * Called each tick for each dwarf
 */
export function updateDwarfMovement(state: FortressState, dwarf: Dwarf): void {
  // Don't move if paused
  if (state.paused) return;

  // Skip dead dwarves
  if (!dwarf.alive) return;

  // Skip dwarves in strange moods - they're handled by the moods system
  if (dwarf.moodState && dwarf.moodState !== "normal") return;

  // Critical needs override everything
  if (dwarf.hunger > 90 && state.resources.food > 0) {
    // Try to find stockpile to eat from
    const stockpile = findNearestTileType(state, dwarf.x, dwarf.y, "stockpile");
    if (stockpile) {
      moveToward(state, dwarf, stockpile.x, stockpile.y);
      return;
    }
  }

  if (dwarf.thirst > 90 && state.resources.drink > 0) {
    // Try to find water or stockpile to drink from
    const water = findNearestTileType(state, dwarf.x, dwarf.y, "water");
    if (water) {
      moveToward(state, dwarf, water.x, water.y);
      return;
    }
    const stockpile = findNearestTileType(state, dwarf.x, dwarf.y, "stockpile");
    if (stockpile) {
      moveToward(state, dwarf, stockpile.x, stockpile.y);
      return;
    }
  }

  // PRIORITY: If dwarf has a job, path to the job location
  if (dwarf.currentJob) {
    // Check if already at job location
    if (dwarf.x !== dwarf.currentJob.x || dwarf.y !== dwarf.currentJob.y) {
      moveToward(state, dwarf, dwarf.currentJob.x, dwarf.currentJob.y);
      return;
    }
    // At job location - stay put and work (handled by jobs system)
    return;
  }

  // Default: wander around (idle dwarves)
  wander(state, dwarf);
}

/**
 * Update movement for all dwarves
 * Dwarves move at different rates (not every tick)
 */
export function updateAllDwarfMovement(state: FortressState): void {
  for (const dwarf of state.dwarves) {
    // Skip dead dwarves
    if (!dwarf.alive) continue;

    // Skip mood dwarves - handled by moods system
    if (dwarf.moodState && dwarf.moodState !== "normal") continue;

    // Dwarves with jobs ALWAYS move (need to get to work!)
    // Idle dwarves have 30% chance to wander (makes it feel more natural)
    if (dwarf.currentJob || Math.random() < 0.3) {
      updateDwarfMovement(state, dwarf);
    }
  }
}
