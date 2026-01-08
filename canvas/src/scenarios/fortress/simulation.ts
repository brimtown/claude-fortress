import type { ScenarioDefinition } from "../types";
import type { FortressConfig, FortressResult } from "./types";

export const fortressSimulationScenario: ScenarioDefinition<
  FortressConfig,
  FortressResult
> = {
  name: "fortress-simulation",
  description: "Interactive Dwarf Fortress simulation with strategic command control",
  canvasKind: "fortress",
  interactionMode: "view-only", // Claude watches and issues commands via IPC
  closeOn: "command", // Close only when explicitly commanded
  defaultConfig: {
    fortressName: "Copperwhispers",
    save: false,
  },
};
