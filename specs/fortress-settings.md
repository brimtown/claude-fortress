---
title: Fortress Settings
date: 2026-01-19
status: implemented
dependencies: []
---

# Fortress Settings

User preferences persisted across fortress sessions.

## Settings Location

```
~/.claude/fortress-settings.json
```

Directory is created if it doesn't exist.

## Settings Schema

```typescript
interface FortressSettings {
  colorMode: ColorMode;
  renderMode: RenderMode;
}

type ColorMode = "full" | "theme";
type RenderMode = "terminal" | "emoji";
```

### Color Mode

| Mode | Description | Use Case |
|------|-------------|----------|
| `full` | Hex colors (e.g., `#50fa7b`) | Consistent appearance across all terminals |
| `theme` | ANSI named colors (e.g., `green`) | Respects terminal theme colors |

Default: `full`

**Rationale**: Some terminal themes (especially base16) map multiple ANSI colors to the same value, making grass and trees indistinguishable. Hex colors bypass this issue.

### Render Mode

| Mode | Description | Use Case |
|------|-------------|----------|
| `terminal` | ASCII/Unicode characters (`♣`, `#`, `~`) | Classic roguelike appearance |
| `emoji` | Emoji characters (`🌲`, `🪨`, `🌊`) | Modern, visually distinct tiles |

Default: `terminal`

**Note**: Emoji mode uses wider characters (typically 2 columns per character in terminals).

## Color Definitions

### Full Mode (Hex)

| Element | Color | Hex |
|---------|-------|-----|
| Grass | Light green | `#50fa7b` |
| Tree | Forest green | `#228b22` |
| Water | Cyan | `#00d7ff` |
| Wall/Rock | Gray | `#6c6c6c` |
| Floor | Light gray | `#b0b0b0` |
| Gold ore | Gold | `#ffd700` |
| Iron ore | Silver | `#c0c0c0` |
| Copper ore | Orange | `#cd7f32` |
| Workshop | Magenta | `#ff79c6` |
| Stockpile | Cyan | `#8be9fd` |
| Bed | Yellow | `#f1fa8c` |
| Farm | Lime | `#adff2f` |
| Soil | Khaki | `#f0e68c` |
| Corpse | Red | `#ff5555` |
| Dwarf | Varies | Rotating palette by ID |
| Dig designation | Dark yellow BG | `#3d3d00` |

### Theme Mode (ANSI)

Uses named ANSI colors that terminals can remap:
- `green`, `greenBright`, `blue`, `gray`, `white`, `yellow`, `magenta`, `cyan`, `red`

### Emoji Mode Characters

Full emoji mode with consistent character widths.

| Element | Emoji |
|---------|-------|
| Wall/Rock | ⬛ |
| Floor | ⬜ |
| Grass | 🟩 |
| Soil | 🟫 |
| Water | 💧 |
| Tree | 🌲 |
| Door | 🚪 |
| Workshop | 🏭 |
| Stockpile | 📦 |
| Bed | 🛏️ |
| Farm | 🌾 |
| Corpse | 💀 |
| Dwarf (happy) | 😺 |
| Dwarf (neutral) | 🐱 |
| Dwarf (sad) | 😿 |
| Dwarf (mood) | 😈 |
| Stone (item) | 🪨 |
| Log (item) | 🪵 |

## In-Game Settings Menu

Access via ESC key → Settings:

```
┌─────────────────────────────────────────────┐
│ SETTINGS                                    │
│                                             │
│ ► Color Mode:  [Full Color] / Theme         │
│   Render Mode: [Terminal] / Emoji           │
│                                             │
│ ↑/↓ select | Left/Right/Enter to toggle     │
│ ESC: back                                   │
└─────────────────────────────────────────────┘
```

- Arrow keys (↑/↓) to select setting
- Arrow keys (←/→) or Enter to toggle selected setting
- Changes apply immediately and persist to disk

## API

### Loading Settings

```typescript
// Async (preferred)
const settings = await loadSettings();

// Sync (for initial render before React hydration)
const settings = loadSettingsSync();
```

Both return `DEFAULT_SETTINGS` if file missing or unreadable.

### Saving Settings

```typescript
await saveSettings({ colorMode: "theme" });
```

Creates `~/.claude/` directory if needed.

### Defaults

```typescript
const DEFAULT_SETTINGS: FortressSettings = {
  colorMode: "full",
  renderMode: "terminal",
};
```

Missing fields are merged with defaults on load.

## Implementation Notes

- `loadSettingsSync()` uses `require("node:fs").readFileSync` for synchronous reading
- Settings are loaded once at fortress startup
- Changes in settings menu immediately update state and save to disk
- Save picker also respects color mode for consistent appearance

## Files

- `settings.ts` - Settings persistence (~93 lines)
- `colors.ts` - Color definitions and `getTileColor()`, `getDwarfColor()` functions
- `fortress.tsx` - Settings UI in ESC menu
