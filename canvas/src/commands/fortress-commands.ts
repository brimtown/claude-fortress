import type { FortressCommand, FortressState, Labor } from "../scenarios/fortress/types";
import {
  validateDigCommand,
  validateBuildCommand,
  validateAssignCommand,
  validateQueryCommand,
  type ValidationResult,
} from "./fortress-validators";

export interface ParsedCommand {
  success: boolean;
  command?: FortressCommand;
  queryType?: "quick" | "full" | "dwarves" | "jobs";
  error?: string;
}

/**
 * Parse slash command syntax into FortressCommand
 *
 * Supported commands:
 * - /dig <x> <y> <width> <height>
 * - /build <type> <x> <y> [subtype]
 * - /assign <dwarfId> <labor>
 * - /query [detail]
 * - /pause
 * - /save
 */
export function parseSlashCommand(
  input: string,
  currentState?: FortressState
): ParsedCommand {
  // Trim and normalize
  const trimmed = input.trim();

  // Must start with /
  if (!trimmed.startsWith("/")) {
    return {
      success: false,
      error: "Slash commands must start with / (e.g., /dig, /build, /query)"
    };
  }

  // Split into parts
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {
      success: false,
      error: "Empty command - try /dig, /build, /assign, /query, /pause, or /save"
    };
  }

  const command = parts[0].toLowerCase();

  switch (command) {
    case "dig":
      return parseDigCommand(parts.slice(1), currentState);

    case "build":
      return parseBuildCommand(parts.slice(1), currentState);

    case "assign":
      return parseAssignCommand(parts.slice(1), currentState);

    case "query":
      return parseQueryCommand(parts.slice(1));

    case "pause":
      return {
        success: true,
        command: { type: "pause", paused: true } // Toggle handled by engine
      };

    case "save":
      return {
        success: true,
        command: { type: "save" }
      };

    default:
      return {
        success: false,
        error: `Unknown command '${command}' - valid: dig, build, assign, query, pause, save`
      };
  }
}

/**
 * Parse /dig <x> <y> <width> <height>
 */
function parseDigCommand(args: string[], state?: FortressState): ParsedCommand {
  if (args.length !== 4) {
    return {
      success: false,
      error: `Dig requires 4 arguments: /dig <x> <y> <width> <height>\nExample: /dig 15 8 10 5`
    };
  }

  const x = parseInt(args[0], 10);
  const y = parseInt(args[1], 10);
  const width = parseInt(args[2], 10);
  const height = parseInt(args[3], 10);

  // Validate
  const validation = validateDigCommand(x, y, width, height, state);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    command: {
      type: "dig",
      area: { x, y, width, height }
    }
  };
}

/**
 * Parse /build <type> <x> <y> [subtype]
 */
function parseBuildCommand(args: string[], state?: FortressState): ParsedCommand {
  if (args.length < 3) {
    return {
      success: false,
      error: `Build requires 3-4 arguments: /build <type> <x> <y> [subtype]\nExample: /build workshop 10 12 still`
    };
  }

  const type = args[0].toLowerCase();
  const x = parseInt(args[1], 10);
  const y = parseInt(args[2], 10);
  const subtype = args[3]?.toLowerCase();

  // Validate
  const validation = validateBuildCommand(type, x, y, subtype, state);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    command: {
      type: "build",
      structure: type as "workshop" | "stockpile" | "bed",
      location: { x, y },
      subtype
    }
  };
}

/**
 * Parse /assign <dwarfId> <labor>
 */
function parseAssignCommand(args: string[], state?: FortressState): ParsedCommand {
  if (args.length !== 2) {
    return {
      success: false,
      error: `Assign requires 2 arguments: /assign <dwarfId> <labor>\nExample: /assign 0 mining`
    };
  }

  const dwarfId = parseInt(args[0], 10);
  const labor = args[1].toLowerCase();

  // Validate
  const validation = validateAssignCommand(dwarfId, labor, state);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    command: {
      type: "assign",
      dwarfId,
      labor: labor as Labor
    }
  };
}

/**
 * Parse /query [detail]
 */
function parseQueryCommand(args: string[]): ParsedCommand {
  const detailLevel = args[0]?.toLowerCase() || "quick";

  // Validate
  const validation = validateQueryCommand(detailLevel);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    queryType: detailLevel as "quick" | "full" | "dwarves" | "jobs"
  };
}

/**
 * Helper function to format command help
 */
export function getCommandHelp(commandName?: string): string {
  if (!commandName) {
    return `
Available slash commands:
  /dig <x> <y> <width> <height>     Designate mining area
  /build <type> <x> <y> [subtype]   Construct building
  /assign <dwarfId> <labor>         Change dwarf's job
  /query [detail]                    Show fortress status
  /pause                             Toggle simulation pause
  /save                              Manual save

Use /help <command> for detailed help on a specific command.
`.trim();
  }

  const helps: Record<string, string> = {
    dig: `
/dig <x> <y> <width> <height>

Designate a rectangular mining area. Dwarves will dig from accessible edges inward.

Examples:
  /dig 15 8 10 5    Dig 10x5 hall starting at (15,8)
  /dig 20 3 8 8     Dig 8x8 great hall

Notes:
- Map is 40x20 (x∈[0-39], y∈[0-19])
- Only wall tiles create jobs
- Dwarves work on accessible tiles (next to floors)
`.trim(),

    build: `
/build <type> <x> <y> [subtype]

Construct a building at the specified location.

Types: workshop, stockpile, bed
Workshop subtypes: still, carpenter, smelter

Examples:
  /build workshop 10 12 still    Build still workshop
  /build bed 15 8                 Place bed
  /build stockpile 20 5           Create stockpile

Requirements:
- Location must be dug floor
- Workshops cost: 10 wood + 15 stone
`.trim(),

    assign: `
/assign <dwarfId> <labor>

Change a dwarf's labor assignment.

Labors: mining, carpentry, brewing, farming, hauling

Examples:
  /assign 0 mining      Make dwarf #0 a miner
  /assign 3 carpentry   Assign dwarf #3 to carpentry

Notes:
- Use /query dwarves to see dwarf IDs
`.trim(),

    query: `
/query [detail]

Show fortress status.

Detail levels:
- quick (default)  Lightweight summary (~200 tokens)
- full             Complete state with map (~2000 tokens)
- dwarves          Dwarf list with stats
- jobs             Active job queue

Examples:
  /query           Quick summary
  /query full      Full state dump
  /query dwarves   See all dwarves
`.trim(),

    pause: `
/pause

Toggle simulation pause. Useful for planning without time pressure.

Example: /pause
`.trim(),

    save: `
/save

Trigger manual save. Fortress also auto-saves every 10 ticks.

Example: /save
`.trim(),
  };

  return helps[commandName.toLowerCase()] || `Unknown command: ${commandName}`;
}
