#!/usr/bin/env bun
import { program } from "commander";
import { detectTerminal, spawnCanvas } from "./terminal";

// Set window title via ANSI escape codes
function setWindowTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

program
  .name("claude-canvas")
  .description("Interactive terminal canvases for Claude")
  .version("1.0.0");

program
  .command("show [kind]")
  .description("Show a canvas in the current terminal")
  .option("--id <id>", "Canvas ID")
  .option("--config <json>", "Canvas configuration (JSON)")
  .option("--socket <path>", "Unix socket path for IPC")
  .option("--scenario <name>", "Scenario name (e.g., display, meeting-picker)")
  .action(async (kind = "demo", options) => {
    const id = options.id || `${kind}-1`;
    const config = options.config ? JSON.parse(options.config) : undefined;
    const socketPath = options.socket;
    const scenario = options.scenario || "display";

    // Set window title
    setWindowTitle(`canvas: ${kind}`);

    // Dynamically import and render the canvas
    const { renderCanvas } = await import("./canvases");
    await renderCanvas(kind, id, config, { socketPath, scenario });
  });

program
  .command("spawn [kind]")
  .description("Spawn a canvas in a new terminal window")
  .option("--id <id>", "Canvas ID")
  .option("--config <json>", "Canvas configuration (JSON)")
  .option("--socket <path>", "Unix socket path for IPC")
  .option("--scenario <name>", "Scenario name (e.g., display, meeting-picker)")
  .action(async (kind = "demo", options) => {
    const id = options.id || `${kind}-1`;
    const result = await spawnCanvas(kind, id, options.config, {
      socketPath: options.socket,
      scenario: options.scenario,
    });
    console.log(`Spawned ${kind} canvas '${id}' via ${result.method}`);
  });

program
  .command("env")
  .description("Show detected terminal environment")
  .action(() => {
    const env = detectTerminal();
    console.log("Terminal Environment:");
    console.log(`  In tmux: ${env.inTmux}`);
    console.log(`\nSummary: ${env.summary}`);
  });

program
  .command("update <id>")
  .description("Send updated config to a running canvas via IPC")
  .option("--config <json>", "New canvas configuration (JSON)")
  .action(async (id: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);
    const config = options.config ? JSON.parse(options.config) : {};

    try {
      const socket = await Bun.connect({
        unix: socketPath,
        socket: {
          data(socket, data) {
            // Ignore responses
          },
          open(socket) {
            const msg = JSON.stringify({ type: "update", config });
            socket.write(msg + "\n");
            socket.end();
          },
          close() {},
          error(socket, error) {
            console.error("Socket error:", error);
          },
        },
      });
      console.log(`Sent update to canvas '${id}'`);
    } catch (err) {
      console.error(`Failed to connect to canvas '${id}':`, err);
    }
  });

program
  .command("selection <id>")
  .description("Get the current selection from a running document canvas")
  .action(async (id: string) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for response"));
          }
        }, 2000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "selection") {
                resolve(JSON.stringify(response.data));
              } else {
                resolve(JSON.stringify(null));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: "getSelection" });
              socket.write(msg + "\n");
            },
            close() {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(JSON.stringify(null));
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
      console.log(result);
    } catch (err) {
      console.error(`Failed to get selection from canvas '${id}':`, err);
      process.exit(1);
    }
  });

program
  .command("content <id>")
  .description("Get the current content from a running document canvas")
  .action(async (id: string) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for response"));
          }
        }, 2000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "content") {
                resolve(JSON.stringify(response.data));
              } else {
                resolve(JSON.stringify(null));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: "getContent" });
              socket.write(msg + "\n");
            },
            close() {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(JSON.stringify(null));
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
      console.log(result);
    } catch (err) {
      console.error(`Failed to get content from canvas '${id}':`, err);
      process.exit(1);
    }
  });

// Fortress-specific commands
program
  .command("query <id>")
  .description("Query fortress state (summary by default, --full for complete state)")
  .option("--full", "Get full state including map (larger response)")
  .option("--socket <path>", "Override socket path")
  .action(async (id: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = options.socket || getSocketPath(id);
    const queryType = options.full ? "getState" : "getSummary";

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for fortress response (5s)"));
          }
        }, 5000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "state") {
                resolve(JSON.stringify(response.data, null, 2));
              } else {
                resolve(JSON.stringify(response, null, 2));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: queryType });
              socket.write(msg + "\n");
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
      console.log(result);
    } catch (err) {
      console.error(`Failed to query fortress '${id}':`, err);
      process.exit(1);
    }
  });

program
  .command("send <id> <command>")
  .description("Send a command to a running fortress (JSON format)")
  .option("--socket <path>", "Override socket path")
  .action(async (id: string, commandJson: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = options.socket || getSocketPath(id);

    try {
      const command = JSON.parse(commandJson);
      const socket = await Bun.connect({
        unix: socketPath,
        socket: {
          data(socket, data) {
            // Ignore responses for send command
          },
          open(socket) {
            const msg = JSON.stringify({ type: "command", command });
            socket.write(msg + "\n");
            console.log(`Sent command to fortress '${id}':`, command.type);
            setTimeout(() => socket.end(), 100); // Brief delay to ensure delivery
          },
          close() {},
          error(socket, error) {
            console.error("Socket error:", error);
          },
        },
      });
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error("Invalid JSON command. Examples:");
        console.error('  {"type":"dig","area":{"x":15,"y":8,"width":10,"height":5}}');
        console.error('  {"type":"pause","paused":true}');
        console.error('  {"type":"save"}');
      } else {
        console.error(`Failed to send command to fortress '${id}':`, err);
      }
      process.exit(1);
    }
  });

program.parse();
