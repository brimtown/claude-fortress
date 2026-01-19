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
import { detectPlatform } from "./platform";
import type { FortressCommand, Labor } from "./scenarios/fortress/types";
import { hasSave, getAllSaveMetadata, deleteSave } from "./lib/fortress-sim/save";

// Check if a socket/pipe is ready (cross-platform)
async function isSocketReady(socketPath: string): Promise<boolean> {
  const platform = detectPlatform();

  if (platform === "windows") {
    // On Windows, named pipes can't be stat'd - try connecting instead
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 100);
      Bun.connect({
        unix: socketPath,
        socket: {
          open(socket) {
            clearTimeout(timeout);
            socket.end();
            resolve(true);
          },
          error() {
            clearTimeout(timeout);
            resolve(false);
          },
          data() {},
          close() {},
        },
      }).catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  // Unix/WSL - use fs.stat
  try {
    const fs = await import("fs/promises");
    const stat = await fs.stat(socketPath);
    return stat.isSocket();
  } catch {
    return false;
  }
}

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

// Check if fortress instance exists by trying to connect to socket/pipe
async function fortressExists(instance: string): Promise<boolean> {
  const socketPath = getSocketPath(instance);
  return isSocketReady(socketPath);
}

// Plugin version - updated by scripts/release.ts
const PLUGIN_VERSION = "0.4.2";

// Create the MCP server
const server = new Server(
  {
    name: "cli",
    version: PLUGIN_VERSION,
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
          "Place a building or structure. IMPORTANT: You must dig out floor tiles first, then build on them. Buildings cannot be placed on walls or undug terrain.",
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
      {
        name: "cancel",
        description:
          "Cancel dig designations in an area. Removes pending dig jobs that haven't been started yet.",
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
              description: "Width of area to cancel",
            },
            height: {
              type: "number",
              description: "Height of area to cancel",
            },
          },
          required: ["x", "y", "width", "height"],
        },
      },
      {
        name: "resume",
        description:
          "Resume a previously saved fortress. Opens an interactive picker to choose from saved fortresses, then spawns the selected one. Returns the selected fortress name and instance ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            instance: {
              type: "string",
              description:
                'Instance ID to use for the resumed fortress (default: auto-generated like "fortress-1", "fortress-2")',
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
        const userProvidedName = args?.name as string | undefined;
        let fortressName: string;
        let isAutoGenerated = false;
        const save = args?.save !== false;

        // Auto-generate fortress name if not provided
        if (!userProvidedName) {
          isAutoGenerated = true;
          const prefixes = ["Copper", "Iron", "Gold", "Silver", "Bronze", "Steel", "Mithril", "Amber", "Jade", "Onyx"];
          const suffixes = ["gleam", "peak", "halls", "forge", "deep", "hold", "spire", "gate", "haven", "ward"];
          const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
          const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
          fortressName = `${prefix}${suffix}`;
        } else {
          fortressName = userProvidedName;
        }

        // Only add collision suffix for auto-generated names
        // User-provided names should load the existing save instead of creating a new one
        if (save && isAutoGenerated && hasSave(fortressName)) {
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
            const inUse = await isSocketReady(candidatePath);
            if (inUse) continue; // Already in use
            instance = candidateId;
            break;
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

        const spawnResult = await spawnCanvas("fortress", instance, config, {
          scenario: "fortress",
        });

        // Wait for socket/pipe to be ready (fortress needs a moment to initialize)
        const socketPath = getSocketPath(instance);
        let attempts = 0;
        while (attempts < 30) {
          const ready = await isSocketReady(socketPath);
          if (ready) break;
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }

        if (attempts >= 30) {
          const platform = detectPlatform();
          const paneHint = platform === "windows"
            ? "Check the Windows Terminal pane for errors."
            : "Check the tmux pane for errors.";
          return {
            content: [
              {
                type: "text" as const,
                text: `Fortress "${fortressName}" spawn initiated but socket not ready. ${paneHint} Socket path: ${socketPath}`,
              },
            ],
            isError: true,
          };
        }

        // Build success message, including version, platform, and Windows warning if applicable
        const platform = detectPlatform();
        let successMsg = `Claude Fortress v${PLUGIN_VERSION} (${platform})\n\nThe wagon has arrived at ${fortressName.toUpperCase()}. Seven dwarves await your command.\n\nInstance ID: ${instance}\nUse this ID with query, dig, build, assign, pause, save, and screenshot commands.`;
        if (spawnResult.warning) {
          successMsg += `\n\n${spawnResult.warning}`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: successMsg,
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

        // Validate inputs
        const errors: string[] = [];
        if (typeof x !== "number" || x < 0 || x >= 40) {
          errors.push(`x must be 0-39 (got ${x})`);
        }
        if (typeof y !== "number" || y < 0 || y >= 20) {
          errors.push(`y must be 0-19 (got ${y})`);
        }
        if (typeof width !== "number" || width < 1) {
          errors.push(`width must be at least 1 (got ${width})`);
        }
        if (typeof height !== "number" || height < 1) {
          errors.push(`height must be at least 1 (got ${height})`);
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid dig parameters: ${errors.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

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

        // Validate inputs
        const errors: string[] = [];
        if (typeof x !== "number" || x < 0 || x >= 40) {
          errors.push(`x must be 0-39 (got ${x})`);
        }
        if (typeof y !== "number" || y < 0 || y >= 20) {
          errors.push(`y must be 0-19 (got ${y})`);
        }
        const validStructures = ["workshop", "stockpile", "bed", "farm"];
        if (!validStructures.includes(structure)) {
          errors.push(`structure must be one of: ${validStructures.join(", ")}`);
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid build parameters: ${errors.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

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

        // Validate inputs
        const errors: string[] = [];
        if (typeof dwarfId !== "number" || dwarfId < 0) {
          errors.push(`dwarf_id must be a non-negative number (got ${dwarfId})`);
        }
        const validLabors: Labor[] = ["mining", "carpentry", "brewing", "farming", "hauling"];
        if (!validLabors.includes(labor)) {
          errors.push(`labor must be one of: ${validLabors.join(", ")}`);
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid assign parameters: ${errors.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

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

      case "cancel": {
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

        // Validate inputs
        const errors: string[] = [];
        if (typeof x !== "number" || x < 0 || x >= 40) {
          errors.push(`x must be 0-39 (got ${x})`);
        }
        if (typeof y !== "number" || y < 0 || y >= 20) {
          errors.push(`y must be 0-19 (got ${y})`);
        }
        if (typeof width !== "number" || width < 1) {
          errors.push(`width must be at least 1 (got ${width})`);
        }
        if (typeof height !== "number" || height < 1) {
          errors.push(`height must be at least 1 (got ${height})`);
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid cancel parameters: ${errors.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        await sendCommand(socketPath, {
          type: "cancel",
          area: { x, y, width, height },
        });

        const tiles = width * height;
        return {
          content: [
            {
              type: "text" as const,
              text: `Cancelled dig designations in ${tiles} tile area at (${x}, ${y}).`,
            },
          ],
        };
      }

      case "resume": {
        // Check for saves first
        const saves = await getAllSaveMetadata();
        if (saves.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No saved fortresses found. Use 'embark' to start a new fortress!",
              },
            ],
          };
        }

        // Generate or use provided instance ID
        let instance = args?.instance as string | undefined;
        if (!instance) {
          for (let i = 1; i <= 10; i++) {
            const candidateId = `fortress-${i}`;
            const candidatePath = getSocketPath(candidateId);
            const inUse = await isSocketReady(candidatePath);
            if (inUse) continue;
            instance = candidateId;
            break;
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

        // Spawn the save picker
        const pickerInstance = `picker-${instance}`;
        const pickerSocketPath = getSocketPath(pickerInstance);

        // Get plugin directory
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

        await spawnCanvas("savePicker", pickerInstance, "{}", {
          scenario: "savePicker",
        });

        // Wait for picker socket to be ready
        let attempts = 0;
        while (attempts < 30) {
          const ready = await isSocketReady(pickerSocketPath);
          if (ready) break;
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }

        if (attempts >= 30) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Save picker failed to start. Please try again.",
              },
            ],
            isError: true,
          };
        }

        // Wait for user selection via IPC
        const pickerResult = await new Promise<{
          type: "selected" | "cancelled" | "deleted";
          name?: string;
        }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for save picker selection"));
          }, 300000); // 5 minute timeout

          let resolved = false;

          Bun.connect({
            unix: pickerSocketPath,
            socket: {
              data(socket, data) {
                if (resolved) return;
                try {
                  const response = JSON.parse(data.toString().trim());
                  if (response.type === "pickerResult" && response.result) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(response.result);
                    socket.end();
                  }
                } catch {
                  // Ignore parse errors, keep waiting
                }
              },
              open() {},
              close() {
                // Socket closed before we got a result
                if (!resolved) {
                  clearTimeout(timeout);
                  resolve({ type: "cancelled" });
                }
              },
              error(socket, error) {
                if (!resolved) {
                  clearTimeout(timeout);
                  reject(error);
                }
              },
            },
          }).catch((err) => {
            if (!resolved) {
              clearTimeout(timeout);
              reject(err);
            }
          });
        });

        // Handle picker result
        if (pickerResult.type === "cancelled") {
          return {
            content: [
              {
                type: "text" as const,
                text: "Fortress selection cancelled.",
              },
            ],
          };
        }

        if (pickerResult.type === "deleted" && pickerResult.name) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Fortress "${pickerResult.name}" has been deleted from the archives.`,
              },
            ],
          };
        }

        if (pickerResult.type === "selected" && pickerResult.name) {
          const fortressName = pickerResult.name;

          // Wait for picker to fully exit before spawning fortress in same pane
          // The picker exits 500ms after sending result, plus buffer for shell recovery
          await new Promise((r) => setTimeout(r, 800));

          // Spawn the fortress with the selected save
          const config = JSON.stringify({ fortressName, save: true });

          const spawnResult = await spawnCanvas("fortress", instance, config, {
            scenario: "fortress",
          });

          // Wait for fortress socket to be ready
          const fortressSocketPath = getSocketPath(instance);
          attempts = 0;
          while (attempts < 30) {
            const ready = await isSocketReady(fortressSocketPath);
            if (ready) break;
            await new Promise((r) => setTimeout(r, 200));
            attempts++;
          }

          if (attempts >= 30) {
            const platform = detectPlatform();
            const paneHint =
              platform === "windows"
                ? "Check the Windows Terminal pane for errors."
                : "Check the tmux pane for errors.";
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Fortress "${fortressName}" spawn initiated but socket not ready. ${paneHint}`,
                },
              ],
              isError: true,
            };
          }

          // Get save metadata for rich response
          const saveMeta = saves.find((s) => s.name === fortressName);
          const platform = detectPlatform();
          let successMsg = `Claude Fortress v${PLUGIN_VERSION} (${platform})\n\n`;
          successMsg += `Returning to ${fortressName.toUpperCase()}!\n\n`;
          if (saveMeta) {
            successMsg += `Year ${saveMeta.year}, ${saveMeta.season}\n`;
            successMsg += `Population: ${saveMeta.aliveCount}/${saveMeta.population} dwarves\n`;
            if (saveMeta.fallen) {
              successMsg += `Status: FALLEN\n`;
            }
          }
          successMsg += `\nInstance ID: ${instance}`;
          if (spawnResult.warning) {
            successMsg += `\n\n${spawnResult.warning}`;
          }

          return {
            content: [
              {
                type: "text" as const,
                text: successMsg,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: "Unexpected picker result.",
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
