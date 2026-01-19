import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { getAllSaveMetadata, deleteSave } from "../lib/fortress-sim/save";
import type { SaveMetadata } from "../lib/fortress-sim/save";
import { createIPCServer } from "../ipc/server";

interface Props {
  id: string;
  socketPath?: string;
}

type PickerResult =
  | { type: "selected"; name: string }
  | { type: "cancelled" }
  | { type: "deleted"; name: string };

export function SavePickerCanvas({ id, socketPath }: Props) {
  const { exit } = useApp();
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Ref for IPC server to broadcast results
  const ipcServerRef = useRef<any>(null);

  // Broadcast result and exit
  const sendResult = (result: PickerResult) => {
    if (ipcServerRef.current) {
      ipcServerRef.current.broadcast({ type: "pickerResult", result });
    }
    // Give IPC time to send before exiting - increased delay for reliability
    setTimeout(() => exit(), 500);
  };

  // Load saves on mount
  useEffect(() => {
    async function loadSaves() {
      const metadata = await getAllSaveMetadata();
      setSaves(metadata);
      setIsLoading(false);
    }
    loadSaves();
  }, []);

  // Set up IPC server (only once on mount)
  useEffect(() => {
    if (!socketPath) return;

    async function setupIPC() {
      try {
        ipcServerRef.current = await createIPCServer({
          socketPath: socketPath!,
          onMessage: (msg) => {
            // Handle close request from MCP server
            if (msg.type === "close") {
              sendResult({ type: "cancelled" });
            }
          },
          onClientConnect: () => {},
          onError: () => {},
        });

        // Send ready message
        ipcServerRef.current.broadcast({ type: "ready", scenario: "save-picker" });
      } catch (error) {
        // IPC setup failed, but we can still work standalone
      }
    }

    setupIPC();

    return () => {
      ipcServerRef.current?.close();
    };
  }, [socketPath]);

  // Handle keyboard input
  useInput((input, key) => {
    // If in delete confirmation mode
    if (deleteConfirm !== null) {
      if (input.toLowerCase() === "y") {
        // Confirm delete
        const nameToDelete = deleteConfirm;
        setDeleteConfirm(null);
        deleteSave(nameToDelete).then((success) => {
          if (success) {
            // Remove from list
            setSaves((prev) => {
              const newSaves = prev.filter((s) => s.name !== nameToDelete);
              // Adjust selected index if needed
              if (selectedIndex >= newSaves.length && newSaves.length > 0) {
                setSelectedIndex(newSaves.length - 1);
              }
              return newSaves;
            });
            // Broadcast deletion event
            if (ipcServerRef.current) {
              ipcServerRef.current.broadcast({
                type: "pickerResult",
                result: { type: "deleted", name: nameToDelete },
              });
            }
          }
        });
        return;
      } else if (input.toLowerCase() === "n" || key.escape) {
        setDeleteConfirm(null);
        return;
      }
      return; // Ignore other keys during confirmation
    }

    // ESC or Q to cancel
    if (key.escape || input === "q") {
      sendResult({ type: "cancelled" });
      return;
    }

    // Arrow up / k
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    // Arrow down / j
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(saves.length - 1, prev + 1));
      return;
    }

    // Enter to select
    if (key.return) {
      if (saves.length > 0 && saves[selectedIndex]) {
        sendResult({ type: "selected", name: saves[selectedIndex].name });
      }
      return;
    }

    // D to delete
    if (input === "d" || input === "D") {
      if (saves.length > 0 && saves[selectedIndex]) {
        setDeleteConfirm(saves[selectedIndex].name);
      }
      return;
    }
  });

  // Format date for display
  const formatDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Loading screen
  if (isLoading) {
    return (
      <Box flexDirection="column" width={60} height={20} alignItems="center" justifyContent="center">
        <Text>Loading fortress archives...</Text>
      </Box>
    );
  }

  // No saves screen
  if (saves.length === 0) {
    return (
      <Box flexDirection="column" width={60} height={20} alignItems="center" justifyContent="center">
        <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="yellow">FORTRESS ARCHIVES</Text>
          <Text> </Text>
          <Text dimColor>No saved fortresses found.</Text>
          <Text dimColor>Use /embark to start a new fortress!</Text>
          <Text> </Text>
          <Text dimColor>[Q] to close</Text>
        </Box>
      </Box>
    );
  }

  // Delete confirmation dialog
  if (deleteConfirm !== null) {
    return (
      <Box flexDirection="column" width={60} height={20} alignItems="center" justifyContent="center">
        <Box borderStyle="double" borderColor="red" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="red">DELETE FORTRESS?</Text>
          <Text> </Text>
          <Text>Are you sure you want to delete</Text>
          <Text bold color="cyan">"{deleteConfirm}"</Text>
          <Text dimColor>This cannot be undone!</Text>
          <Text> </Text>
          <Text>[Y] Delete  [N] Cancel</Text>
        </Box>
      </Box>
    );
  }

  // Calculate scrolling window
  const VISIBLE_COUNT = 12;
  let scrollOffset = 0;
  if (selectedIndex >= VISIBLE_COUNT) {
    // Keep selected item visible, with some padding at bottom
    scrollOffset = selectedIndex - VISIBLE_COUNT + 1;
  }
  const visibleSaves = saves.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + VISIBLE_COUNT < saves.length;

  // Main picker view
  return (
    <Box flexDirection="column" width={70}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">FORTRESS ARCHIVES</Text>
        <Text dimColor> - {saves.length} save{saves.length !== 1 ? "s" : ""} found</Text>
      </Box>

      <Box borderStyle="single" borderColor="white" flexDirection="column" paddingX={1} height={16} overflowY="hidden">
        <Text dimColor>
          {"  "}Name              Year    Pop   Status        Saved
        </Text>
        <Text dimColor>{"─".repeat(66)}</Text>

        {hasMoreAbove && (
          <Text dimColor>  ... {scrollOffset} more above ...</Text>
        )}

        {visibleSaves.map((save, index) => {
          const actualIndex = scrollOffset + index;
          const isSelected = actualIndex === selectedIndex;
          const cursor = isSelected ? ">" : " ";
          const name = save.name.padEnd(18).slice(0, 18);
          const year = `Y${save.year}`.padEnd(7);
          const pop = `${save.aliveCount}/${save.population}`.padEnd(5);
          const status = (save.fallen ? "FALLEN" : "Active").padEnd(13);
          const saved = formatDate(save.savedAt).padEnd(12);

          return (
            <Text
              key={save.name}
              color={isSelected ? "cyan" : save.fallen ? "red" : "white"}
              bold={isSelected}
              inverse={isSelected}
            >
              {cursor} {name} {year} {pop} {status} {saved}
            </Text>
          );
        })}

        {hasMoreBelow && (
          <Text dimColor>  ... {saves.length - scrollOffset - VISIBLE_COUNT} more below ...</Text>
        )}
      </Box>

      <Box paddingX={1} flexDirection="column">
        <Text dimColor>
          [↑/↓] Navigate  [Enter] Resume  [D] Delete  [Q/Esc] Cancel
        </Text>
      </Box>
    </Box>
  );
}
