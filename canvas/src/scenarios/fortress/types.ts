// Fortress Canvas Types

export type TileType =
  | "wall"      // # - Solid stone
  | "floor"     // . - Dug out
  | "water"     // ~ - Water
  | "tree"      // ^ - Tree
  | "soil"      // · - Undug soil
  | "door"      // + - Door
  | "workshop"  // X - Workshop
  | "stockpile" // ≈ - Stockpile
  | "bed";      // = - Bed

export interface Tile {
  type: TileType;
  dug?: boolean;
  resource?: "stone" | "iron" | "gold" | "copper";
}

export type Labor = "mining" | "carpentry" | "brewing" | "farming" | "hauling";

export interface Dwarf {
  id: number;
  name: string;
  x: number;
  y: number;
  hunger: number;      // 0-100, higher = hungrier
  thirst: number;      // 0-100, higher = thirstier
  energy: number;      // 0-100, lower = more tired
  labor: Labor;
  currentTask?: string;
  happiness: number;   // 0-100, higher = happier
}

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  drink: number;
}

export interface Building {
  id: number;
  type: "workshop" | "stockpile" | "bed";
  subtype?: "still" | "carpenter" | "food" | "wood" | "stone";
  x: number;
  y: number;
  width: number;
  height: number;
  built: boolean;
}

export interface GameEvent {
  id: number;
  tick: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
}

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export interface FortressState {
  map: Tile[][];        // 40x20 grid
  dwarves: Dwarf[];
  resources: Resources;
  buildings: Building[];
  events: GameEvent[];
  tick: number;
  year: number;
  season: Season;
  paused: boolean;
}

// Command types that Claude can send via IPC
export type FortressCommand =
  | { type: "dig"; area: { x: number; y: number; width: number; height: number } }
  | { type: "build"; structure: "workshop" | "stockpile" | "bed"; subtype?: string; location: { x: number; y: number } }
  | { type: "assign"; dwarfId: number; labor: Labor }
  | { type: "pause"; paused: boolean }
  | { type: "save" };

// Configuration sent when spawning fortress canvas
export interface FortressConfig {
  fortressName?: string;
  seed?: number;
  save?: boolean;  // Load from save file if exists
  initialState?: FortressState;
}

// Result returned when fortress canvas closes
export interface FortressResult {
  finalState: FortressState;
  statistics: {
    survived: number;
    deaths: number;
    totalTicks: number;
    resourcesGathered: Resources;
  };
}
