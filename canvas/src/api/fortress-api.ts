import type {
  FortressConfig,
  FortressCommand,
  FortressState,
  FortressSummary,
} from "../scenarios/fortress/types";
import type { SpawnOptions } from "./canvas-api";
import { spawnCanvas } from "../terminal";
import { connectToController } from "../ipc/client";
import { getSocketPath } from "../ipc/types";

/**
 * Spawn a fortress in a tmux side panel
 *
 * @param config Fortress configuration
 * @param options Spawn options (timeout, etc.)
 * @returns Socket path for IPC communication
 */
export async function spawnFortress(
  config: FortressConfig = {}
): Promise<string> {
  const id = `fortress-${Date.now()}`;
  const socketPath = getSocketPath(id);

  await spawnCanvas("fortress", id, JSON.stringify(config), {
    socketPath,
    scenario: "fortress-simulation",
  });

  // Wait for socket to be ready (fortress canvas creates it)
  await new Promise(resolve => setTimeout(resolve, 2000));

  return socketPath;
}

/**
 * Send a command to the fortress
 *
 * @param socketPath IPC socket path
 * @param command Fortress command
 */
export async function sendFortressCommand(
  socketPath: string,
  command: FortressCommand
): Promise<void> {
  const client = await connectToController({
    socketPath,
    onMessage: () => {}, // No-op for command-only
    onDisconnect: () => {},
  });

  try {
    client.send({
      type: "command",
      command,
    } as any);
  } finally {
    client.close();
  }
}

/**
 * Query lightweight fortress summary (token-efficient)
 *
 * @param socketPath IPC socket path
 * @returns Fortress summary (~200 tokens)
 */
export async function getFortressSummary(
  socketPath: string
): Promise<FortressSummary> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for fortress summary"));
    }, 5000);

    const client = await connectToController({
      socketPath,
      onMessage: (msg: any) => {
        if (msg.type === "state") {
          clearTimeout(timeout);
          client.close();
          resolve(msg.data as FortressSummary);
        }
      },
      onDisconnect: () => {},
    });

    // Send query
    client.send({ type: "getSummary" } as any);
  });
}

/**
 * Query full fortress state (includes map, ~2000 tokens)
 *
 * @param socketPath IPC socket path
 * @returns Complete fortress state
 */
export async function getFortressState(
  socketPath: string
): Promise<FortressState> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for fortress state"));
    }, 5000);

    const client = await connectToController({
      socketPath,
      onMessage: (msg: any) => {
        if (msg.type === "state") {
          clearTimeout(timeout);
          client.close();
          resolve(msg.data as FortressState);
        }
      },
      onDisconnect: () => {},
    });

    // Send query
    client.send({ type: "getState" } as any);
  });
}

/**
 * Close the fortress
 *
 * @param socketPath IPC socket path
 */
export async function closeFortress(socketPath: string): Promise<void> {
  const client = await connectToController({
    socketPath,
    onMessage: () => {},
    onDisconnect: () => {},
  });

  client.send({ type: "close" } as any);
  client.close();
}

/**
 * Convenience function to query dwarves list
 *
 * @param socketPath IPC socket path
 * @returns Dwarf details
 */
export async function getFortressDwarves(socketPath: string) {
  const state = await getFortressState(socketPath);
  return state.dwarves;
}

/**
 * Convenience function to query jobs list
 *
 * @param socketPath IPC socket path
 * @returns Job queue
 */
export async function getFortressJobs(socketPath: string) {
  const state = await getFortressState(socketPath);
  return state.jobs;
}
