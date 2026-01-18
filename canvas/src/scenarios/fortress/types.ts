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
  | "bed"       // = - Bed
  | "farm"      // % - Farm plot
  | "corpse";   // X - Dead dwarf

export interface Tile {
  type: TileType;
  dug?: boolean;
  resource?: "stone" | "iron" | "gold" | "copper";
}

export type Labor = "mining" | "carpentry" | "brewing" | "farming" | "hauling";

export type DeathCause = "starvation" | "dehydration" | "insanity" | "berserk_attack";

export type MoodState = "normal" | "fey" | "possessed" | "secretive" | "melancholic" | "berserk";

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
  currentJob?: Job;    // The job this dwarf is actively working on
  happiness: number;   // 0-100, higher = happier

  // Death system
  alive: boolean;               // Default true, false when dead
  starvationTicks?: number;     // Consecutive ticks without food while starving
  dehydrationTicks?: number;    // Consecutive ticks without drink while dehydrated
  deathCause?: DeathCause;      // How they died
  deathTick?: number;           // When they died

  // Grief system
  griefTicks?: number;          // Ticks remaining in grief state (work penalty)

  // Strange Mood system
  moodState?: MoodState;        // Current mood (undefined = normal)
  claimedBuildingId?: number;   // Workshop claimed during strange mood
  moodDemands?: string[];       // Materials demanded: ["wood", "stone"]
  moodProgress?: number;        // 0-100, artifact creation progress
  moodStartTick?: number;       // When mood began
  moodDeadline?: number;        // Tick when mood fails if demands unmet
  artifactCreated?: string;     // Name of legendary artifact (if successful)
  isLegendary?: boolean;        // True if completed a mood successfully
}

export interface Job {
  id: number;
  type: "dig" | "build" | "haul" | "produce";
  x: number;
  y: number;
  progress: number;    // 0-100, work done on this job
  requiredLabor: Labor;
  assignedDwarfId?: number;
  buildingType?: "workshop" | "stockpile" | "bed" | "farm";
  buildingSubtype?: string;

  // Production job fields
  outputType?: "food" | "drink";
  outputQuantity?: number;      // How much to produce (default 5)
}

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  drink: number;
}

export interface Building {
  id: number;
  type: "workshop" | "stockpile" | "bed" | "farm";
  subtype?: "still" | "carpenter" | "food" | "wood" | "stone" | "farm";
  x: number;
  y: number;
  width: number;
  height: number;
  built: boolean;

  // Mood system - workshop claiming
  claimedByDwarfId?: number;    // Dwarf who claimed this during mood
  claimedAtTick?: number;       // When it was claimed

  // Production tracking
  activeJobId?: number;         // Current production job
  autoQueue?: boolean;          // Auto-queue production jobs
}

export interface GameEvent {
  id: number;
  tick: number;
  message: string;
  type: "info" | "warning" | "success" | "danger";
}

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export interface FortressStatistics {
  deaths: number;
  deathsByStarvation: number;
  deathsByDehydration: number;
  deathsByInsanity: number;
  deathsByBerserk: number;
  artifactsCreated: number;
  peakPopulation: number;
  moodsTriggered: number;
  moodsSucceeded: number;
  moodsFailed: number;
}

export interface FortressState {
  map: Tile[][];        // 40x20 grid
  dwarves: Dwarf[];
  resources: Resources;
  buildings: Building[];
  jobs: Job[];          // Pending work designations
  events: GameEvent[];
  tick: number;
  year: number;
  season: Season;
  paused: boolean;
  statistics: FortressStatistics;

  // Losing system
  fallen: boolean;      // True when fortress has collapsed (all dead)
  wealth: number;       // Cached wealth for migration calculations
}

// Dwarf status for summary (lighter than full Dwarf)
export interface DwarfStatus {
  id: number;
  name: string;
  position: { x: number; y: number }; // Dwarf location for spatial reasoning
  labor: Labor;
  hunger: number;
  thirst: number;
  happiness: number;
  alive: boolean;
  currentTask?: string;
  moodState?: MoodState;
  moodDemands?: string[];
  isLegendary?: boolean;
}

// Crisis alerts for Claude visibility
export interface CrisisAlerts {
  starving: string[];       // Names of dwarves with hunger > 80
  dehydrating: string[];    // Names of dwarves with thirst > 80
  inMood: string[];         // Names of dwarves in strange mood
  recentDeaths: string[];   // Names of recently deceased (last 5)
}

// Lightweight summary for token-efficient polling (excludes map, minimizes dwarves)
export interface JobBreakdown {
  total: number;
  byType: { dig: number; build: number; produce: number };
  inaccessible: number;  // Dig jobs that can't be worked yet (no adjacent floor)
}

export interface FortressSummary {
  tick: number;
  year: number;
  season: Season;
  paused: boolean;
  resources: Resources;
  dwarfCount: number;
  aliveCount: number;
  activeJobs: number;
  jobs: JobBreakdown;  // Detailed job queue info
  recentEvents: GameEvent[];  // Last 3-5 events only

  // Enhanced visibility for Claude
  dwarves: DwarfStatus[];
  buildings: BuildingInfo[];  // What structures exist
  crises: CrisisAlerts;
  statistics: FortressStatistics;
}

// Command types that Claude can send via IPC
export type FortressCommand =
  | { type: "dig"; area: { x: number; y: number; width: number; height: number } }
  | { type: "build"; structure: "workshop" | "stockpile" | "bed" | "farm"; subtype?: string; location: { x: number; y: number } }
  | { type: "assign"; dwarfId: number; labor: Labor }
  | { type: "pause"; paused: boolean }
  | { type: "save" }
  | { type: "cancel"; area: { x: number; y: number; width: number; height: number } };

// Tile info for inspect results
export interface TileInfo {
  x: number;
  y: number;
  type: TileType;
  resource?: "stone" | "iron" | "gold" | "copper";
  designation?: "dig" | "channel";
}

// Building info for inspect results
export interface BuildingInfo {
  x: number;
  y: number;
  type: "workshop" | "stockpile" | "farm" | "still" | "bed";
  producing?: string;
}

// Job info for inspect results
export interface JobInfo {
  id: number;
  x: number;
  y: number;
  type: "dig" | "build" | "haul" | "produce";
  progress: number;
  assignedTo?: string;
}

// Result of spatial inspect query
export interface InspectResult {
  center: { x: number; y: number };
  radius: number;
  tiles: TileInfo[];
  dwarves: DwarfStatus[];
  buildings: BuildingInfo[];
  jobs: JobInfo[];
}

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
