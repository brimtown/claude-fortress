// Emoji width measurement via terminal cursor position queries
// This is cursed but might actually work

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Our emoji set to measure
export const EMOJI_SET = {
  wall: "⬛",
  floor: "⬜",
  water: "💧",
  tree: "🌲",
  grass: "🟩",
  soil: "🟫",
  door: "🚪",
  workshop: "🏭",
  stockpile: "📦",
  bed: "🛏",  // Without variation selector (U+FE0F causes width issues)
  farm: "🌾",
  corpse: "💀",
  dwarfHappy: "😺",
  dwarfNeutral: "🐱",
  dwarfSad: "😿",
  dwarfMood: "😈",
  dwarfDead: "💀",
  stone: "🪨",
  log: "🪵",
  // Test invisible/space characters
  fullWidthSpace: "　",  // U+3000
  doubleSpace: "  ",     // Two regular spaces
} as const;

type EmojiKey = keyof typeof EMOJI_SET;

export interface EmojiWidths {
  [key: string]: number;
}

// Cache location
const CACHE_DIR = join(homedir(), ".claude");
const CACHE_FILE = join(CACHE_DIR, "emoji-widths.json");

// Cached widths (loaded once)
let cachedWidths: EmojiWidths | null = null;

/**
 * Get terminal identifier for caching
 */
function getTerminalId(): string {
  return process.env.TERM_PROGRAM || process.env.TERM || "unknown";
}

/**
 * Load cached widths from disk
 */
export function loadCachedWidths(): EmojiWidths | null {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
      const termId = getTerminalId();
      if (data[termId]) {
        return data[termId];
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

/**
 * Save widths to cache
 */
function saveCachedWidths(widths: EmojiWidths): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }

    let data: Record<string, EmojiWidths> = {};
    try {
      if (existsSync(CACHE_FILE)) {
        data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
      }
    } catch {
      // Start fresh
    }

    data[getTerminalId()] = widths;
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Ignore cache errors
  }
}

/**
 * Query cursor position using ANSI escape sequence
 * Returns [row, col] or null if timeout/unsupported
 */
async function getCursorPosition(timeout = 100): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      process.stdin.setRawMode?.(false);
      resolve(null);
    }, timeout);

    // Save current stdin mode
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    let response = "";

    const onData = (data: Buffer) => {
      response += data.toString();
      // Response format: \x1b[<row>;<col>R
      const match = response.match(/\x1b\[(\d+);(\d+)R/);
      if (match) {
        clearTimeout(timer);
        process.stdin.setRawMode?.(wasRaw ?? false);
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve([parseInt(match[1]!, 10), parseInt(match[2]!, 10)]);
      }
    };

    process.stdin.on("data", onData);

    // Query cursor position: ESC [ 6 n
    process.stdout.write("\x1b[6n");
  });
}

/**
 * Measure the rendered width of a single character/emoji
 */
async function measureCharWidth(char: string): Promise<number | null> {
  // Save cursor position
  process.stdout.write("\x1b[s");

  // Move to column 1
  process.stdout.write("\x1b[1G");

  // Get starting position
  const start = await getCursorPosition();
  if (!start) return null;

  // Print the character
  process.stdout.write(char);

  // Get ending position
  const end = await getCursorPosition();
  if (!end) return null;

  // Restore cursor and clear the line
  process.stdout.write("\x1b[u\x1b[2K");

  return end[1] - start[1];
}

/**
 * Measure all emoji in our set
 */
export async function measureEmojiWidths(): Promise<EmojiWidths> {
  const widths: EmojiWidths = {};

  // Hide cursor during measurement
  process.stdout.write("\x1b[?25l");

  for (const [key, emoji] of Object.entries(EMOJI_SET)) {
    const width = await measureCharWidth(emoji);
    widths[key] = width ?? 2; // Default to 2 if measurement fails
    widths[emoji] = width ?? 2; // Also store by emoji itself
  }

  // Show cursor again
  process.stdout.write("\x1b[?25h");

  // Cache the results
  saveCachedWidths(widths);
  cachedWidths = widths;

  return widths;
}

/**
 * Get emoji widths - uses cache if available, otherwise defaults
 */
export function getEmojiWidths(): EmojiWidths {
  if (cachedWidths) return cachedWidths;

  // Try loading from cache
  const cached = loadCachedWidths();
  if (cached) {
    cachedWidths = cached;
    return cached;
  }

  // Return defaults (assume 2 for all)
  const defaults: EmojiWidths = {};
  for (const [key, emoji] of Object.entries(EMOJI_SET)) {
    defaults[key] = 2;
    defaults[emoji] = 2;
  }
  return defaults;
}

/**
 * Find the max width in the set
 */
export function getMaxEmojiWidth(widths: EmojiWidths): number {
  return Math.max(...Object.values(widths).filter(w => typeof w === 'number'));
}

/**
 * Check if measurement has been done for current terminal
 */
export function hasWidthCache(): boolean {
  return loadCachedWidths() !== null;
}

/**
 * Generate padding to normalize emoji to target width
 */
export function getPadding(actualWidth: number, targetWidth: number): string {
  const diff = targetWidth - actualWidth;
  if (diff <= 0) return "";
  return " ".repeat(diff);
}

/**
 * Get a padded emoji string that renders at consistent width
 */
export function getPaddedEmoji(emoji: string, widths: EmojiWidths, targetWidth = 2): string {
  const actualWidth = widths[emoji] ?? 2;
  return emoji + getPadding(actualWidth, targetWidth);
}

// Quick test if run directly
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--measure")) {
    console.log(`Measuring emoji widths for terminal: ${process.env.TERM_PROGRAM || process.env.TERM || "unknown"}\n`);

    measureEmojiWidths().then((widths) => {
      console.log("\nResults:");
      console.log("─".repeat(40));

      const maxWidth = getMaxEmojiWidth(widths);
      for (const [key, emoji] of Object.entries(EMOJI_SET)) {
        const width = widths[key];
        const pad = width && width < maxWidth ? ` (needs +${maxWidth - width} pad)` : "";
        console.log(`${key.padEnd(15)} ${emoji}  → ${width} columns${pad}`);
      }

      console.log("─".repeat(40));
      console.log(`Max width: ${maxWidth}`);
      console.log(`Cached to: ${CACHE_FILE}`);

      // Show what padded rendering would look like
      console.log("\nPadded grid test:");
      for (const [key, emoji] of Object.entries(EMOJI_SET)) {
        const padded = getPaddedEmoji(emoji, widths, maxWidth);
        process.stdout.write(`[${padded}]`);
      }
      console.log("\n");

      process.exit(0);
    });
  } else {
    // Just show current cache status
    const cached = loadCachedWidths();
    if (cached) {
      console.log("Cached widths found:");
      console.log(JSON.stringify(cached, null, 2));
    } else {
      console.log("No cached widths found.");
      console.log("Run with --measure in your terminal to calibrate.");
    }
  }
}
