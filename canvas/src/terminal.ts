import { spawn, spawnSync } from "child_process";

export interface TerminalEnvironment {
  inTmux: boolean;
  summary: string;
}

export function detectTerminal(): TerminalEnvironment {
  const inTmux = !!process.env.TMUX;
  const summary = inTmux ? "tmux" : "no tmux";
  return { inTmux, summary };
}

export interface SpawnResult {
  method: string;
  pid?: number;
}

export interface SpawnOptions {
  socketPath?: string;
  scenario?: string;
}

export async function spawnCanvas(
  kind: string,
  id: string,
  configJson?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  const env = detectTerminal();

  if (!env.inTmux) {
    throw new Error("Canvas requires tmux. Please run inside a tmux session.");
  }

  // Get the directory of this script (skill directory)
  const scriptDir = import.meta.dir.replace("/src", "");

  // Auto-generate socket path for IPC if not provided
  const socketPath = options?.socketPath || `/tmp/canvas-${id}.sock`;

  // Create a wrapper script to avoid shell escaping issues with tmux
  const wrapperScript = `/tmp/canvas-spawn-${id}.sh`;
  // Use 'bun' from PATH - users should have bun in their PATH after installation
  let wrapperContent = `#!/bin/bash\ncd ${scriptDir}\nexec bun run src/cli.ts show ${kind} --id ${id}`;

  if (configJson) {
    wrapperContent += ` --config '${configJson.replace(/'/g, "'\\''")}'`;
  }
  wrapperContent += ` --socket ${socketPath}`;
  if (options?.scenario) {
    wrapperContent += ` --scenario ${options.scenario}`;
  }
  wrapperContent += "\n";

  await Bun.write(wrapperScript, wrapperContent);
  await Bun.write(wrapperScript, wrapperContent, { mode: 0o755 });

  const result = await spawnTmux(wrapperScript);
  if (result) return { method: "tmux" };

  throw new Error("Failed to spawn tmux pane");
}

// File to track the canvas pane ID
const CANVAS_PANE_FILE = "/tmp/claude-canvas-pane-id";

async function getCanvasPaneId(): Promise<string | null> {
  try {
    const file = Bun.file(CANVAS_PANE_FILE);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      if (!paneId) return null;

      // Verify the pane still exists AND is running a canvas process
      // Check both pane existence and what command it's running
      const result = spawnSync("tmux", [
        "display-message", "-t", paneId, "-p",
        "#{pane_id}:#{pane_current_command}"
      ]);
      const output = result.stdout?.toString().trim();

      if (result.status !== 0 || !output) {
        // Pane doesn't exist - clean up
        await Bun.write(CANVAS_PANE_FILE, "");
        return null;
      }

      const [returnedPaneId, currentCommand] = output.split(":");

      // Pane must exist AND be running a canvas-related process
      // Valid commands: bun (running canvas), bash (wrapper script), or the canvas process itself
      const isCanvasProcess =
        currentCommand === "bun" ||
        currentCommand === "bash" ||
        currentCommand?.includes("canvas") ||
        currentCommand?.includes("cli.ts");

      if (returnedPaneId === paneId && isCanvasProcess) {
        return paneId;
      }

      // Pane exists but is running something else (e.g., zsh, claude) - don't reuse
      await Bun.write(CANVAS_PANE_FILE, "");
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function saveCanvasPaneId(paneId: string): Promise<void> {
  await Bun.write(CANVAS_PANE_FILE, paneId);
}

async function createNewPane(wrapperScript: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Use split-window -h for vertical split (side by side)
    // -p 67 gives canvas 2/3 width (1:2 ratio, Claude:Canvas)
    // -P -F prints the new pane ID so we can save it
    // -t targets the pane that invoked the CLI (not the currently focused pane!)

    // CRITICAL: Don't pass command to split-window directly!
    // If you do: spawn("tmux", ["split-window", wrapperScript])
    // Ink will crash with "Raw mode not supported" because stdin isn't attached
    // Solution: Create empty pane first, THEN send command via send-keys
    const sourcePaneId = process.env.TMUX_PANE;
    const args = ["split-window", "-h", "-p", "67", "-P", "-F", "#{pane_id}"];
    if (sourcePaneId) {
      args.splice(1, 0, "-t", sourcePaneId); // Insert -t <pane> after split-window
    }
    const proc = spawn("tmux", args);
    let paneId = "";
    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });
    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        const newPaneId = paneId.trim();
        await saveCanvasPaneId(newPaneId);
        // Now send the command to the new pane
        setTimeout(() => {
          const sendProc = spawn("tmux", ["send-keys", "-t", newPaneId, `bash ${wrapperScript}`, "Enter"]);
          sendProc.on("close", (sendCode) => resolve(sendCode === 0));
          sendProc.on("error", () => resolve(false));
        }, 100);
      } else {
        resolve(false);
      }
    });
    proc.on("error", () => resolve(false));
  });
}

async function reuseExistingPane(paneId: string, wrapperScript: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Send Ctrl+C to interrupt any running process
    const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);
    killProc.on("close", () => {
      // Wait for process to terminate before sending new command
      setTimeout(() => {
        // Clear the terminal and run the new wrapper script
        const args = ["send-keys", "-t", paneId, `clear && ${wrapperScript}`, "Enter"];
        const proc = spawn("tmux", args);
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      }, 150);
    });
    killProc.on("error", () => resolve(false));
  });
}

async function spawnTmux(wrapperScript: string): Promise<boolean> {
  // Check if we have an existing canvas pane to reuse
  const existingPaneId = await getCanvasPaneId();

  if (existingPaneId) {
    // Try to reuse existing pane
    const reused = await reuseExistingPane(existingPaneId, wrapperScript);
    if (reused) {
      return true;
    }
    // Reuse failed (pane may have been closed) - clear stale reference and create new
    await Bun.write(CANVAS_PANE_FILE, "");
  }

  // Create a new split pane
  return createNewPane(wrapperScript);
}

