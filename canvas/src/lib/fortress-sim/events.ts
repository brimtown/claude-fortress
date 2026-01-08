import type { GameEvent } from "../../scenarios/fortress/types";

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
};
