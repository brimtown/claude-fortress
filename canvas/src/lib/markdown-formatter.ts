// Markdown formatter for FortressSummary
// Provides token-efficient output for Claude observation

import type { FortressSummary, DwarfStatus, GameEvent, BuildingInfo } from "../scenarios/fortress/types";

// Event type symbols
const EVENT_SYMBOLS: Record<string, string> = {
  info: "\u2139",     // ℹ
  warning: "\u26A0",  // ⚠
  success: "\u2713",  // ✓
  danger: "\u2717",   // ✗
};

// Pad string to fixed width
function pad(str: string, width: number): string {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

// Pad number to fixed width (right-aligned)
function padNum(num: number, width: number): string {
  const s = String(num);
  if (s.length >= width) return s;
  return " ".repeat(width - s.length) + s;
}

// Truncate string with ellipsis if needed
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026"; // ellipsis
}

// Format position as compact "x,y"
function formatPos(pos: { x: number; y: number }): string {
  return `${pos.x},${pos.y}`;
}

// Format dwarf table row
function formatDwarfRow(d: DwarfStatus): string {
  const id = padNum(d.id, 2);
  const name = pad(truncate(d.name, 8), 8);
  const labor = pad(d.labor, 9);
  const pos = pad(formatPos(d.position), 5);
  const hunger = padNum(Math.round(d.hunger), 3);
  const thirst = padNum(Math.round(d.thirst), 3);
  const happy = padNum(Math.round(d.happiness), 3);
  const task = d.currentTask ? truncate(d.currentTask, 10) : "idle";

  return `| ${id} | ${name} | ${labor} | ${pos} | ${hunger} | ${thirst} | ${happy} | ${task} |`;
}

// Format thoughts section for dwarves with notable thoughts
function formatThoughtsSection(dwarves: DwarfStatus[]): string[] {
  const lines: string[] = [];
  const dwarvesWithThoughts = dwarves.filter(d => d.topThoughts && d.topThoughts.length > 0);

  if (dwarvesWithThoughts.length === 0) return lines;

  lines.push("## Thoughts");
  for (const dwarf of dwarvesWithThoughts) {
    const name = truncate(dwarf.name, 12);
    const thoughts = dwarf.topThoughts!.join(", ");
    lines.push(`- **${name}**: ${thoughts}`);
  }
  lines.push("");

  return lines;
}

// Format event line
function formatEvent(e: GameEvent): string {
  const symbol = EVENT_SYMBOLS[e.type] || "?";
  return `- [${e.tick}] ${symbol} ${e.message}`;
}

// Format statistics as compact single line
function formatStats(summary: FortressSummary): string {
  const s = summary.statistics;
  const parts: string[] = [];

  // Deaths breakdown
  if (s.deaths > 0) {
    const breakdown: string[] = [];
    if (s.deathsByStarvation > 0) breakdown.push(`${s.deathsByStarvation} starvation`);
    if (s.deathsByDehydration > 0) breakdown.push(`${s.deathsByDehydration} dehydration`);
    if (s.deathsByInsanity > 0) breakdown.push(`${s.deathsByInsanity} insanity`);
    if (s.deathsByBerserk > 0) breakdown.push(`${s.deathsByBerserk} berserk`);
    parts.push(`Deaths: ${s.deaths} (${breakdown.join(", ")})`);
  } else {
    parts.push("Deaths: 0");
  }

  parts.push(`Peak: ${s.peakPopulation}`);
  parts.push(`Artifacts: ${s.artifactsCreated}`);

  return parts.join(" | ");
}

// Format crisis list or "none"
function formatCrisisList(names: string[]): string {
  if (names.length === 0) return "none";
  return names.join(", ");
}

/**
 * Format FortressSummary as markdown for token-efficient Claude observation
 */
export function formatSummaryAsMarkdown(
  summary: FortressSummary,
  fortressName: string
): string {
  const lines: string[] = [];

  // Header
  const pauseState = summary.paused ? "\u23F8 Paused" : "\u25B6 Running";
  lines.push(`# Fortress: ${fortressName}`);
  lines.push(`Year ${summary.year}, ${summary.season} | Tick ${summary.tick} | ${pauseState}`);
  lines.push("");

  // Resources
  lines.push("## Resources");
  lines.push("| Wood | Stone | Food | Drink |");
  lines.push("|------|-------|------|-------|");
  lines.push(`| ${padNum(summary.resources.wood, 4)} | ${padNum(summary.resources.stone, 5)} | ${padNum(summary.resources.food, 4)} | ${padNum(summary.resources.drink, 5)} |`);
  lines.push("");

  // Population & Jobs
  lines.push("## Population");
  lines.push(`Total: ${summary.dwarfCount} | Alive: ${summary.aliveCount}`);
  lines.push("");

  // Items on ground (awaiting haul)
  if (summary.items && (summary.items.stone > 0 || summary.items.log > 0)) {
    lines.push("## Items on Ground");
    const itemParts: string[] = [];
    if (summary.items.stone > 0) itemParts.push(`Stone: ${summary.items.stone}`);
    if (summary.items.log > 0) itemParts.push(`Logs: ${summary.items.log}`);
    lines.push(itemParts.join(" | "));
    lines.push("");
  }

  // Job queue breakdown
  lines.push("## Jobs");
  const j = summary.jobs;
  const jobParts: string[] = [];
  if (j.byType.dig > 0) {
    const digInfo = j.inaccessible > 0
      ? `Dig: ${j.byType.dig} (${j.inaccessible} waiting for access)`
      : `Dig: ${j.byType.dig}`;
    jobParts.push(digInfo);
  }
  if (j.byType.chop > 0) jobParts.push(`Chop: ${j.byType.chop}`);
  if (j.byType.build > 0) jobParts.push(`Build: ${j.byType.build}`);
  if (j.byType.haul > 0) jobParts.push(`Haul: ${j.byType.haul}`);
  if (j.byType.produce > 0) jobParts.push(`Produce: ${j.byType.produce}`);

  if (jobParts.length > 0) {
    lines.push(jobParts.join(" | "));
  } else {
    lines.push("No pending jobs");
  }
  lines.push("");

  // Crises
  lines.push("## Crises");
  lines.push(`- **Starving**: ${formatCrisisList(summary.crises.starving)}`);
  lines.push(`- **Dehydrating**: ${formatCrisisList(summary.crises.dehydrating)}`);
  lines.push(`- **In Mood**: ${formatCrisisList(summary.crises.inMood)}`);
  lines.push("");

  // Split dwarves into living and dead
  const livingDwarves = summary.dwarves.filter(d => d.alive);
  const deadDwarves = summary.dwarves.filter(d => !d.alive);

  // Living dwarves table
  if (livingDwarves.length > 0) {
    lines.push("## Dwarves");
    lines.push("| ID | Name     | Labor     | Pos   | Hunger | Thirst | Happy | Task       |");
    lines.push("|----|----------|-----------|-------|--------|--------|-------|------------|");
    for (const dwarf of livingDwarves) {
      lines.push(formatDwarfRow(dwarf));
    }
    lines.push("");

    // Add thoughts section after dwarves table
    lines.push(...formatThoughtsSection(livingDwarves));
  }

  // Dead dwarves (compact list)
  if (deadDwarves.length > 0) {
    const deadNames = deadDwarves.map(d => d.name).join(", ");
    lines.push(`**Deceased (${deadDwarves.length}):** ${deadNames}`);
    lines.push("");
  }

  // Buildings table
  if (summary.buildings && summary.buildings.length > 0) {
    lines.push("## Buildings");
    lines.push("| Type      | Pos   | Producing |");
    lines.push("|-----------|-------|-----------|");
    for (const b of summary.buildings) {
      const type = pad(b.type, 9);
      const pos = pad(`${b.x},${b.y}`, 5);
      const prod = b.producing || "-";
      lines.push(`| ${type} | ${pos} | ${prod} |`);
    }
    lines.push("");
  }

  // Recent events
  if (summary.recentEvents.length > 0) {
    lines.push("## Recent Events");
    for (const event of summary.recentEvents) {
      lines.push(formatEvent(event));
    }
    lines.push("");
  }

  // Statistics
  lines.push("## Statistics");
  lines.push(formatStats(summary));

  return lines.join("\n");
}
