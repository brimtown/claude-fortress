// IPC Message Types for Canvas Communication

// Viewport for screenshot region (optional)
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Messages sent from Controller (Claude) to Canvas
export type ControllerMessage =
  | { type: "close" }
  | { type: "update"; config: unknown }
  | { type: "ping" }
  | { type: "getSelection" }
  | { type: "getContent" }
  | { type: "command"; command: unknown } // For fortress commands
  | { type: "getState" } // Query current fortress state (full)
  | { type: "getSummary"; format?: "json" | "markdown" } // Query fortress summary
  | { type: "screenshot"; viewport?: Viewport } // Capture PNG snapshot
  | { type: "inspect"; x: number; y: number; radius?: number }; // Spatial query

// Screenshot response
export interface ScreenshotResponse {
  type: "screenshot";
  path: string;
  tick: number;
  dimensions: { width: number; height: number };
}

// Messages sent from Canvas to Controller (Claude)
export type CanvasMessage =
  | { type: "ready"; scenario: string }
  | { type: "selected"; data: unknown }
  | { type: "cancelled"; reason?: string }
  | { type: "error"; message: string }
  | { type: "pong" }
  | { type: "selection"; data: { selectedText: string; startOffset: number; endOffset: number } | null }
  | { type: "content"; data: { content: string; cursorPosition: number } }
  | { type: "state"; data: unknown } // Fortress state response (JSON or markdown string)
  | ScreenshotResponse
  | { type: "inspect"; data: unknown }; // InspectResult

// Socket path convention
export function getSocketPath(id: string): string {
  return `/tmp/canvas-${id}.sock`;
}
