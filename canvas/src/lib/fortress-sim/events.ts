import type { GameEvent, DeathCause, MoodState } from "../../scenarios/fortress/types";

let nextEventId = 0;

/**
 * Restore event ID counter from loaded events (to prevent duplicate keys)
 */
export function restoreEventIdCounter(events: GameEvent[]): void {
  if (events.length > 0) {
    const maxId = Math.max(...events.map(e => e.id));
    nextEventId = maxId + 1;
  }
}

/**
 * Create a game event
 */
export function createEvent(
  tick: number,
  message: string,
  type: "info" | "warning" | "success" | "danger" = "info"
): GameEvent {
  return {
    id: nextEventId++,
    tick,
    message,
    type,
  };
}

/**
 * Keep only the most recent N events
 */
export function trimEvents(events: GameEvent[], maxEvents: number = 10): GameEvent[] {
  if (events.length <= maxEvents) {
    return events;
  }
  return events.slice(-maxEvents);
}

/**
 * Event generators for common occurrences
 */
export const EventMessages = {
  miningComplete: (x: number, y: number, resource?: string) => {
    if (resource) {
      return `Struck ${resource} at (${x},${y})!`;
    }
    return `Mining completed at (${x},${y})`;
  },

  buildingComplete: (type: string, subtype?: string) => {
    const name = subtype || type;
    return `${name} construction completed`;
  },

  migrantWave: (count: number) => {
    return `Migrants have arrived: ${count} ${count === 1 ? "dwarf" : "dwarves"}`;
  },

  resourceShortage: (resource: string) => {
    return `Warning: Running low on ${resource}!`;
  },

  dwarfStarving: (name: string) => {
    return `${name} is starving!`;
  },

  dwarfDehydrated: (name: string) => {
    return `${name} is dehydrated!`;
  },

  productionComplete: (item: string, count: number = 1) => {
    return `Produced ${count}x ${item}`;
  },

  seasonChange: (season: string, year: number) => {
    return `${season} has arrived, Year ${year}`;
  },

  // Death events - dramatic DF-style messages
  dwarfDeath: (name: string, cause: DeathCause) => {
    switch (cause) {
      case "starvation":
        return `${name} has starved to death!`;
      case "dehydration":
        return `${name} has died of thirst!`;
      case "insanity":
        return `${name} has gone utterly mad and perished!`;
      case "berserk_attack":
        return `${name} was slain in a berserk rampage!`;
      default:
        return `${name} has died!`;
    }
  },

  // Strange Mood events
  moodStruck: (name: string, moodType: MoodState, workshopType: string) => {
    const moodDescriptions: Record<string, string> = {
      fey: "has been struck by a fey mood",
      possessed: "has been possessed",
      secretive: "has become secretive",
    };
    const desc = moodDescriptions[moodType] || "has entered a strange mood";
    return `${name} ${desc} and claimed the ${workshopType}!`;
  },

  moodDemands: (name: string, materials: string[]) => {
    return `${name} demands: ${materials.join(", ")}`;
  },

  moodSuccess: (name: string, artifactName: string) => {
    return `${name} has created a masterwork: ${artifactName}!`;
  },

  moodFailed: (name: string, outcome: "melancholic" | "berserk") => {
    if (outcome === "berserk") {
      return `${name} has gone berserk! The fortress is in danger!`;
    }
    return `${name} has withdrawn from society, overcome with melancholy.`;
  },

  berserkAttack: (attackerName: string, victimName: string) => {
    return `${attackerName} attacks ${victimName} in a berserk rage!`;
  },

  // Production events
  workshopProduction: (workshopType: string, outputType: string, quantity: number) => {
    return `${workshopType} produced ${quantity} ${outputType}`;
  },

  farmHarvest: (quantity: number) => {
    return `Farm harvest: +${quantity} food`;
  },

  // Tantrum/grief events
  tantrum: (name: string, type: "berserk" | "melancholic") => {
    if (type === "berserk") {
      return `${name} has gone berserk from grief!`;
    }
    return `${name} has fallen into despair.`;
  },

  // Migration events
  migrationBlocked: (recentDeaths?: number) => {
    if (recentDeaths) {
      return `Migrants refused to journey here - ${recentDeaths} deaths this season have tarnished the fortress's reputation.`;
    }
    return "Migrants refused to journey to such a dangerous fortress.";
  },

  noMigrants: () => {
    return "The fortress attracted no migrants this season.";
  },

  // Fortress collapse
  fortressFallen: () => {
    return "Your fortress has crumbled to its end...";
  },
};
