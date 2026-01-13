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
  .description("Query fortress state (markdown summary by default)")
  .option("--full", "Get full state including map (larger response)")
  .option("--format <type>", "Output format: markdown (default) or json", "markdown")
  .option("--socket <path>", "Override socket path")
  .action(async (id: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = options.socket || getSocketPath(id);

    // Determine query type and format
    let queryMsg: Record<string, unknown>;
    if (options.full) {
      queryMsg = { type: "getState" };
    } else {
      queryMsg = { type: "getSummary", format: options.format };
    }

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
                // If data is a string (markdown), output directly; otherwise JSON stringify
                if (typeof response.data === "string") {
                  resolve(response.data);
                } else {
                  resolve(JSON.stringify(response.data, null, 2));
                }
              } else {
                resolve(JSON.stringify(response, null, 2));
              }
              socket.end();
            },
            open(socket) {
              socket.write(JSON.stringify(queryMsg) + "\n");
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
  .command("screenshot <id>")
  .description("Capture a PNG screenshot of the fortress")
  .option("--socket <path>", "Override socket path")
  .option("--viewport <json>", "Viewport region as JSON: {x,y,width,height}")
  .action(async (id: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = options.socket || getSocketPath(id);

    let viewport: { x: number; y: number; width: number; height: number } | undefined;
    if (options.viewport) {
      try {
        viewport = JSON.parse(options.viewport);
      } catch {
        console.error("Invalid viewport JSON. Example: '{\"x\":0,\"y\":0,\"width\":20,\"height\":10}'");
        process.exit(1);
      }
    }

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for screenshot (10s)"));
          }
        }, 10000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "screenshot") {
                resolve(response.path);
              } else if (response.type === "error") {
                reject(new Error(response.message));
              } else {
                resolve(JSON.stringify(response, null, 2));
              }
              socket.end();
            },
            open(socket) {
              const msg = viewport
                ? JSON.stringify({ type: "screenshot", viewport })
                : JSON.stringify({ type: "screenshot" });
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
      console.log(`Screenshot saved: ${result}`);
    } catch (err) {
      console.error(`Failed to capture screenshot for fortress '${id}':`, err);
      process.exit(1);
    }
  });

program
  .command("inspect <id> <x> <y>")
  .description("Inspect tiles and entities at a location")
  .option("--socket <path>", "Override socket path")
  .option("--radius <n>", "Search radius (default: 0)", "0")
  .action(async (id: string, xStr: string, yStr: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = options.socket || getSocketPath(id);

    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const radius = parseInt(options.radius, 10) || 0;

    if (isNaN(x) || isNaN(y)) {
      console.error("x and y must be integers");
      process.exit(1);
    }

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for inspect response (5s)"));
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
              if (response.type === "inspect") {
                resolve(JSON.stringify(response.data, null, 2));
              } else {
                resolve(JSON.stringify(response, null, 2));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: "inspect", x, y, radius });
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
      console.error(`Failed to inspect fortress '${id}' at (${x}, ${y}):`, err);
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
