import { spawn, spawnSync } from "child_process";
import {
  detectPlatform,
  isInTmux,
  getSocketPath,
  getWrapperScriptPath,
  getPaneTrackingPath,
  hasWindowsTerminal,
  type Platform,
} from "./platform";

export interface TerminalEnvironment {
  inTmux: boolean;
  platform: Platform;
  canSpawn: boolean;
  summary: string;
}

export function detectTerminal(): TerminalEnvironment {
  const platform = detectPlatform();
  const inTmux = isInTmux();

  if (platform === "windows") {
    const hasWT = hasWindowsTerminal();
    return {
      inTmux: false,
      platform,
      canSpawn: hasWT,
      summary: hasWT ? "Windows Terminal" : "Windows (no Windows Terminal)",
    };
  }

  // WSL or Unix - tmux is required
  return {
    inTmux,
    platform,
    canSpawn: inTmux,
    summary: inTmux ? "tmux" : "no tmux",
  };
}

export interface SpawnResult {
  method: string;
  pid?: number;
  warning?: string;
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

  // Get the directory of this script (skill directory)
  const scriptDir = import.meta.dir.replace("/src", "");

  // Auto-generate socket path for IPC if not provided
  const socketPath = options?.socketPath || getSocketPath(id);

  if (env.platform === "windows") {
    return spawnWindowsTerminal(kind, id, scriptDir, configJson, socketPath, options);
  }

  // Unix/WSL path - requires tmux
  if (!env.inTmux) {
    throw new Error("Canvas requires tmux. Please run inside a tmux session.");
  }

  return spawnTmuxCanvas(kind, id, scriptDir, configJson, socketPath, options);
}

// ============================================================================
// Unix/WSL: tmux-based spawning
// ============================================================================

async function spawnTmuxCanvas(
  kind: string,
  id: string,
  scriptDir: string,
  configJson?: string,
  socketPath?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  // Create a wrapper script to avoid shell escaping issues with tmux
  const wrapperScript = getWrapperScriptPath(id);
  let wrapperContent = `#!/bin/bash\ncd ${scriptDir}\nexec bun run src/cli.ts show ${kind} --id ${id}`;

  if (configJson) {
    wrapperContent += ` --config '${configJson.replace(/'/g, "'\\''")}'`;
  }
  if (socketPath) {
    wrapperContent += ` --socket ${socketPath}`;
  }
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

// File to track the canvas pane ID (tmux only)
const CANVAS_PANE_FILE = getPaneTrackingPath();

async function getCanvasPaneId(): Promise<string | null> {
  try {
    const file = Bun.file(CANVAS_PANE_FILE);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      if (!paneId) return null;

      // Verify the pane still exists AND is running a canvas process
      const result = spawnSync("tmux", [
        "display-message", "-t", paneId, "-p",
        "#{pane_id}:#{pane_current_command}"
      ]);
      const output = result.stdout?.toString().trim();

      if (result.status !== 0 || !output) {
        await Bun.write(CANVAS_PANE_FILE, "");
        return null;
      }

      const [returnedPaneId, currentCommand] = output.split(":");

      const isCanvasProcess =
        currentCommand === "bun" ||
        currentCommand === "bash" ||
        currentCommand?.includes("canvas") ||
        currentCommand?.includes("cli.ts");

      if (returnedPaneId === paneId && isCanvasProcess) {
        return paneId;
      }

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
      args.splice(1, 0, "-t", sourcePaneId);
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
    const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);
    killProc.on("close", () => {
      setTimeout(() => {
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
  const existingPaneId = await getCanvasPaneId();

  if (existingPaneId) {
    const reused = await reuseExistingPane(existingPaneId, wrapperScript);
    if (reused) {
      return true;
    }
    await Bun.write(CANVAS_PANE_FILE, "");
  }

  return createNewPane(wrapperScript);
}

// ============================================================================
// Windows: Windows Terminal-based spawning
// ============================================================================

async function spawnWindowsTerminal(
  kind: string,
  id: string,
  scriptDir: string,
  configJson?: string,
  socketPath?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  if (!hasWindowsTerminal()) {
    throw new Error(
      "Windows Terminal (wt.exe) is required for split-pane support.\n" +
      "Install from: https://aka.ms/terminal\n" +
      "Or run Claude Code from WSL for full tmux support."
    );
  }

  // Create a PowerShell wrapper script
  const wrapperScript = getWrapperScriptPath(id);

  // Build the command arguments
  let bunArgs = `run src/cli.ts show ${kind} --id ${id}`;
  if (configJson) {
    // Escape for PowerShell - double quotes inside need escaping
    const escapedConfig = configJson.replace(/"/g, '`"');
    bunArgs += ` --config '${escapedConfig}'`;
  }
  if (socketPath) {
    bunArgs += ` --socket "${socketPath}"`;
  }
  if (options?.scenario) {
    bunArgs += ` --scenario ${options.scenario}`;
  }

  // PowerShell script content
  const wrapperContent = `
# Canvas Fortress Launcher
Set-Location "${scriptDir.replace(/\\/g, "\\\\")}"
bun ${bunArgs}
# Keep window open on error
if ($LASTEXITCODE -ne 0) {
    Write-Host "Press any key to close..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
`.trim();

  await Bun.write(wrapperScript, wrapperContent);

  // Spawn Windows Terminal with a split pane
  // -w 0: Use current window (or create new if none)
  // sp: split-pane command
  // -V: Vertical split (side by side)
  // -s 0.67: New pane gets 67% of the width
  // -d: Starting directory
  // -p "PowerShell": Use PowerShell profile
  const result = await spawnWindowsTerminalPane(wrapperScript, scriptDir);

  if (result) {
    return {
      method: "windows-terminal",
      warning: "Note: Each embark opens a new pane. Close previous fortress panes manually.",
    };
  }

  throw new Error("Failed to spawn Windows Terminal pane");
}

async function spawnWindowsTerminalPane(
  wrapperScript: string,
  workingDir: string
): Promise<boolean> {
  return new Promise((resolve) => {
    // Build the wt.exe command
    // Using split-pane with PowerShell to run our wrapper script
    const args = [
      "split-pane",      // or "sp" for short
      "-V",              // Vertical split (side by side)
      "-s", "0.67",      // New pane gets 67% width
      "-d", workingDir,  // Working directory
      "powershell.exe",  // Shell to use
      "-NoExit",         // Keep shell open
      "-ExecutionPolicy", "Bypass",  // Allow script execution
      "-File", wrapperScript,        // Our launcher script
    ];

    const proc = spawn("wt.exe", args, {
      detached: true,
      stdio: "ignore",
    });

    proc.on("close", (code) => {
      // wt.exe returns immediately, code 0 means command was accepted
      resolve(code === 0);
    });

    proc.on("error", (err) => {
      // wt.exe not found or other error
      resolve(false);
    });

    // Unref so the parent process can exit
    proc.unref();
  });
}

// ============================================================================
// Fallback: New window (when split-pane isn't available)
// ============================================================================

export async function spawnNewWindow(
  kind: string,
  id: string,
  configJson?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  const scriptDir = import.meta.dir.replace("/src", "");
  const socketPath = options?.socketPath || getSocketPath(id);
  const wrapperScript = getWrapperScriptPath(id);

  if (process.platform === "win32") {
    // PowerShell in new window
    let bunArgs = `run src/cli.ts show ${kind} --id ${id}`;
    if (configJson) {
      const escapedConfig = configJson.replace(/"/g, '`"');
      bunArgs += ` --config '${escapedConfig}'`;
    }
    if (socketPath) {
      bunArgs += ` --socket "${socketPath}"`;
    }
    if (options?.scenario) {
      bunArgs += ` --scenario ${options.scenario}`;
    }

    const wrapperContent = `
Set-Location "${scriptDir.replace(/\\/g, "\\\\")}"
bun ${bunArgs}
Read-Host "Press Enter to close"
`.trim();

    await Bun.write(wrapperScript, wrapperContent);

    return new Promise((resolve, reject) => {
      const proc = spawn("powershell.exe", [
        "-ExecutionPolicy", "Bypass",
        "-File", wrapperScript,
      ], {
        detached: true,
        stdio: "ignore",
      });

      proc.on("error", reject);
      proc.unref();

      // Give it a moment to start
      setTimeout(() => {
        resolve({
          method: "new-window",
          warning: "Opened in a new window (no split-pane support detected)",
        });
      }, 100);
    });
  }

  // Unix/macOS without tmux - try to open a new terminal
  throw new Error(
    "No split-pane terminal detected.\n" +
    "Please run inside a tmux session: tmux new-session"
  );
}
