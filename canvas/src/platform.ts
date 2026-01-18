// Platform detection and cross-platform utilities for Windows/WSL/Unix support

import { homedir, tmpdir } from "os";
import { join } from "path";

export type Platform = "windows" | "wsl" | "unix";

/**
 * Detect the current platform environment
 * - "wsl": Running inside Windows Subsystem for Linux (has full tmux support)
 * - "windows": Native Windows (PowerShell/cmd, uses Windows Terminal)
 * - "unix": macOS or Linux (uses tmux)
 */
export function detectPlatform(): Platform {
  if (process.platform === "win32") {
    return "windows";
  }

  // Check if running inside WSL (Linux under Windows)
  // WSL sets several environment variables we can check
  if (
    process.env.WSL_DISTRO_NAME ||
    process.env.WSL_INTEROP ||
    process.env.WSLENV
  ) {
    return "wsl";
  }

  return "unix";
}

/**
 * Check if Windows Terminal is available
 * wt.exe should be in PATH if Windows Terminal is installed
 */
export function hasWindowsTerminal(): boolean {
  if (process.platform !== "win32") return false;

  try {
    const result = Bun.spawnSync(["where", "wt.exe"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get the appropriate temp directory for the platform
 */
export function getTempDir(): string {
  return tmpdir();
}

/**
 * Get the socket/pipe path for IPC communication
 * - Windows: Named pipe (\\.\pipe\canvas-{id})
 * - Unix/WSL: Unix domain socket (/tmp/canvas-{id}.sock)
 */
export function getSocketPath(id: string): string {
  if (process.platform === "win32") {
    // Windows named pipes live in a special namespace
    return `\\\\.\\pipe\\canvas-${id}`;
  }
  return `/tmp/canvas-${id}.sock`;
}

/**
 * Get the path for the wrapper script
 * - Windows: PowerShell script in temp dir
 * - Unix/WSL: Bash script in /tmp
 */
export function getWrapperScriptPath(id: string): string {
  if (process.platform === "win32") {
    return join(getTempDir(), `canvas-spawn-${id}.ps1`);
  }
  return `/tmp/canvas-spawn-${id}.sh`;
}

/**
 * Get the path for tracking the canvas pane ID
 * - Windows: In user's temp directory
 * - Unix/WSL: In /tmp
 */
export function getPaneTrackingPath(): string {
  if (process.platform === "win32") {
    return join(getTempDir(), "claude-canvas-pane-id");
  }
  return "/tmp/claude-canvas-pane-id";
}

/**
 * Get the path for screenshot output
 * - Windows: In user's temp directory
 * - Unix/WSL: In /tmp
 */
export function getScreenshotPath(fortressId: string): string {
  if (process.platform === "win32") {
    return join(getTempDir(), `fortress-${fortressId}-screenshot.png`);
  }
  return `/tmp/fortress-${fortressId}-screenshot.png`;
}

/**
 * Check if we're in a tmux session
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Get platform-specific terminal info for user messages
 */
export function getPlatformTerminalInfo(): {
  platform: Platform;
  canSplitPane: boolean;
  canReusePanes: boolean;
  terminalName: string;
  recommendation?: string;
} {
  const platform = detectPlatform();

  if (platform === "wsl" || platform === "unix") {
    const inTmux = isInTmux();
    return {
      platform,
      canSplitPane: inTmux,
      canReusePanes: inTmux,
      terminalName: "tmux",
      recommendation: inTmux
        ? undefined
        : "Run inside a tmux session for split-pane support",
    };
  }

  // Windows
  const hasWT = hasWindowsTerminal();
  return {
    platform: "windows",
    canSplitPane: hasWT,
    canReusePanes: false, // Windows Terminal can't target existing panes
    terminalName: hasWT ? "Windows Terminal" : "PowerShell",
    recommendation: hasWT
      ? "Note: Each embark opens a new pane (close previous manually)"
      : "Install Windows Terminal for split-pane support",
  };
}
