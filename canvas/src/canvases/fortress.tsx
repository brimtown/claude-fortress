import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput, Spacer } from "ink";

const PLUGIN_VERSION = "0.4.3";
import type {
  FortressConfig,
  FortressState,
  FortressCommand,
  FortressSummary,
  ViewMode,
} from "../scenarios/fortress/types";
import {
  EVENT_COLORS,
  getTileColor,
  getResourceColor,
  getHappinessColor,
  getWealthColor,
  getDwarfColor,
} from "./fortress/colors";
import { createInitialState, processTick, handleCommand } from "../lib/fortress-sim/engine";
import { getTileChar } from "../lib/fortress-sim/map";
import { getAverageHappiness, getDwarfMood, getLivingDwarfCount } from "../lib/fortress-sim/dwarf";
import { saveFortress, loadFortress } from "../lib/fortress-sim/save";
import { restoreEventIdCounter } from "../lib/fortress-sim/events";
import { buildInspectResult } from "../lib/fortress-sim/inspect";
import { isJobAccessible } from "../lib/fortress-sim/jobs";
import { formatSummaryAsMarkdown } from "../lib/markdown-formatter";
import { renderScreenshot } from "../lib/screenshot";
import { createIPCServer } from "../ipc/server";
import type { ControllerMessage, Viewport } from "../ipc/types";
import {
  loadSettingsSync,
  saveSettings,
  type FortressSettings,
  type ColorMode,
} from "../lib/fortress-sim/settings";

interface Props {
  id: string;
  config?: FortressConfig;
  socketPath?: string;
  scenario?: string;
}

export function FortressCanvas({ id, config, socketPath, scenario }: Props) {
  const { exit } = useApp();
  const fortressName = config?.fortressName || "Copperwhispers";
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI modal state
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [debugMode, setDebugMode] = useState(config?.debug ?? false);

  // Settings state (loaded synchronously to avoid flicker)
  const [settings, setSettings] = useState<FortressSettings>(() => loadSettingsSync());

  // Menu selection state
  const [menuSelection, setMenuSelection] = useState(0);
  const menuItems = ["Resume", "Settings", "Save", "Quit"] as const;

  // Debug logging helper
  const debugLog = (...args: unknown[]) => {
    if (debugMode) console.log(...args);
  };

  // Initialize or load state
  const [state, setState] = useState<FortressState>(() => {
    if (config?.initialState) {
      return config.initialState;
    }
    return createInitialState(fortressName, config?.seed);
  });

  // Ref to always have current state in IPC callbacks (fixes stale closure bug)
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load from save file on mount (if config.save is true)
  useEffect(() => {
    async function loadSave() {
      if (config?.save) {
        try {
          const loadedState = await loadFortress(fortressName, { silent: true });
          if (loadedState) {
            // CRITICAL: Restore event ID counter to prevent duplicate React keys
            // Without this, nextEventId resets to 0 but loaded events have IDs in thousands
            // React crashes with "Encountered two children with the same key" error
            restoreEventIdCounter(loadedState.events);

            // Ensure new fields exist (for backwards compat with old saves)
            if (!loadedState.jobs) {
              loadedState.jobs = [];
            }
            if (!loadedState.statistics) {
              loadedState.statistics = {
                deaths: 0,
                deathsByStarvation: 0,
                deathsByDehydration: 0,
                deathsByInsanity: 0,
                deathsByBerserk: 0,
                artifactsCreated: 0,
                peakPopulation: loadedState.dwarves.length,
                moodsTriggered: 0,
                moodsSucceeded: 0,
                moodsFailed: 0,
              };
            }
            // Ensure all dwarves have alive field (old saves)
            for (const dwarf of loadedState.dwarves) {
              if (dwarf.alive === undefined) {
                dwarf.alive = true;
              }
            }

            setState(loadedState);
            debugLog(`Loaded fortress "${fortressName}" from save`);
          } else {
            debugLog(`No save found for "${fortressName}", starting new`);
          }
        } catch (error) {
          debugLog("Error loading save:", error);
          setLoadError(`Failed to load save: ${error}`);
        }
      }
      setIsLoading(false);
    }
    loadSave();
  }, []);

  // Set up IPC server to receive commands from Claude
  useEffect(() => {
    if (!socketPath) return;

    let ipcServer: any = null;

    async function setupIPC() {
      try {
        ipcServer = await createIPCServer({
          socketPath: socketPath!,
          onMessage: (msg: ControllerMessage): void => {
            if (msg.type === "command") {
              const command = msg.command as FortressCommand;
              setState((prevState) => {
                const newState = { ...prevState };
                const success = handleCommand(newState, command);
                if (!success) {
                  debugLog(`Command failed: ${JSON.stringify(command)}`);
                }
                return newState;
              });
            } else if (msg.type === "getState") {
              // Send current state back to querying client
              // Use stateRef.current to avoid stale closure bug
              if (ipcServer) {
                ipcServer.broadcast({ type: "state", data: stateRef.current });
              }
            } else if (msg.type === "getSummary") {
              // Send enhanced summary with crisis alerts and statistics
              // Use stateRef.current to avoid stale closure bug
              if (ipcServer) {
                const summaryMsg = msg as { type: "getSummary"; format?: "json" | "markdown" };
                const currentState = stateRef.current;
                const livingDwarves = currentState.dwarves.filter(d => d.alive);
                const deadDwarves = currentState.dwarves.filter(d => !d.alive);

                // Build dwarf status array with position
                // Check for "waiting" state - idle dwarf with matching jobs but none accessible
                const dwarfStatus = currentState.dwarves.map(d => {
                  let task = d.currentTask;

                  // If dwarf is idle and alive, check if they're waiting for accessible jobs
                  if (!task && d.alive) {
                    const matchingJobs = currentState.jobs.filter(j => j.requiredLabor === d.labor && !j.assignedDwarfId);
                    if (matchingJobs.length > 0) {
                      const hasAccessible = matchingJobs.some(j => {
                        if (j.type !== "dig") return true; // Non-dig jobs are always accessible
                        return isJobAccessible(currentState, j.x, j.y);
                      });
                      if (!hasAccessible) {
                        task = "waiting (no path)";
                      }
                    }
                  }

                  return {
                    id: d.id,
                    name: d.name,
                    position: { x: d.x, y: d.y },
                    labor: d.labor,
                    hunger: d.hunger,
                    thirst: d.thirst,
                    happiness: d.happiness,
                    alive: d.alive,
                    currentTask: task,
                    moodState: d.moodState,
                    moodDemands: d.moodDemands,
                    isLegendary: d.isLegendary,
                  };
                });

                // Build crisis alerts
                const crises = {
                  starving: livingDwarves.filter(d => d.hunger > 80).map(d => d.name),
                  dehydrating: livingDwarves.filter(d => d.thirst > 80).map(d => d.name),
                  inMood: livingDwarves.filter(d => d.moodState && d.moodState !== "normal").map(d => d.name),
                  recentDeaths: deadDwarves.slice(-5).map(d => d.name),
                };

                // Build buildings list
                const buildingInfo = currentState.buildings.map(b => ({
                  x: b.x,
                  y: b.y,
                  type: b.type as "workshop" | "stockpile" | "farm" | "still" | "bed",
                  producing: b.autoQueue ? (b.subtype || b.type) : undefined,
                }));

                // Compute job breakdown
                const jobBreakdown = {
                  total: currentState.jobs.length,
                  byType: {
                    dig: currentState.jobs.filter(j => j.type === "dig").length,
                    build: currentState.jobs.filter(j => j.type === "build").length,
                    produce: currentState.jobs.filter(j => j.type === "produce").length,
                  },
                  inaccessible: currentState.jobs.filter(
                    j => j.type === "dig" && !isJobAccessible(currentState, j.x, j.y)
                  ).length,
                };

                const summary: FortressSummary = {
                  tick: currentState.tick,
                  year: currentState.year,
                  season: currentState.season,
                  paused: currentState.paused,
                  resources: currentState.resources,
                  dwarfCount: currentState.dwarves.length,
                  aliveCount: livingDwarves.length,
                  activeJobs: currentState.jobs.length,
                  jobs: jobBreakdown,
                  recentEvents: currentState.events.slice(-5),
                  dwarves: dwarfStatus,
                  buildings: buildingInfo,
                  crises,
                  statistics: currentState.statistics,
                };

                // Return markdown by default, JSON if explicitly requested
                if (summaryMsg.format === "json") {
                  ipcServer.broadcast({ type: "state", data: summary });
                } else {
                  const markdown = formatSummaryAsMarkdown(summary, fortressName);
                  ipcServer.broadcast({ type: "state", data: markdown });
                }
              }
            } else if (msg.type === "screenshot") {
              // Capture PNG screenshot
              if (ipcServer) {
                const screenshotMsg = msg as { type: "screenshot"; viewport?: Viewport };
                renderScreenshot(stateRef.current, fortressName, {
                  fortressId: id,
                  viewport: screenshotMsg.viewport,
                }).then((result) => {
                  ipcServer.broadcast({
                    type: "screenshot",
                    path: result.path,
                    tick: stateRef.current.tick,
                    dimensions: result.dimensions,
                  });
                }).catch((error) => {
                  ipcServer.broadcast({ type: "error", message: `Screenshot failed: ${error.message}` });
                });
              }
            } else if (msg.type === "inspect") {
              // Spatial query
              if (ipcServer) {
                const inspectMsg = msg as { type: "inspect"; x: number; y: number; radius?: number };
                const result = buildInspectResult(
                  stateRef.current,
                  inspectMsg.x,
                  inspectMsg.y,
                  inspectMsg.radius ?? 0
                );
                ipcServer.broadcast({ type: "inspect", data: result });
              }
            } else if (msg.type === "close") {
              exit();
            }
          },
          onClientConnect: () => {
            debugLog(`Claude connected to fortress ${id}`);
          },
          onError: (error) => {
            debugLog(`IPC error: ${error.message}`);
          },
        });

        // Send ready message
        ipcServer.broadcast({ type: "ready", scenario: "fortress-simulation" });
        debugLog(`Fortress IPC server listening on ${socketPath}`);
      } catch (error) {
        debugLog(`Failed to create IPC server: ${error}`);
      }
    }

    setupIPC();

    return () => {
      ipcServer?.close();
    };
  }, [socketPath, id, exit]);

  // Game loop - tick every 500ms
  useEffect(() => {
    if (isLoading) return;

    const interval = setInterval(() => {
      setState((prevState) => {
        const newState = { ...prevState };
        processTick(newState);
        return newState;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Auto-save every 10 ticks
  useEffect(() => {
    if (isLoading || !config?.save) return;

    async function autoSave() {
      if (state.tick > 0 && state.tick % 10 === 0) {
        try {
          await saveFortress(fortressName, state, { silent: true });
        } catch (error) {
          debugLog("Auto-save failed:", error);
        }
      }
    }

    autoSave();
  }, [state.tick, isLoading]);

  // Helper to save and exit
  const saveAndExit = () => {
    if (config?.save) {
      saveFortress(fortressName, state, { silent: true }).catch((e) => debugLog("Save error:", e));
    }
    exit();
  };

  // Handle menu selection
  const handleMenuSelect = (item: typeof menuItems[number]) => {
    switch (item) {
      case "Resume":
        setViewMode("main");
        break;
      case "Settings":
        setViewMode("settings");
        break;
      case "Save":
        saveFortress(fortressName, state, { silent: true })
          .then(() => debugLog("Manual save complete"))
          .catch((e) => debugLog("Save error:", e));
        setViewMode("main");
        break;
      case "Quit":
        saveAndExit();
        break;
    }
  };

  // Toggle color mode setting
  const toggleColorMode = () => {
    const newMode: ColorMode = settings.colorMode === "full" ? "theme" : "full";
    const newSettings = { ...settings, colorMode: newMode };
    setSettings(newSettings);
    saveSettings(newSettings).catch((e) => debugLog("Settings save error:", e));
  };

  // Handle keyboard input
  useInput((input, key) => {
    // ESC key navigation
    if (key.escape) {
      if (viewMode === "settings") {
        // Settings -> Menu
        setViewMode("menu");
        return;
      }
      if (viewMode === "menu") {
        // Menu -> Main (resume)
        setViewMode("main");
        return;
      }
      if (viewMode !== "main") {
        // Other modals -> Main
        setViewMode("main");
        return;
      }
      // Main -> Open menu (DF style)
      setViewMode("menu");
      setMenuSelection(0);
      return;
    }

    // Menu navigation
    if (viewMode === "menu") {
      if (key.upArrow) {
        setMenuSelection((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        return;
      }
      if (key.downArrow) {
        setMenuSelection((prev) => (prev + 1) % menuItems.length);
        return;
      }
      if (key.return || input === " ") {
        handleMenuSelect(menuItems[menuSelection]!);
        return;
      }
      // Number shortcuts for menu items
      if (input >= "1" && input <= "4") {
        const idx = parseInt(input) - 1;
        if (idx < menuItems.length) {
          handleMenuSelect(menuItems[idx]!);
        }
        return;
      }
      return; // Don't process other keys in menu mode
    }

    // Settings navigation
    if (viewMode === "settings") {
      if (key.leftArrow || key.rightArrow || key.return || input === " ") {
        toggleColorMode();
        return;
      }
      return; // Don't process other keys in settings mode
    }

    if (input === "q") {
      saveAndExit();
      return;
    }

    // View mode shortcuts (toggle: press again to return to main)
    if (input === "a") {
      setViewMode(viewMode === "announcements" ? "main" : "announcements");
      return;
    }
    if (input === "u") {
      setViewMode(viewMode === "units" ? "main" : "units");
      return;
    }
    if (input === "b") {
      setViewMode(viewMode === "buildings" ? "main" : "buildings");
      return;
    }
    if (input === "z") {
      setViewMode(viewMode === "stocks" ? "main" : "stocks");
      return;
    }

    // Debug mode toggle (works from any view)
    if (input === "d") {
      setDebugMode((prev) => !prev);
      return;
    }

    // Pause toggle
    if (input === "p") {
      setState((prevState) => ({
        ...prevState,
        paused: !prevState.paused,
      }));
      return;
    }

    // Manual save
    if (input === "s") {
      saveFortress(fortressName, state, { silent: true })
        .then(() => debugLog("Manual save complete"))
        .catch((e) => debugLog("Save error:", e));
      return;
    }
  });

  // Calculate derived values
  const avgHappiness = getAverageHappiness(state.dwarves);
  const mood = getDwarfMood(avgHappiness);
  const aliveDwarves = getLivingDwarfCount(state.dwarves);
  const totalDwarves = state.dwarves.length;
  const deaths = state.statistics?.deaths || 0;

  // Render map with colors
  const renderMap = () => {
    const lines: React.ReactNode[] = [];

    for (let y = 0; y < state.map.length; y++) {
      const chars: React.ReactNode[] = [];
      const row = state.map[y];
      if (!row) continue;

      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (!tile) continue;

        // Check if there's a dwarf at this position
        const dwarfHere = state.dwarves.find((d) => d.x === x && d.y === y);

        // Check if there's a dig designation here
        const digJob = state.jobs.find((j) => j.type === "dig" && j.x === x && j.y === y);

        let char = getTileChar(tile);
        let color: string = "white";

        let bgColor: string | undefined = undefined;

        if (dwarfHere) {
          if (!dwarfHere.alive) {
            // Dead dwarf = corpse
            char = "†";
            color = "red";
          } else {
            // Each dwarf gets their own color based on ID
            color = getDwarfColor(dwarfHere.id, settings.colorMode);
            // Face shows mood or strange mood state
            if (dwarfHere.moodState && dwarfHere.moodState !== "normal") {
              char = "M"; // In a strange mood!
              color = "magenta";
            } else if (dwarfHere.happiness < 30) {
              char = "☹"; // Sad face
            } else if (dwarfHere.happiness > 70) {
              char = "☺"; // Happy face
            } else {
              char = "○"; // Neutral face
            }
          }
        } else if (digJob && tile?.type === "wall") {
          // Dig designation: keep wall color, add yellow background highlight
          color = getTileColor(tile.type, x, y, tile.resource, settings.colorMode);
          bgColor = "#3d3d00"; // Subtle dark yellow background
        } else {
          // Color tiles by type with position-based variation
          color = getTileColor(tile.type, x, y, tile.resource, settings.colorMode);
        }

        chars.push(<Text key={`${y}-${x}`} color={color} backgroundColor={bgColor}>{char}</Text>);
      }

      lines.push(
        <Text key={y}>
          {chars}
        </Text>
      );
    }

    return lines;
  };

  const mapLines = renderMap();
  const recentEvents = state.events.slice(-5); // Show last 5 events

  // Modal header component
  const ModalHeader = ({ title }: { title: string }) => (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        {title} - Year {state.year}, {state.season}
        {state.paused && <Text color="yellow"> [PAUSED]</Text>}
      </Text>
      <Text dimColor> | ESC to return</Text>
    </Box>
  );

  // Announcements modal view
  const AnnouncementsView = () => (
    <Box flexDirection="column" width={80} height={30}>
      <ModalHeader title="ANNOUNCEMENTS" />
      <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1} height={26} overflowY="hidden">
        <Text bold color="yellow">Event History (newest first)</Text>
        <Text dimColor>────────────────────────────────────────</Text>
        {state.events.slice().reverse().slice(0, 22).map((event) => (
          <Text key={event.id} color={EVENT_COLORS[event.type] ?? "white"}>
            <Text dimColor>[{String(event.tick).padStart(5, " ")}]</Text> {event.message}
          </Text>
        ))}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>Total events: {state.events.length} | [p]ause [d]ebug [q]uit</Text>
      </Box>
    </Box>
  );

  // Units modal view
  const UnitsView = () => (
    <Box flexDirection="column" width={80} height={30}>
      <ModalHeader title="UNITS" />
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1} height={26} overflowY="hidden">
        <Text bold color="cyan">Dwarf Roster ({aliveDwarves}/{totalDwarves} alive)</Text>
        <Text dimColor>Name          Labor      Pos    Task           H/T/E</Text>
        <Text dimColor>────────────────────────────────────────────────────────</Text>
        {state.dwarves.slice(0, 20).map((dwarf) => {
          const dwarfColor = dwarf.alive
            ? getDwarfColor(dwarf.id, settings.colorMode)
            : "red";
          const name = dwarf.name.padEnd(14, " ").slice(0, 14);
          const labor = dwarf.labor.padEnd(10, " ").slice(0, 10);
          const pos = `${dwarf.x},${dwarf.y}`.padEnd(6, " ");
          const task = (dwarf.currentTask || (dwarf.alive ? "idle" : "DEAD")).padEnd(14, " ").slice(0, 14);
          const hte = `${Math.round(dwarf.hunger)}/${Math.round(dwarf.thirst)}/${Math.round(dwarf.energy)}`;
          return (
            <Text key={dwarf.id} color={dwarfColor}>
              {name} {labor} {pos} {task} {hte}
              {dwarf.moodState && dwarf.moodState !== "normal" && <Text color="magenta"> [{dwarf.moodState}]</Text>}
              {dwarf.isLegendary && <Text color="yellow"> ★</Text>}
            </Text>
          );
        })}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>H=hunger T=thirst E=energy (0-100) | [p]ause [d]ebug [q]uit</Text>
      </Box>
    </Box>
  );

  // Stocks modal view
  const StocksView = () => {
    const r = state.resources;
    const maxBar = 30;
    const makeBar = (value: number, max: number, color: string) => {
      const filled = Math.min(Math.round((value / max) * maxBar), maxBar);
      const empty = maxBar - filled;
      return (
        <>
          <Text color={color}>{"█".repeat(filled)}</Text>
          <Text dimColor>{"░".repeat(empty)}</Text>
        </>
      );
    };

    return (
      <Box flexDirection="column" width={80} height={30}>
        <ModalHeader title="STOCKS" />
        <Box borderStyle="single" borderColor="blue" flexDirection="column" paddingX={1} height={26} overflowY="hidden">
          <Text bold color="blue">Resources</Text>
          <Text>Wood:  {makeBar(r.wood, 100, "green")} {r.wood}</Text>
          <Text>Stone: {makeBar(r.stone, 100, "white")} {r.stone}</Text>
          <Text>Food:  {makeBar(r.food, 100, getResourceColor(r.food, "food"))} {r.food}</Text>
          <Text>Drink: {makeBar(r.drink, 100, getResourceColor(r.drink, "drink"))} {r.drink}</Text>
          <Text> </Text>
          <Text bold color="blue">Buildings ({state.buildings.length})</Text>
          {state.buildings.slice(0, 8).map((b, i) => (
            <Text key={i} color="magenta">
              • {b.type}{b.subtype ? ` (${b.subtype})` : ""} at {b.x},{b.y}
              {b.built ? "" : <Text color="yellow"> [building]</Text>}
            </Text>
          ))}
          {state.buildings.length > 8 && <Text dimColor>  ...and {state.buildings.length - 8} more</Text>}
          <Text> </Text>
          <Text bold color="blue">Statistics</Text>
          <Text>Wealth: <Text color={getWealthColor(state.wealth || 0)}>{state.wealth || 0}</Text></Text>
          <Text>Peak Pop: {state.statistics.peakPopulation} | Artifacts: {state.statistics.artifactsCreated}</Text>
          <Text>Moods: {state.statistics.moodsSucceeded}/{state.statistics.moodsTriggered} succeeded</Text>
        </Box>
        <Box paddingX={1}>
          <Text dimColor>[p]ause [d]ebug [q]uit</Text>
        </Box>
      </Box>
    );
  };

  // Buildings modal view
  const BuildingsView = () => (
    <Box flexDirection="column" width={80} height={30}>
      <ModalHeader title="BUILDINGS" />
      <Box borderStyle="single" borderColor="magenta" flexDirection="column" paddingX={1} height={26} overflowY="hidden">
        <Text bold color="magenta">Structures ({state.buildings.length})</Text>
        <Text dimColor>Type          Subtype    Pos    Status</Text>
        <Text dimColor>──────────────────────────────────────────</Text>
        {state.buildings.length === 0 && <Text dimColor>No buildings constructed yet</Text>}
        {state.buildings.slice(0, 20).map((b, i) => {
          const type = b.type.padEnd(14, " ").slice(0, 14);
          const subtype = (b.subtype || "-").padEnd(10, " ").slice(0, 10);
          const pos = `${b.x},${b.y}`.padEnd(6, " ");
          const status = b.built ? (b.autoQueue ? "producing" : "idle") : "building";
          return (
            <Text key={i} color="magenta">
              {type} {subtype} {pos} {status}
              {b.claimedByDwarfId !== undefined && <Text color="yellow"> [claimed]</Text>}
            </Text>
          );
        })}
        {state.buildings.length > 20 && <Text dimColor>  ...and {state.buildings.length - 20} more</Text>}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>Workshop types: still, carpenter, smelter | [p]ause [d]ebug [q]uit</Text>
      </Box>
    </Box>
  );

  // Show loading screen if still loading save
  if (isLoading) {
    return (
      <Box flexDirection="column" width={80} height={30} alignItems="center" justifyContent="center">
        <Text>Loading fortress "{fortressName}"...</Text>
      </Box>
    );
  }

  // Show error if load failed
  if (loadError) {
    return (
      <Box flexDirection="column" width={80} height={30} alignItems="center" justifyContent="center">
        <Text color="red">Error: {loadError}</Text>
        <Text dimColor>Starting new fortress instead...</Text>
      </Box>
    );
  }

  // Show fortress fallen screen
  if (state.fallen) {
    const s = state.statistics;
    return (
      <Box flexDirection="column" width={80} height={30} alignItems="center" justifyContent="center">
        <Box borderStyle="double" borderColor="red" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="red">YOUR FORTRESS HAS CRUMBLED...</Text>
          <Text> </Text>
          <Text>"{fortressName}" has fallen.</Text>
          <Text> </Text>
          <Text>Survived: Year {state.year}, {state.season}</Text>
          <Text>Peak Population: {s.peakPopulation}</Text>
          <Text>Total Deaths: {s.deaths}</Text>
          <Text dimColor>  Starvation: {s.deathsByStarvation}</Text>
          <Text dimColor>  Dehydration: {s.deathsByDehydration}</Text>
          <Text dimColor>  Insanity: {s.deathsByInsanity}</Text>
          <Text dimColor>  Berserk: {s.deathsByBerserk}</Text>
          <Text>Artifacts Created: {s.artifactsCreated || 0}</Text>
          <Text> </Text>
          <Text dimColor>Press 'q' to close...</Text>
        </Box>
      </Box>
    );
  }

  // Menu view (ESC menu - DF style)
  const MenuView = () => (
    <Box flexDirection="column" width={80} height={30} alignItems="center" justifyContent="center">
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={4}
        paddingY={1}
        flexDirection="column"
      >
        <Text bold color="cyan">MENU</Text>
        <Text> </Text>
        {menuItems.map((item, i) => (
          <Text key={item} color={i === menuSelection ? "cyan" : "white"}>
            {i === menuSelection ? "> " : "  "}
            {i + 1}. {item}
          </Text>
        ))}
        <Text> </Text>
        <Text dimColor>Arrow keys to select, Enter to confirm, ESC to resume</Text>
      </Box>
    </Box>
  );

  // Settings view
  const SettingsView = () => (
    <Box flexDirection="column" width={80} height={30} alignItems="center" justifyContent="center">
      <Box
        borderStyle="double"
        borderColor="yellow"
        paddingX={4}
        paddingY={1}
        flexDirection="column"
      >
        <Text bold color="yellow">SETTINGS</Text>
        <Text> </Text>
        <Text>
          Color Mode:{" "}
          <Text color={settings.colorMode === "full" ? "cyan" : "gray"}>
            {settings.colorMode === "full" ? "[Full Color]" : " Full Color "}
          </Text>
          {" / "}
          <Text color={settings.colorMode === "theme" ? "cyan" : "gray"}>
            {settings.colorMode === "theme" ? "[Theme]" : " Theme "}
          </Text>
        </Text>
        <Text> </Text>
        <Text dimColor>
          Full Color: Consistent hex colors across all terminals
        </Text>
        <Text dimColor>
          Theme: Uses terminal ANSI colors (respects your theme)
        </Text>
        <Text> </Text>
        <Text dimColor>Left/Right or Enter to toggle, ESC to go back</Text>
      </Box>
    </Box>
  );

  // Render modal views if active
  if (viewMode === "menu") return <MenuView />;
  if (viewMode === "settings") return <SettingsView />;
  if (viewMode === "announcements") return <AnnouncementsView />;
  if (viewMode === "units") return <UnitsView />;
  if (viewMode === "buildings") return <BuildingsView />;
  if (viewMode === "stocks") return <StocksView />;

  // Main view
  return (
    <Box flexDirection="column" width={80}>
      {/* Header with background */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          {fortressName}
        </Text>
        <Text bold color="cyan">
          {" "}- Year {state.year}, {state.season}
          {state.paused && <Text color="yellow"> [PAUSED]</Text>}
        </Text>
        <Spacer />
        <Text dimColor>v{PLUGIN_VERSION}</Text>
      </Box>

      {/* Resources */}
      <Box paddingX={1}>
        <Text>
          Wood: <Text color={getResourceColor(state.resources.wood, "wood")}>{state.resources.wood}</Text>
          {"  "}
          Stone: <Text color={getResourceColor(state.resources.stone, "stone")}>{state.resources.stone}</Text>
          {"  "}
          Food: <Text color={getResourceColor(state.resources.food, "food")}>{state.resources.food}</Text>
          {"  "}
          Drink: <Text color={getResourceColor(state.resources.drink, "drink")}>{state.resources.drink}</Text>
          {"  "}
          Jobs: <Text color={state.jobs.length > 0 ? "magenta" : "gray"}>{state.jobs.length}</Text>
          {"  "}
          Wealth: <Text color={getWealthColor(state.wealth || 0)}>{state.wealth || 0}</Text>
        </Text>
      </Box>

      {/* Dwarf Status */}
      <Box paddingX={1}>
        <Text>
          Dwarves: <Text color={aliveDwarves > 0 ? "white" : "red"}>{aliveDwarves}/{totalDwarves}</Text>
          {"  "}
          {deaths > 0 && <><Text color="red">Deaths: {deaths}</Text>{"  "}</>}
          Happiness: <Text color={getHappinessColor(avgHappiness)}>
            {mood}
          </Text>
          {"  "}
          Tick: <Text dimColor>{state.tick}</Text>
        </Text>
      </Box>

      {/* Main content - Map and Sidebar */}
      <Box flexDirection="row" justifyContent="space-between" height={22}>
        {/* Map View with alternating row shading */}
        <Box
          borderStyle="single"
          borderColor="white"
          flexDirection="column"
          paddingX={1}
        >
          {mapLines.map((line, i) => (
            <Text key={i} dimColor={i % 2 === 0}>
              {line}
            </Text>
          ))}
        </Box>

        {/* Sidebar - Keys and Legend */}
        <Box
          borderStyle="single"
          borderColor="cyan"
          flexDirection="column"
          paddingX={1}
          width={30}
        >
          {/* Key Hints */}
          <Text bold color="cyan">KEYS</Text>
          <Text dimColor>[a] announcements</Text>
          <Text dimColor>[u] units  [b] buildings</Text>
          <Text dimColor>[z] stocks [p] pause</Text>
          <Text dimColor>[s] save   [d] debug</Text>
          <Text dimColor>[q] quit   [ESC] menu</Text>
          {config?.save && <Text color="green">Auto-save: ON</Text>}
          {debugMode && <Text color="yellow">Debug: ON</Text>}
          <Text> </Text>
          {/* Legend */}
          <Text bold color="cyan">LEGEND</Text>
          <Text><Text color="cyan">☺</Text><Text color="yellow">○</Text><Text color="red">☹</Text>=Dwarf <Text color="gray">#</Text>=Rock</Text>
          <Text><Text color="green">♣</Text>=Tree <Text color="cyan">~</Text>=Water</Text>
          <Text><Text color="magenta">X</Text>=Workshop <Text color="green">%</Text>=Farm</Text>
          <Text><Text color="red">†</Text>=Corpse <Text color="gray" backgroundColor="#3d3d00">#</Text>=Dig</Text>
        </Box>
      </Box>

      {/* Events at bottom */}
      <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
        {recentEvents.map((event) => (
          <Text key={event.id} color={EVENT_COLORS[event.type] ?? "white"}>
            • {event.message}
          </Text>
        ))}
        {recentEvents.length === 0 && <Text dimColor>No recent events</Text>}
      </Box>
    </Box>
  );
}
