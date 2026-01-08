import type {
  FortressState,
  FortressCommand,
  Dwarf,
  Building,
  Season,
  Tile,
} from "../../scenarios/fortress/types";
import { generateMap, MAP_WIDTH, MAP_HEIGHT } from "./map";
import { createStartingDwarves, updateDwarfNeeds, createDwarf } from "./dwarf";
import {
  createStartingResources,
  consumeResources,
  addResources,
  getBuildingCost,
} from "./resources";
import { createEvent, trimEvents, EventMessages } from "./events";

let nextBuildingId = 0;

/**
 * Create initial fortress state
 */
export function createInitialState(fortressName: string, seed?: number): FortressState {
  return {
    map: generateMap(seed),
    dwarves: createStartingDwarves(),
    resources: createStartingResources(),
    buildings: [],
    events: [
      createEvent(0, `Welcome to ${fortressName}!`, "success"),
      createEvent(0, "The fortress is established. Strike the earth!", "info"),
    ],
    tick: 0,
    year: 251,
    season: "Spring",
    paused: false,
  };
}

/**
 * Process a single simulation tick
 */
export function processTick(state: FortressState): void {
  if (state.paused) return;

  state.tick++;

  // Update dwarf needs
  for (const dwarf of state.dwarves) {
    updateDwarfNeeds(dwarf);

    // Handle critical needs
    if (dwarf.hunger > 90) {
      // Try to eat
      if (state.resources.food > 0) {
        state.resources.food--;
        dwarf.hunger = 0;
      } else {
        // Starving warning
        if (state.tick % 50 === 0) {
          state.events.push(
            createEvent(state.tick, EventMessages.dwarfStarving(dwarf.name), "danger")
          );
        }
      }
    }

    if (dwarf.thirst > 90) {
      // Try to drink
      if (state.resources.drink > 0) {
        state.resources.drink--;
        dwarf.thirst = 0;
      } else {
        // Dehydrated warning
        if (state.tick % 50 === 0) {
          state.events.push(
            createEvent(state.tick, EventMessages.dwarfDehydrated(dwarf.name), "danger")
          );
        }
      }
    }
  }

  // Random events (low probability)
  const rand = Math.random();

  // 1% chance of migrant wave
  if (rand < 0.01) {
    const count = 1 + Math.floor(Math.random() * 3); // 1-3 migrants
    for (let i = 0; i < count; i++) {
      const newDwarf = createDwarf(5, 3);
      state.dwarves.push(newDwarf);
    }
    state.events.push(
      createEvent(state.tick, EventMessages.migrantWave(count), "success")
    );
  }

  // Check for resource shortages every 100 ticks
  if (state.tick % 100 === 0) {
    if (state.resources.food < 20) {
      state.events.push(
        createEvent(state.tick, EventMessages.resourceShortage("food"), "warning")
      );
    }
    if (state.resources.drink < 20) {
      state.events.push(
        createEvent(state.tick, EventMessages.resourceShortage("drink"), "warning")
      );
    }
  }

  // Update season every 300 ticks (~2.5 minutes real-time at 500ms tick)
  if (state.tick % 300 === 0 && state.tick > 0) {
    const seasons: Season[] = ["Spring", "Summer", "Autumn", "Winter"];
    const currentIndex = seasons.indexOf(state.season);
    const nextIndex = (currentIndex + 1) % seasons.length;
    state.season = seasons[nextIndex];

    // New year after Winter
    if (state.season === "Spring") {
      state.year++;
    }

    state.events.push(
      createEvent(state.tick, EventMessages.seasonChange(state.season, state.year), "info")
    );
  }

  // Trim events to keep memory reasonable
  state.events = trimEvents(state.events, 15);
}

/**
 * Handle a command from Claude
 */
export function handleCommand(state: FortressState, command: FortressCommand): boolean {
  switch (command.type) {
    case "dig":
      return handleDigCommand(state, command.area);

    case "build":
      return handleBuildCommand(
        state,
        command.structure,
        command.location,
        command.subtype
      );

    case "assign":
      return handleAssignCommand(state, command.dwarfId, command.labor);

    case "pause":
      state.paused = command.paused;
      state.events.push(
        createEvent(
          state.tick,
          command.paused ? "Simulation paused" : "Simulation resumed",
          "info"
        )
      );
      return true;

    case "save":
      // Save command will be handled by the canvas layer
      state.events.push(createEvent(state.tick, "Fortress saved", "success"));
      return true;

    default:
      return false;
  }
}

/**
 * Handle dig command - designate area for mining
 */
function handleDigCommand(
  state: FortressState,
  area: { x: number; y: number; width: number; height: number }
): boolean {
  let dugCount = 0;
  let resourcesFound: string[] = [];

  for (let dy = 0; dy < area.height; dy++) {
    for (let dx = 0; dx < area.width; dx++) {
      const x = area.x + dx;
      const y = area.y + dy;

      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;

      const tile = state.map[y][x];

      if (tile.type === "wall" && !tile.dug) {
        tile.type = "floor";
        tile.dug = true;
        dugCount++;

        // Add stone resource
        state.resources.stone += 1;

        // Check for special resources
        if (tile.resource) {
          resourcesFound.push(tile.resource);
          state.events.push(
            createEvent(state.tick, EventMessages.miningComplete(x, y, tile.resource), "success")
          );
        }
      }
    }
  }

  if (dugCount > 0) {
    state.events.push(
      createEvent(
        state.tick,
        `Designated ${area.width}x${area.height} area for mining`,
        "info"
      )
    );
    return true;
  }

  return false;
}

/**
 * Handle build command - construct a building
 */
function handleBuildCommand(
  state: FortressState,
  structure: "workshop" | "stockpile" | "bed",
  location: { x: number; y: number },
  subtype?: string
): boolean {
  // Check if location is valid (must be on floor)
  if (
    location.x < 0 ||
    location.x >= MAP_WIDTH ||
    location.y < 0 ||
    location.y >= MAP_HEIGHT
  ) {
    return false;
  }

  const tile = state.map[location.y][location.x];
  if (tile.type !== "floor") {
    state.events.push(
      createEvent(state.tick, "Cannot build here - must be on dug floor", "warning")
    );
    return false;
  }

  // Check resource cost
  const cost = getBuildingCost(structure, subtype);
  if (!consumeResources(state.resources, cost)) {
    state.events.push(
      createEvent(state.tick, "Insufficient resources for construction", "warning")
    );
    return false;
  }

  // Create building
  const building: Building = {
    id: nextBuildingId++,
    type: structure,
    subtype,
    x: location.x,
    y: location.y,
    width: structure === "workshop" ? 3 : 1,
    height: structure === "workshop" ? 3 : 1,
    built: true,
  };

  state.buildings.push(building);

  // Update map tile
  tile.type = structure;

  state.events.push(
    createEvent(state.tick, EventMessages.buildingComplete(structure, subtype), "success")
  );

  return true;
}

/**
 * Handle assign command - change dwarf's labor
 */
function handleAssignCommand(
  state: FortressState,
  dwarfId: number,
  labor: string
): boolean {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);

  if (!dwarf) {
    return false;
  }

  dwarf.labor = labor as any;
  state.events.push(
    createEvent(state.tick, `${dwarf.name} assigned to ${labor}`, "info")
  );

  return true;
}
