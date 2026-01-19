# Plugin Architecture

This spec documents the Claude Fortress plugin architecture: MCP tools, IPC communication, terminal management, and the save/resume system.

## Overview

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   Claude Code   │◄────────────────────►│   MCP Server    │
│                 │                       │ (mcp-server.ts) │
└─────────────────┘                       └────────┬────────┘
                                                   │
                                          spawnCanvas()
                                                   │
                                                   ▼
┌─────────────────┐     Unix Socket       ┌─────────────────┐
│   MCP Server    │◄────────────────────►│  Fortress TUI   │
│  (IPC Client)   │   /tmp/canvas-*.sock  │ (FortressCanvas)│
└─────────────────┘                       └─────────────────┘
                                                   │
                                              Autosave
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │   Save Files    │
                                          │ ~/.claude/      │
                                          │ fortress-saves/ │
                                          └─────────────────┘
```

## MCP Server (`src/mcp-server.ts`)

The MCP server exposes fortress tools to Claude Code without requiring bash permissions.

### Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `embark` | Start new fortress | `name?`, `instance?`, `save?` |
| `resume` | Resume saved fortress | `instance?` |
| `query` | Get fortress state | `instance` |
| `dig` | Designate mining | `x`, `y`, `width`, `height` |
| `build` | Place structure | `structure`, `x`, `y`, `subtype?` |
| `assign` | Change dwarf labor | `dwarf_id`, `labor` |
| `pause` | Pause/unpause | `paused` |
| `save` | Manual save | `instance` |
| `screenshot` | Capture PNG | `instance` |
| `cancel` | Cancel dig jobs | `x`, `y`, `width`, `height` |

### Instance Management

- Default instance: `fortress-1`
- Auto-generated: `fortress-1`, `fortress-2`, ... up to `fortress-10`
- Each instance has its own socket: `/tmp/canvas-fortress-{N}.sock`

## IPC Communication

### Socket Protocol

Communication uses Unix domain sockets with JSON messages (newline-delimited).

**Controller → Canvas messages** (`ControllerMessage`):
```typescript
type ControllerMessage =
  | { type: "command"; command: FortressCommand }
  | { type: "getState" }
  | { type: "getSummary"; format?: "json" | "markdown" }
  | { type: "screenshot"; viewport?: Viewport }
  | { type: "inspect"; x: number; y: number; radius?: number }
  | { type: "close" };
```

**Canvas → Controller messages** (`CanvasMessage`):
```typescript
type CanvasMessage =
  | { type: "ready"; scenario: string }
  | { type: "state"; data: unknown }
  | { type: "screenshot"; path: string; tick: number }
  | { type: "error"; message: string }
  | { type: "pickerResult"; result: PickerResult };
```

### IPC Server (`src/ipc/server.ts`)

- Listens on Unix socket
- Tracks connected clients in a `Set`
- `broadcast()` sends to all connected clients
- Handles line-based JSON parsing with buffer

## Terminal Management (`src/terminal.ts`)

### Platform Detection

```typescript
type Platform = "macos" | "linux" | "wsl" | "windows";
```

- **macOS/Linux/WSL**: Requires tmux for split-pane display
- **Windows**: Uses Windows Terminal split-pane (`wt.exe`)

### Tmux Pane Management

The plugin reuses a single canvas pane across embark/resume operations.

**Pane tracking file**: `/tmp/claude-canvas-pane-id`

**Flow**:
1. `spawnTmux()` checks for existing pane via `getCanvasPaneId()`
2. If valid pane exists → `reuseExistingPane()` sends C-c + command
3. If no pane → `createNewPane()` splits window and saves pane ID

**Pane reuse detection** (`getCanvasPaneId`):
```typescript
// Pane is reusable if running a canvas process OR idle shell
const isCanvasProcess = currentCommand === "bun" ||
                        currentCommand?.includes("canvas");
const isIdleShell = ["bash", "zsh", "fish", "sh", "dash"]
                    .includes(currentCommand);
```

**Reuse flow** (`reuseExistingPane`):
1. Send `C-c` to interrupt any running process
2. Wait 300ms for shell recovery
3. Send `clear && bash ${wrapperScript}` + Enter

### Wrapper Scripts

Each canvas spawn creates a wrapper script at `/tmp/canvas-spawn-{id}.sh`:

```bash
#!/bin/bash
cd /path/to/plugin
exec bun run src/cli.ts show fortress --id fortress-1 \
  --config '{"fortressName":"Irondeep","save":true}' \
  --socket /tmp/canvas-fortress-1.sock \
  --scenario fortress
```

Using `bash ${script}` instead of direct execution avoids permission issues.

## Save System (`src/lib/fortress-sim/save.ts`)

### Save Location

`~/.claude/fortress-saves/{sanitized-name}.json`

### Save File Format

```typescript
interface SaveFile {
  version: 1;
  fortressName: string;
  savedAt: string;  // ISO timestamp
  state: FortressState;
}
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `saveFortress(name, state)` | Write state to disk |
| `loadFortress(name)` | Load state from disk |
| `hasSave(name)` | Check if save exists |
| `listSaves()` | List all save names |
| `getAllSaveMetadata()` | Get metadata for all saves (sorted by date) |
| `getSaveMetadata(name)` | Get metadata for single save |
| `deleteSave(name)` | Remove save file |

### Save Metadata

```typescript
interface SaveMetadata {
  name: string;
  year: number;
  season: string;
  population: number;
  aliveCount: number;
  savedAt: string;
  fallen: boolean;
  tick: number;
}
```

### Autosave

The fortress autosaves every 10 ticks (5 seconds) when `config.save` is enabled.

## Resume System

### Resume Flow

```
User: /claude-fortress:resume
           │
           ▼
    ┌──────────────┐
    │ Check saves  │──── None ───► "No saves found"
    └──────┬───────┘
           │ Has saves
           ▼
    ┌──────────────┐
    │ Spawn picker │ (savePicker canvas)
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────┐
    │   FORTRESS ARCHIVES      │
    │ > Irondeep   Year 252    │
    │   Doomgate   Year 251    │
    │ [Enter] [D]elete [Q]uit  │
    └──────────────────────────┘
           │
           ▼ User selects
    ┌──────────────┐
    │ IPC result   │ { type: "selected", name: "Irondeep" }
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Wait 800ms   │ (for picker to exit)
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Spawn fort   │ (reuses picker's pane)
    └──────────────┘
```

### Save Picker (`src/canvases/savePicker.tsx`)

TUI component for browsing saves:
- Arrow keys (↑/↓/j/k) to navigate
- Enter to select
- D to delete (with Y/N confirmation)
- Q/Esc to cancel
- Scrolling window for long lists

### Embark Name Handling

Embark **always** creates a new fortress - it never loads from save:
- On name collision, adds random suffix (e.g., `Irondeep` → `Irondeep-x7f2`)
- Use `resume` command to load existing saves

```typescript
// Embark ALWAYS creates new - add suffix on collision
if (save && hasSave(fortressName)) {
  fortressName = `${fortressName}-${randomSuffix}`;
}
```

## Timing Considerations

### Resume Timing

The resume flow has careful timing to ensure reliable pane reuse:

1. **Picker broadcasts result** at T=0
2. **Picker exits** at T=500ms (delay for IPC delivery)
3. **MCP server waits** until T=800ms (buffer for picker exit)
4. **reuseExistingPane** sends C-c at T=800ms
5. **Command sent** at T=1100ms (300ms shell recovery)

### Socket Readiness

After spawning a canvas, the MCP server polls for socket readiness:
- Max 30 attempts × 200ms = 6 seconds
- Uses `Bun.connect()` test on Windows (named pipes can't be stat'd)
- Uses `fs.stat()` on Unix

## File Locations Summary

| File | Purpose |
|------|---------|
| `/tmp/canvas-fortress-{N}.sock` | IPC socket |
| `/tmp/canvas-spawn-{id}.sh` | Wrapper script |
| `/tmp/claude-canvas-pane-id` | Tmux pane tracking |
| `~/.claude/fortress-saves/*.json` | Save files |
