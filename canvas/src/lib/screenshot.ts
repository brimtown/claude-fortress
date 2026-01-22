// Screenshot renderer for fortress visual observation
// Renders fortress state to PNG using @napi-rs/canvas

import { createCanvas } from "@napi-rs/canvas";
import type { FortressState, Dwarf } from "../scenarios/fortress/types";
import { getTileChar, getDwarfChar, getItemChar } from "./fortress-sim/map";
import type { Viewport } from "../ipc/types";
import { getScreenshotPath } from "../platform";
import { loadSettingsSync, type RenderMode } from "./fortress-sim/settings";

// Terminal color names to RGB hex (includes bright variants)
const TERMINAL_COLORS: Record<string, string> = {
  black: "#000000",
  red: "#FF5555",
  green: "#55FF55",
  yellow: "#FFFF55",
  blue: "#5555FF",
  magenta: "#FF55FF",
  cyan: "#55FFFF",
  white: "#FFFFFF",
  gray: "#888888",
  orange: "#FFAA55",
  // Bright variants for depth effect
  greenBright: "#7FFF7F",
  cyanBright: "#7FFFFF",
  yellowBright: "#FFFF7F",
  redBright: "#FF7F7F",
  magentaBright: "#FF7FFF",
  blueBright: "#7F7FFF",
  whiteBright: "#FFFFFF",
};

// Dwarf color palette (matches fortress.tsx)
const DWARF_COLORS = ["cyan", "magenta", "yellow", "green", "blue", "red", "white"];

// Character cell dimensions
const CELL_WIDTH = 10;
const CELL_HEIGHT = 18;
const FONT_SIZE = 16;

// Layout constants
const HEADER_HEIGHT = 3; // lines
const MAP_WIDTH = 40;
const MAP_HEIGHT = 20;
const LEGEND_WIDTH = 28;
const PADDING = 4;
const GRID_LABEL_WIDTH = 20; // Space for Y-axis labels
const GRID_LABEL_HEIGHT = 20; // Space for X-axis labels

interface RenderCell {
  char: string;
  color: string; // Terminal color name
}

interface ScreenshotOptions {
  fortressId: string;
  viewport?: Viewport;
}

interface ScreenshotResult {
  path: string;
  dimensions: { width: number; height: number };
}

/**
 * Get character and color for a map position
 * Replicates the rendering priority from fortress.tsx
 */
function getCellForPosition(
  state: FortressState,
  x: number,
  y: number,
  renderMode: RenderMode = "terminal"
): RenderCell {
  const tile = state.map[y]?.[x];
  if (!tile) return { char: "?", color: "white" };

  // Check for dwarf at position
  const dwarfHere = state.dwarves.find((d) => d.x === x && d.y === y);

  // Check for designations (dig or chop)
  const designation = state.jobs.find((j) => (j.type === "dig" || j.type === "chop") && j.x === x && j.y === y);

  // Check for items on the ground (not being carried)
  const itemHere = state.items?.find((i) => i.x === x && i.y === y && i.carriedBy === undefined);

  let char = getTileChar(tile, renderMode);
  let color = "white";

  if (dwarfHere) {
    // Use helper for dwarf character based on render mode
    char = getDwarfChar(dwarfHere.happiness, dwarfHere.moodState, dwarfHere.alive, renderMode);
    if (!dwarfHere.alive) {
      color = "red";
    } else if (dwarfHere.moodState && dwarfHere.moodState !== "normal") {
      color = "magenta";
    } else {
      color = DWARF_COLORS[dwarfHere.id % DWARF_COLORS.length] ?? "white";
    }
  } else if (itemHere) {
    // Use helper for item character based on render mode
    char = getItemChar(itemHere.type, renderMode);
    color = itemHere.type === "stone" ? "gray" : "#8B4513";
  } else if (designation && (tile.type === "wall" || tile.type === "tree")) {
    char = "d";
    color = "yellow";
  } else {
    switch (tile.type) {
      case "wall":
        color = tile.resource === "gold" ? "yellow" :
                tile.resource === "iron" ? "white" :
                tile.resource === "copper" ? "magenta" : "gray";
        break;
      case "floor":
        color = "white";
        break;
      case "water":
        // Alternate cyan/cyanBright for wave effect
        color = (x + y) % 2 === 0 ? "cyan" : "cyanBright";
        break;
      case "tree":
        // Alternate green/greenBright for depth
        color = (x + y) % 3 === 0 ? "greenBright" : "green";
        break;
      case "workshop":
        color = "magenta";
        break;
      case "stockpile":
        color = "blue";
        break;
      case "bed":
        color = "yellow";
        break;
      case "farm":
        color = "green";
        break;
      default:
        color = "white";
    }
  }

  return { char, color };
}

/**
 * Build the full character grid for the map
 */
function buildMapGrid(
  state: FortressState,
  viewport?: Viewport,
  renderMode: RenderMode = "terminal"
): RenderCell[][] {
  const startX = viewport?.x ?? 0;
  const startY = viewport?.y ?? 0;
  const width = viewport?.width ?? MAP_WIDTH;
  const height = viewport?.height ?? MAP_HEIGHT;

  const grid: RenderCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: RenderCell[] = [];
    for (let x = 0; x < width; x++) {
      const cell = getCellForPosition(state, startX + x, startY + y, renderMode);
      row.push(cell);
    }
    grid.push(row);
  }

  return grid;
}

/**
 * Get RGB color from terminal color name
 */
function colorToRGB(colorName: string): string {
  return TERMINAL_COLORS[colorName] ?? "#FFFFFF";
}

/**
 * Get resource color based on amount
 */
function getResourceColor(amount: number): string {
  if (amount > 50) return "green";
  if (amount > 20) return "yellow";
  return "red";
}

/**
 * Get happiness mood string
 */
function getMoodString(happiness: number): string {
  if (happiness > 80) return "Ecstatic";
  if (happiness > 60) return "Happy";
  if (happiness > 40) return "Content";
  if (happiness > 20) return "Unhappy";
  return "Miserable";
}

/**
 * Calculate average happiness of living dwarves
 */
function getAverageHappiness(dwarves: Dwarf[]): number {
  const living = dwarves.filter(d => d.alive);
  if (living.length === 0) return 0;
  return Math.round(living.reduce((sum, d) => sum + d.happiness, 0) / living.length);
}

/**
 * Render screenshot to PNG and save to file
 */
export async function renderScreenshot(
  state: FortressState,
  fortressName: string,
  options: ScreenshotOptions
): Promise<ScreenshotResult> {
  const viewport = options.viewport;
  const mapWidth = viewport?.width ?? MAP_WIDTH;
  const mapHeight = viewport?.height ?? MAP_HEIGHT;

  // Load settings for render mode
  const settings = loadSettingsSync();
  const renderMode = settings.renderMode ?? "terminal";

  // Emoji mode uses wider cells (emojis are typically 2 chars wide)
  const cellWidth = renderMode === "emoji" ? CELL_WIDTH * 2 : CELL_WIDTH;

  // Calculate canvas dimensions (with grid labels)
  const contentWidth = GRID_LABEL_WIDTH + (mapWidth * cellWidth) + (LEGEND_WIDTH * CELL_WIDTH);
  const contentHeight = (HEADER_HEIGHT * CELL_HEIGHT) + GRID_LABEL_HEIGHT + (mapHeight * CELL_HEIGHT) + CELL_HEIGHT;
  const canvasWidth = contentWidth + (PADDING * 2);
  const canvasHeight = contentHeight + (PADDING * 2);

  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Set font
  ctx.font = `${FONT_SIZE}px monospace`;
  ctx.textBaseline = "top";

  let y = PADDING;

  // === HEADER ===
  const pauseText = state.paused ? " [PAUSED]" : "";
  const headerText = `FORTRESS: "${fortressName}" - Year ${state.year}, ${state.season}${pauseText}`;
  ctx.fillStyle = colorToRGB("cyan");
  ctx.fillText(headerText, PADDING, y);
  y += CELL_HEIGHT;

  // Resources line
  const r = state.resources;
  const resourceParts = [
    { label: "Wood:", value: r.wood, color: getResourceColor(r.wood) },
    { label: "Stone:", value: r.stone, color: r.stone > 50 ? "white" : r.stone > 20 ? "yellow" : "red" },
    { label: "Food:", value: r.food, color: getResourceColor(r.food) },
    { label: "Drink:", value: r.drink, color: r.drink > 50 ? "cyan" : r.drink > 20 ? "yellow" : "red" },
    { label: "Jobs:", value: state.jobs.length, color: state.jobs.length > 0 ? "magenta" : "gray" },
  ];

  let x = PADDING;
  for (const part of resourceParts) {
    ctx.fillStyle = colorToRGB("white");
    ctx.fillText(part.label, x, y);
    x += ctx.measureText(part.label).width + 2;
    ctx.fillStyle = colorToRGB(part.color);
    ctx.fillText(String(part.value), x, y);
    x += ctx.measureText(String(part.value)).width + 15;
  }
  y += CELL_HEIGHT;

  // Status line
  const aliveDwarves = state.dwarves.filter(d => d.alive).length;
  const totalDwarves = state.dwarves.length;
  const deaths = state.statistics?.deaths || 0;
  const avgHappiness = getAverageHappiness(state.dwarves);
  const mood = getMoodString(avgHappiness);

  x = PADDING;
  ctx.fillStyle = colorToRGB("white");
  ctx.fillText("Dwarves:", x, y);
  x += ctx.measureText("Dwarves:").width + 2;
  ctx.fillStyle = colorToRGB(aliveDwarves > 0 ? "white" : "red");
  ctx.fillText(`${aliveDwarves}/${totalDwarves}`, x, y);
  x += ctx.measureText(`${aliveDwarves}/${totalDwarves}`).width + 15;

  if (deaths > 0) {
    ctx.fillStyle = colorToRGB("red");
    ctx.fillText(`Deaths: ${deaths}`, x, y);
    x += ctx.measureText(`Deaths: ${deaths}`).width + 15;
  }

  ctx.fillStyle = colorToRGB("white");
  ctx.fillText("Happiness:", x, y);
  x += ctx.measureText("Happiness:").width + 2;
  ctx.fillStyle = colorToRGB(avgHappiness > 60 ? "green" : avgHappiness > 30 ? "yellow" : "red");
  ctx.fillText(mood, x, y);
  x += ctx.measureText(mood).width + 15;

  ctx.fillStyle = colorToRGB("gray");
  ctx.fillText(`Tick: ${state.tick}`, x, y);
  y += CELL_HEIGHT * 1.5;

  // === MAP ===
  const mapGrid = buildMapGrid(state, viewport, renderMode);
  const mapStartX = PADDING + GRID_LABEL_WIDTH;
  const mapStartY = y + GRID_LABEL_HEIGHT;
  const viewportStartX = viewport?.x ?? 0;
  const viewportStartY = viewport?.y ?? 0;

  // Draw X-axis coordinate labels (every 10 columns)
  ctx.font = `11px monospace`;
  for (let col = 0; col <= mapWidth; col += 10) {
    const label = String(viewportStartX + col);
    const labelX = mapStartX + col * cellWidth;
    ctx.fillStyle = "#FFFF00"; // Bright yellow
    ctx.fillText(label, labelX, mapStartY - 4);
  }

  // Draw Y-axis coordinate labels (every 5 rows)
  for (let row = 0; row < mapHeight; row += 5) {
    const label = String(viewportStartY + row).padStart(2, " ");
    const labelY = mapStartY + row * CELL_HEIGHT;
    ctx.fillStyle = "#FFFF00"; // Bright yellow
    ctx.fillText(label, PADDING + 2, labelY + 12);
  }

  // Reset font for map
  ctx.font = `${FONT_SIZE}px monospace`;

  // Draw map border
  ctx.strokeStyle = colorToRGB("white");
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mapStartX - 2,
    mapStartY - 2,
    mapWidth * cellWidth + 4,
    mapHeight * CELL_HEIGHT + 4
  );

  // Draw map cells
  for (let row = 0; row < mapGrid.length; row++) {
    const gridRow = mapGrid[row];
    if (!gridRow) continue;
    for (let col = 0; col < gridRow.length; col++) {
      const cell = gridRow[col];
      if (!cell) continue;
      ctx.fillStyle = colorToRGB(cell.color);
      ctx.fillText(
        cell.char,
        mapStartX + col * cellWidth,
        mapStartY + row * CELL_HEIGHT
      );
    }
  }

  // === LEGEND ===
  const legendStartX = mapStartX + mapWidth * cellWidth + 20;
  let legendY = mapStartY;

  // Legend border
  ctx.strokeStyle = colorToRGB("cyan");
  ctx.strokeRect(
    legendStartX - 4,
    legendY - 2,
    LEGEND_WIDTH * CELL_WIDTH - 10,
    14 * CELL_HEIGHT + 4
  );

  ctx.fillStyle = colorToRGB("cyan");
  ctx.fillText("MAP", legendStartX, legendY);
  legendY += CELL_HEIGHT;

  // Legend items vary based on render mode
  const legendItems = renderMode === "emoji" ? [
    [{ char: "😺", color: "cyan", label: "=Happy" }, { char: "⬛", color: "gray", label: "=Wall" }],
    [{ char: "🐱", color: "yellow", label: "=Meh" }, { char: "⬜", color: "white", label: "=Floor" }],
    [{ char: "😿", color: "red", label: "=Sad" }, { char: "🟩", color: "green", label: "=Grass" }],
    [{ char: "🌲", color: "green", label: "=Tree" }, { char: "💧", color: "cyan", label: "=Water" }],
    [{ char: "💀", color: "red", label: "=Corpse" }, { char: "🏭", color: "magenta", label: "=Workshop" }],
    [{ char: "😈", color: "magenta", label: "=Mood" }, { char: "🌾", color: "green", label: "=Farm" }],
    [{ char: "d", color: "yellow", label: "=Designated" }, { char: "🪨", color: "gray", label: "=Stone" }],
    [{ char: "🪵", color: "#8B4513", label: "=Log" }, { char: "", color: "white", label: "" }],
  ] : [
    [{ char: "\u263A", color: "cyan", label: "=Happy" }, { char: "#", color: "gray", label: "=Wall" }],
    [{ char: "\u25CB", color: "yellow", label: "=Meh" }, { char: ".", color: "white", label: "=Floor" }],
    [{ char: "\u2639", color: "red", label: "=Sad" }, { char: ",", color: "greenBright", label: "=Grass" }],
    [{ char: "♣", color: "green", label: "=Tree" }, { char: "~", color: "cyan", label: "=Water" }],
    [{ char: "\u2020", color: "red", label: "=Corpse" }, { char: "X", color: "magenta", label: "=Workshop" }],
    [{ char: "M", color: "magenta", label: "=Mood" }, { char: "%", color: "green", label: "=Farm" }],
    [{ char: "d", color: "yellow", label: "=Designated" }, { char: "*", color: "gray", label: "=Stone" }],
    [{ char: "\u00B1", color: "#8B4513", label: "=Log" }, { char: "", color: "white", label: "" }],
  ];

  for (const row of legendItems) {
    let lx = legendStartX;
    for (const item of row) {
      ctx.fillStyle = colorToRGB(item.color);
      ctx.fillText(item.char, lx, legendY);
      ctx.fillStyle = colorToRGB("white");
      ctx.fillText(item.label, lx + CELL_WIDTH, legendY);
      lx += 80;
    }
    legendY += CELL_HEIGHT;
  }

  legendY += CELL_HEIGHT / 2;
  ctx.fillStyle = colorToRGB("cyan");
  ctx.fillText("WORKERS", legendStartX, legendY);
  legendY += CELL_HEIGHT;

  // Show current workers
  const workers = state.dwarves.filter(d => d.currentJob).slice(0, 5);
  for (const worker of workers) {
    const workerColor = DWARF_COLORS[worker.id % DWARF_COLORS.length] ?? "white";
    ctx.fillStyle = colorToRGB(workerColor);
    const firstName = worker.name.split(" ")[0] ?? worker.name;
    ctx.fillText(firstName, legendStartX, legendY);
    legendY += CELL_HEIGHT;
  }

  // Save to file
  const pngBuffer = await canvas.encode("png");
  const outputPath = getScreenshotPath(options.fortressId);
  await Bun.write(outputPath, pngBuffer);

  return {
    path: outputPath,
    dimensions: { width: canvasWidth, height: canvasHeight },
  };
}
