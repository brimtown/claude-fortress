#!/usr/bin/env bun
/**
 * MCP Server for Claude Fortress
 *
 * Exposes fortress tools as MCP tools, eliminating the need for
 * bash commands and reducing permission prompts.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnCanvas } from "./terminal";
import { getSocketPath } from "./ipc/types";
import type { FortressCommand, Labor } from "./scenarios/fortress/types";
import { hasSave } from "./lib/fortress-sim/save";

// Helper to send IPC message and get response
async function sendIPC(
  socketPath: string,
  message: Record<string, unknown>,
  timeoutMs = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Timeout waiting for response (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    Bun.connect({
      unix: socketPath,
      socket: {
        data(socket, data) {
          if (resolved) return;
          clearTimeout(timeout);
          resolved = true;
          try {
            const response = JSON.parse(data.toString().trim());
            resolve(response);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data.toString()}`));
          }
          socket.end();
        },
        open(socket) {
          socket.write(JSON.stringify(message) + "\n");
        },
        close() {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error("Connection closed before response"));
          }
        },
        error(socket, error) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(error);
          }
        },
      },
    });
  });
}

// Helper to send command without waiting for response
async function sendCommand(
  socketPath: string,
  command: FortressCommand
): Promise<void> {
  return new Promise((resolve, reject) => {
    Bun.connect({
      unix: socketPath,
      socket: {
        data() {},
        open(socket) {
          socket.write(JSON.stringify({ type: "command", command }) + "\n");
          setTimeout(() => {
            socket.end();
            resolve();
          }, 100);
        },
        close() {},
        error(socket, error) {
          reject(error);
        },
      },
    }).catch(reject);
  });
}

// Check if fortress instance exists by trying to connect to socket
async function fortressExists(instance: string): Promise<boolean> {
  const socketPath = getSocketPath(instance);
  try {
    // Use fs.stat to check for socket file (Bun.file doesn't work for sockets)
    const fs = await import("fs/promises");
    const stat = await fs.stat(socketPath);
    return stat.isSocket();
  } catch {
    return false;
  }
}

// Create the MCP server
const server = new Server(
  {
    name: "cli",
    version: "0.3.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "embark",
        description:
          "Start a new fortress. Spawns an ASCII fortress simulation in a tmux window. Returns the instance ID to use with other commands.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description:
                'Fortress name (optional - auto-generates names like "Ironforge", "Copperdeep" if not provided)',
            },
            instance: {
              type: "string",
              description:
                'Instance ID for this fortress (default: auto-generated like "fortress-1", "fortress-2"). Use different IDs to run multiple fortresses in parallel.',
            },
            save: {
              type: "boolean",
              description: "Enable autosave (default: true)",
              default: true,
            },
          },
        },
      },
      {
        name: "query",
        description:
          "Get the current fortress state. Returns a markdown summary of resources, dwarves, jobs, and recent events.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
          },
        },
      },
      {
        name: "dig",
        description:
          "Designate an area for mining. Dwarves with mining labor will excavate the tiles.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
            x: {
              type: "number",
              description: "Starting X coordinate (0-39)",
            },
            y: {
              type: "number",
              description: "Starting Y coordinate (0-19)",
            },
            width: {
              type: "number",
              description: "Width of area to dig",
            },
            height: {
              type: "number",
              description: "Height of area to dig",
            },
          },
          required: ["x", "y", "width", "height"],
        },
      },
      {
        name: "build",
        description:
          "Place a building or structure. Requires dug-out floor tiles.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
            structure: {
              type: "string",
              enum: ["workshop", "stockpile", "bed", "farm"],
              description: "Type of structure to build",
            },
            x: {
              type: "number",
              description: "X coordinate for placement",
            },
            y: {
              type: "number",
              description: "Y coordinate for placement",
            },
            subtype: {
              type: "string",
              enum: ["still", "carpenter", "smelter", "food", "wood", "stone"],
              description:
                "Subtype for workshops (still, carpenter, smelter) or stockpiles (food, wood, stone)",
            },
          },
          required: ["structure", "x", "y"],
        },
      },
      {
        name: "assign",
        description: "Assign a dwarf to a labor type.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
            dwarf_id: {
              type: "number",
              description: "ID of the dwarf to reassign",
            },
            labor: {
              type: "string",
              enum: ["mining", "carpentry", "brewing", "farming", "hauling"],
              description: "Labor type to assign",
            },
          },
          required: ["dwarf_id", "labor"],
        },
      },
      {
        name: "pause",
        description: "Pause or unpause the fortress simulation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
            paused: {
              type: "boolean",
              description: "True to pause, false to unpause",
            },
          },
          required: ["paused"],
        },
      },
      {
        name: "save",
        description: "Manually save the fortress state to disk.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
          },
        },
      },
      {
        name: "screenshot",
        description:
          "Capture a visual screenshot of the fortress map. Returns a PNG image showing the full map with dwarves, buildings, dig designations, resources, and a legend. Use this to see the spatial layout of your fortress.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description: 'Fortress instance ID (returned by embark, default: "fortress-1")',
              default: "fortress-1",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "embark": {
        let fortressName = args?.name as string | undefined;
        const save = args?.save !== false;
        const fs = await import("fs/promises");

        // Auto-generate fortress name if not provided
        if (!fortressName) {
          const prefixes = ["Copper", "Iron", "Gold", "Silver", "Bronze", "Steel", "Mithril", "Amber", "Jade", "Onyx"];
          const suffixes = ["gleam", "peak", "halls", "forge", "deep", "hold", "spire", "gate", "haven", "ward"];
          const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
          const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
          fortressName = `${prefix}${suffix}`;
        }

        // Check for existing save - add random suffix if collision
        if (save && hasSave(fortressName)) {
          const suffix = Math.random().toString(36).substring(2, 6);
          fortressName = `${fortressName}-${suffix}`;
        }

        // Generate or use provided instance ID
        let instance = args?.instance as string | undefined;
        if (!instance) {
          // Auto-generate: find first available fortress-N
          for (let i = 1; i <= 10; i++) {
            const candidateId = `fortress-${i}`;
            const candidatePath = getSocketPath(candidateId);
            try {
              const stat = await fs.stat(candidatePath);
              if (stat.isSocket()) continue; // Already in use
            } catch {
              // Socket doesn't exist, this ID is available
              instance = candidateId;
              break;
            }
          }
          if (!instance) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Too many fortresses running (max 10). Close some first.",
                },
              ],
              isError: true,
            };
          }
        }

        const config = JSON.stringify({ fortressName, save });

        // Get plugin directory (where package.json lives)
        const pluginDir = import.meta.dir.replace("/src", "");

        // Ensure dependencies are installed
        const installProc = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
          cwd: pluginDir,
          stdout: "ignore",
          stderr: "pipe",
        });
        if (installProc.exitCode !== 0) {
          const stderr = installProc.stderr.toString();
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to install dependencies: ${stderr}`,
              },
            ],
            isError: true,
          };
        }

        const result = await spawnCanvas("fortress", instance, config, {
          scenario: "fortress",
        });

        // Wait for socket to appear (fortress needs a moment to initialize)
        const socketPath = getSocketPath(instance);
        let attempts = 0;
        while (attempts < 30) {
          try {
            const stat = await fs.stat(socketPath);
            if (stat.isSocket()) break;
          } catch {
            // Socket doesn't exist yet
          }
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }

        if (attempts >= 30) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Fortress "${fortressName}" spawn initiated but socket not ready. Check tmux pane for errors. Socket path: ${socketPath}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `The wagon has arrived at ${fortressName.toUpperCase()}. Seven dwarves await your command.\n\nInstance ID: ${instance}\nUse this ID with query, dig, build, assign, pause, save, and screenshot commands.`,
            },
          ],
        };
      }

      case "query": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' to start a new fortress.`,
              },
            ],
            isError: true,
          };
        }

        const response = (await sendIPC(socketPath, {
          type: "getSummary",
          format: "markdown",
        })) as { type: string; data: unknown };

        if (response.type === "state") {
          const data =
            typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data, null, 2);
          return {
            content: [{ type: "text" as const, text: data }],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "dig": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        const x = args?.x as number;
        const y = args?.y as number;
        const width = args?.width as number;
        const height = args?.height as number;

        await sendCommand(socketPath, {
          type: "dig",
          area: { x, y, width, height },
        });

        const tiles = width * height;
        return {
          content: [
            {
              type: "text" as const,
              text: `Designated ${tiles} tiles for mining at (${x}, ${y}) with dimensions ${width}x${height}.`,
            },
          ],
        };
      }

      case "build": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        const structure = args?.structure as
          | "workshop"
          | "stockpile"
          | "bed"
          | "farm";
        const x = args?.x as number;
        const y = args?.y as number;
        const subtype = args?.subtype as string | undefined;

        await sendCommand(socketPath, {
          type: "build",
          structure,
          location: { x, y },
          subtype,
        });

        const buildName = subtype ? `${subtype} ${structure}` : structure;
        return {
          content: [
            {
              type: "text" as const,
              text: `Queued construction of ${buildName} at (${x}, ${y}).`,
            },
          ],
        };
      }

      case "assign": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        const dwarfId = args?.dwarf_id as number;
        const labor = args?.labor as Labor;

        await sendCommand(socketPath, {
          type: "assign",
          dwarfId,
          labor,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Assigned dwarf #${dwarfId} to ${labor}.`,
            },
          ],
        };
      }

      case "pause": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        const paused = args?.paused as boolean;

        await sendCommand(socketPath, {
          type: "pause",
          paused,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: paused ? "Fortress paused." : "Fortress unpaused.",
            },
          ],
        };
      }

      case "save": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        await sendCommand(socketPath, { type: "save" });

        return {
          content: [
            {
              type: "text" as const,
              text: "Fortress saved.",
            },
          ],
        };
      }

      case "screenshot": {
        const instance = (args?.instance as string) || "fortress-1";
        const socketPath = getSocketPath(instance);

        if (!(await fortressExists(instance))) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No fortress found at instance "${instance}". Use 'embark' first.`,
              },
            ],
            isError: true,
          };
        }

        // Request screenshot from fortress (longer timeout for rendering)
        const response = (await sendIPC(
          socketPath,
          { type: "screenshot" },
          10000
        )) as { type: string; path?: string; message?: string };

        if (response.type === "error") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Screenshot failed: ${response.message}`,
              },
            ],
            isError: true,
          };
        }

        if (response.type === "screenshot" && response.path) {
          // Read the PNG file and return as base64 image
          const fs = await import("fs/promises");
          const imageData = await fs.readFile(response.path);
          const base64 = imageData.toString("base64");

          return {
            content: [
              {
                type: "image" as const,
                data: base64,
                mimeType: "image/png",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Unexpected response: ${JSON.stringify(response)}`,
            },
          ],
          isError: true,
        };
      }

      default:
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
