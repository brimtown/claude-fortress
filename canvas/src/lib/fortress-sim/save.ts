import type { FortressState } from "../../scenarios/fortress/types";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const SAVES_DIR = join(homedir(), ".claude", "fortress-saves");

/**
 * Ensure saves directory exists
 */
async function ensureSavesDir(): Promise<void> {
  if (!existsSync(SAVES_DIR)) {
    await mkdir(SAVES_DIR, { recursive: true });
  }
}

/**
 * Get save file path for a fortress
 */
function getSavePath(fortressName: string): string {
  // Sanitize fortress name for filename
  const sanitized = fortressName.replace(/[^a-zA-Z0-9-_]/g, "_");
  return join(SAVES_DIR, `${sanitized}.json`);
}

export interface SaveOptions {
  silent?: boolean;
}

/**
 * Save fortress state to disk
 */
export async function saveFortress(
  fortressName: string,
  state: FortressState,
  options?: SaveOptions
): Promise<void> {
  await ensureSavesDir();

  const savePath = getSavePath(fortressName);
  const saveData = {
    version: 1,
    fortressName,
    savedAt: new Date().toISOString(),
    state,
  };

  const json = JSON.stringify(saveData, null, 2);
  await writeFile(savePath, json, "utf-8");

  if (!options?.silent) {
    console.log(`✓ Fortress saved to ${savePath}`);
  }
}

/**
 * Load fortress state from disk
 */
export async function loadFortress(
  fortressName: string,
  options?: SaveOptions
): Promise<FortressState | null> {
  const savePath = getSavePath(fortressName);

  if (!existsSync(savePath)) {
    if (!options?.silent) {
      console.log(`No save file found at ${savePath}`);
    }
    return null;
  }

  try {
    const json = await readFile(savePath, "utf-8");
    const saveData = JSON.parse(json);

    if (saveData.version !== 1) {
      if (!options?.silent) {
        console.warn(`Unknown save version: ${saveData.version}`);
      }
      return null;
    }

    if (!options?.silent) {
      console.log(`✓ Fortress loaded from ${savePath}`);
      console.log(`  Saved at: ${saveData.savedAt}`);
      console.log(`  Tick: ${saveData.state.tick}`);
      console.log(`  Year: ${saveData.state.year}, ${saveData.state.season}`);
      console.log(`  Dwarves: ${saveData.state.dwarves.length}`);
    }

    return saveData.state as FortressState;
  } catch (error) {
    if (!options?.silent) {
      console.error(`Error loading save: ${error}`);
    }
    return null;
  }
}

/**
 * Check if a save file exists
 */
export function hasSave(fortressName: string): boolean {
  const savePath = getSavePath(fortressName);
  return existsSync(savePath);
}

/**
 * List all saved fortresses
 */
export async function listSaves(): Promise<string[]> {
  await ensureSavesDir();

  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(SAVES_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}
