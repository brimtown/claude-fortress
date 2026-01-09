import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type {
  FortressConfig,
  FortressState,
  FortressCommand,
} from "../scenarios/fortress/types";
import { createInitialState, processTick, handleCommand } from "../lib/fortress-sim/engine";
import { getTileChar } from "../lib/fortress-sim/map";
import { getAverageHappiness, getDwarfMood } from "../lib/fortress-sim/dwarf";
import { saveFortress, loadFortress } from "../lib/fortress-sim/save";
import { restoreEventIdCounter } from "../lib/fortress-sim/events";
import { createIPCServer } from "../ipc/server";
import type { ControllerMessage } from "../ipc/types";

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
              if (ipcServer) {
                ipcServer.broadcast({ type: "state", data: state });
              }
            } else if (msg.type === "getSummary") {
              // Send lightweight summary (no map data, minimal tokens)
              if (ipcServer) {
                const summary = {
                  tick: state.tick,
                  year: state.year,
                  season: state.season,
                  paused: state.paused,
                  resources: state.resources,
                  dwarfCount: state.dwarves.length,
                  activeJobs: state.jobs.length,
                  recentEvents: state.events.slice(-3), // Last 3 events only for token efficiency
                };
                ipcServer.broadcast({ type: "state", data: summary });
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
  const aliveDwarves = state.dwarves.length;

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
          // Each dwarf gets their own color based on ID
          color = dwarfColors[dwarfHere.id % dwarfColors.length];
          // Face shows mood
          if (dwarfHere.happiness < 30) {
            char = "☹"; // Sad face
          } else if (dwarfHere.happiness > 70) {
            char = "☺"; // Happy face
          } else {
            char = "○"; // Neutral face
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
        </Text>
      </Box>

      {/* Dwarf Status */}
      <Box paddingX={1} marginBottom={1}>
        <Text>
          Dwarves: <Text color="white">{aliveDwarves}/7</Text>
          {"  "}
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
          <Text color="yellow">d=Dig job</Text>
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
