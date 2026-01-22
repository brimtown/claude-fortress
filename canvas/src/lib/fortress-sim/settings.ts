import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const SETTINGS_DIR = join(homedir(), ".claude");
const SETTINGS_PATH = join(SETTINGS_DIR, "fortress-settings.json");

/**
 * Color mode for rendering
 * - "full": Use hex colors for consistent appearance across all terminals
 * - "theme": Use ANSI named colors that respect terminal theme
 */
export type ColorMode = "full" | "theme";

/**
 * Render mode for tile characters
 * - "terminal": ASCII/Unicode characters (♣, #, ~)
 * - "emoji": Emoji characters (🌲, 🪨, 🌊)
 */
export type RenderMode = "terminal" | "emoji";

/**
 * User settings for Claude Fortress
 */
export interface FortressSettings {
  colorMode: ColorMode;
  renderMode: RenderMode;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: FortressSettings = {
  colorMode: "full", // Default to full color for consistency
  renderMode: "terminal", // Default to ASCII/Unicode characters
};

/**
 * Ensure settings directory exists
 */
async function ensureSettingsDir(): Promise<void> {
  if (!existsSync(SETTINGS_DIR)) {
    await mkdir(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Load settings from disk, returns defaults if not found
 */
export async function loadSettings(): Promise<FortressSettings> {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const json = await readFile(SETTINGS_PATH, "utf-8");
    const data = JSON.parse(json);

    // Merge with defaults to handle missing fields
    return {
      ...DEFAULT_SETTINGS,
      ...data,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to disk
 */
export async function saveSettings(settings: FortressSettings): Promise<void> {
  await ensureSettingsDir();

  const json = JSON.stringify(settings, null, 2);
  await writeFile(SETTINGS_PATH, json, "utf-8");
}

/**
 * Load settings synchronously (for initial render)
 * Returns defaults if file doesn't exist or can't be read
 */
export function loadSettingsSync(): FortressSettings {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const { readFileSync } = require("node:fs");
    const json = readFileSync(SETTINGS_PATH, "utf-8");
    const data = JSON.parse(json);

    return {
      ...DEFAULT_SETTINGS,
      ...data,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
