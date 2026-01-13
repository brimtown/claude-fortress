import React from "react";
import { render } from "ink";
import { FortressCanvas } from "./fortress";
import type { FortressConfig } from "../scenarios/fortress/types";

// Clear screen and hide cursor
function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
}

// Show cursor on exit
function showCursor() {
  process.stdout.write("\x1b[?25h");
}

export interface RenderOptions {
  socketPath?: string;
  scenario?: string;
}

export async function renderCanvas(
  kind: string,
  id: string,
  config?: unknown,
  options?: RenderOptions
): Promise<void> {
  // Clear screen before rendering
  clearScreen();

  // Ensure cursor is shown on exit
  process.on("exit", showCursor);
  process.on("SIGINT", () => {
    showCursor();
    process.exit();
  });

  switch (kind) {
    case "fortress":
      return renderFortress(
        id,
        config as FortressConfig | undefined,
        options
      );
    default:
      console.error(`Unknown canvas kind: ${kind}`);
      process.exit(1);
  }
}

async function renderFortress(
  id: string,
  config?: FortressConfig,
  options?: RenderOptions
): Promise<void> {
  const { waitUntilExit } = render(
    <FortressCanvas
      id={id}
      config={config}
      socketPath={options?.socketPath}
      scenario={options?.scenario || "simulation"}
    />,
    {
      exitOnCtrlC: true,
    }
  );
  await waitUntilExit();
}
