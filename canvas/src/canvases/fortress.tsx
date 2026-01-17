import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type {
  FortressConfig,
  FortressState,
  FortressCommand,
  FortressSummary,
} from "../scenarios/fortress/types";
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
          const loadedState = await loadFortress(fortressName);
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
            console.log(`Loaded fortress "${fortressName}" from save`);
          } else {
            console.log(`No save found for "${fortressName}", starting new`);
          }
        } catch (error) {
          console.error("Error loading save:", error);
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
          socketPath,
          onMessage: (msg: ControllerMessage) => {
            if (msg.type === "command") {
              const command = msg.command as FortressCommand;
              setState((prevState) => {
                const newState = { ...prevState };
                const success = handleCommand(newState, command);
                if (!success) {
                  console.log(`Command failed: ${JSON.stringify(command)}`);
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
            console.log(`Claude connected to fortress ${id}`);
          },
          onError: (error) => {
            console.error(`IPC error: ${error.message}`);
          },
        });

        // Send ready message
        ipcServer.broadcast({ type: "ready", scenario: "fortress-simulation" });
        console.log(`Fortress IPC server listening on ${socketPath}`);
      } catch (error) {
        console.error(`Failed to create IPC server: ${error}`);
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
          await saveFortress(fortressName, state);
        } catch (error) {
          console.error("Auto-save failed:", error);
        }
      }
    }

    autoSave();
  }, [state.tick, isLoading]);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      // Save before exit if save is enabled
      if (config?.save) {
        saveFortress(fortressName, state).catch(console.error);
      }
      exit();
    }

    if (input === "p") {
      setState((prevState) => ({
        ...prevState,
        paused: !prevState.paused,
      }));
    }

    if (input === "s") {
      // Manual save
      saveFortress(fortressName, state)
        .then(() => console.log("Manual save complete"))
        .catch(console.error);
    }
  });

  // Calculate derived values
  const avgHappiness = getAverageHappiness(state.dwarves);
  const mood = getDwarfMood(avgHappiness);
  const aliveDwarves = getLivingDwarfCount(state.dwarves);
  const totalDwarves = state.dwarves.length;
  const deaths = state.statistics?.deaths || 0;

  // Dwarf colors - each dwarf gets their own color
  const dwarfColors = ["cyan", "magenta", "yellow", "green", "blue", "red", "white"];

  // Render map with colors
  const renderMap = () => {
    const lines: React.ReactNode[] = [];

    for (let y = 0; y < state.map.length; y++) {
      const chars: React.ReactNode[] = [];

      for (let x = 0; x < state.map[y]?.length || 0; x++) {
        const tile = state.map[y]?.[x];
        if (!tile) continue;

        // Check if there's a dwarf at this position
        const dwarfHere = state.dwarves.find((d) => d.x === x && d.y === y);

        // Check if there's a dig designation here
        const digJob = state.jobs.find((j) => j.type === "dig" && j.x === x && j.y === y);

        let char = getTileChar(tile);
        let color = "white";

        if (dwarfHere) {
          if (!dwarfHere.alive) {
            // Dead dwarf = corpse
            char = "†";
            color = "red";
          } else {
            // Each dwarf gets their own color based on ID
            color = dwarfColors[dwarfHere.id % dwarfColors.length];
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
          char = "d";
          color = "yellow"; // Designated for digging
        } else {
          // Color tiles by type
          switch (tile?.type) {
            case "wall":
              color = tile.resource === "gold" ? "yellow" :
                      tile.resource === "iron" ? "white" :
                      tile.resource === "copper" ? "magenta" : "gray";
              break;
            case "floor":
              color = "white";
              break;
            case "water":
              color = "cyan"; // Brighter water
              break;
            case "tree":
              color = "green";
              break;
            case "workshop":
              color = "magenta";
              break;
            case "stockpile":
              color = "blue";
              break;
            case "bed":
              color = "yellow";
              break;
            case "farm":
              color = "green";
              break;
            default:
              color = "white";
          }
        }

        chars.push(<Text key={`${y}-${x}`} color={color}>{char}</Text>);
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

  return (
    <Box flexDirection="column" width={80} height={30}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          FORTRESS: "{fortressName}" - Year {state.year}, {state.season}
          {state.paused && <Text color="yellow"> [PAUSED]</Text>}
        </Text>
      </Box>

      {/* Resources */}
      <Box paddingX={1} marginY={0}>
        <Text>
          Wood: <Text color={state.resources.wood > 50 ? "green" : state.resources.wood > 20 ? "yellow" : "red"}>{state.resources.wood}</Text>
          {"  "}
          Stone: <Text color={state.resources.stone > 50 ? "white" : state.resources.stone > 20 ? "yellow" : "red"}>{state.resources.stone}</Text>
          {"  "}
          Food: <Text color={state.resources.food > 50 ? "green" : state.resources.food > 20 ? "yellow" : "red"}>{state.resources.food}</Text>
          {"  "}
          Drink: <Text color={state.resources.drink > 50 ? "cyan" : state.resources.drink > 20 ? "yellow" : "red"}>{state.resources.drink}</Text>
          {"  "}
          Jobs: <Text color={state.jobs.length > 0 ? "magenta" : "gray"}>{state.jobs.length}</Text>
          {"  "}
          Wealth: <Text color={
            state.wealth >= 600 ? "green" :
            state.wealth >= 300 ? "white" :
            state.wealth >= 100 ? "yellow" : "red"
          }>{state.wealth || 0}</Text>
        </Text>
      </Box>

      {/* Dwarf Status */}
      <Box paddingX={1} marginBottom={1}>
        <Text>
          Dwarves: <Text color={aliveDwarves > 0 ? "white" : "red"}>{aliveDwarves}/{totalDwarves}</Text>
          {"  "}
          {deaths > 0 && <><Text color="red">Deaths: {deaths}</Text>{"  "}</>}
          Happiness: <Text color={avgHappiness > 60 ? "green" : avgHappiness > 30 ? "yellow" : "red"}>
            {mood}
          </Text>
          {"  "}
          Tick: <Text dimColor>{state.tick}</Text>
        </Text>
      </Box>

      {/* Main content - Map and Legend side by side */}
      <Box flexDirection="row">
        {/* Map View */}
        <Box
          borderStyle="single"
          borderColor="white"
          flexDirection="column"
          paddingX={1}
          height={22}
        >
          {mapLines.map((line, i) => (
            <Text key={i} dimColor={i % 2 === 0}>
              {line}
            </Text>
          ))}
        </Box>

        {/* Legend - Fixed height to prevent bouncing */}
        <Box
          borderStyle="single"
          borderColor="cyan"
          flexDirection="column"
          paddingX={1}
          marginLeft={1}
          height={22}
          width={30}
        >
          <Text bold color="cyan">MAP</Text>
          <Text><Text color="cyan">☺</Text>=Happy <Text color="gray">#</Text>=Wall</Text>
          <Text><Text color="yellow">○</Text>=Meh   <Text color="white">.</Text>=Floor</Text>
          <Text><Text color="red">☹</Text>=Sad   <Text color="cyan">~</Text>=Water</Text>
          <Text><Text color="green">^</Text>=Tree  <Text color="magenta">X</Text>=Workshop</Text>
          <Text><Text color="red">†</Text>=Corpse <Text color="green">%</Text>=Farm</Text>
          <Text><Text color="magenta">M</Text>=Mood  <Text color="yellow">d</Text>=Dig job</Text>
          <Text> </Text>
          <Text bold color="cyan">KEYS</Text>
          <Text dimColor>p=pause s=save</Text>
          <Text dimColor>q=quit</Text>
          <Text> </Text>
          <Text bold color="cyan">WORKERS</Text>
          <Text>Jobs: <Text color={state.jobs.length > 0 ? "magenta" : "gray"}>{state.jobs.length}</Text></Text>
          {/* Fixed 5 lines for workers - prevents bouncing */}
          {Array.from({ length: 5 }).map((_, i) => {
            const worker = state.dwarves.filter(d => d.currentJob)[i];
            const workerColor = worker ? dwarfColors[worker.id % dwarfColors.length] : "gray";
            return (
              <Text key={i} color={workerColor}>
                {worker ? `${worker.name.split(' ')[0]}` : ' '}
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* Recent Events */}
      <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
        <Text bold>RECENT EVENTS:</Text>
        {recentEvents.map((event) => (
          <Text
            key={event.id}
            color={
              event.type === "success"
                ? "green"
                : event.type === "warning"
                ? "yellow"
                : event.type === "danger"
                ? "red"
                : "white"
            }
          >
            • {event.message}
          </Text>
        ))}
      </Box>

      {/* Footer */}
      <Box paddingX={1} marginTop={0}>
        <Text dimColor>
          Press 'p' to pause, 's' to save, 'q' to quit
          {config?.save && <Text color="green"> [Auto-save: ON]</Text>}
        </Text>
      </Box>
    </Box>
  );
}
