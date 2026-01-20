---
title: Simulation UI
date: 2026-01-19
status: implemented
---

# Simulation UI

DF-style modal UI system with keyboard shortcuts, improved colors, and cleaner layout.

## Main View Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ Thundervault  - Year 251, Summer                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Wood: 20  Stone: 20  Food: 93  Drink: 0  Jobs: 0  Wealth: 0
Dwarves: 7/7  Happiness: Happy  Tick: 117

┌──────────────────────────────────────────┐  ┌────────────────────────────┐
│ Map (40x20)                              │  │ KEYS                       │
│ - Alternating row shading                │  │ [a] announcements          │
│ - ♣ for trees (green)                    │  │ [u] units  [b] buildings   │
│ - ~ for water (cyan)                     │  │ [z] stocks [d] debug       │
│ - # with gray bg = dig designation       │  │ [Space] pause  [Esc] menu  │
│                                          │  │                            │
│                                          │  │ LEGEND                     │
│                                          │  │ ☺○☹=Dwarf #=Wall           │
│                                          │  │ ♣=Tree ~=Water             │
│                                          │  │ X=Workshop %=Farm          │
│                                          │  │ †=Corpse #=Dig (bg)        │
└──────────────────────────────────────────┘  └────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ • Warning: Running low on drink!                                             │
│ • Summer has arrived, Year 251                                               │
│ • Rovod Brewmaster is dehydrated!                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

### Global Keys

| Key | Action | Notes |
|-----|--------|-------|
| `Space` | Pause/Resume | DF-style toggle |
| `Esc` | Open menu / Back | Opens main menu from main view, closes modals |
| `d` | Toggle debug | Shows debug logs |

### View Shortcuts

| Key | View | Toggle |
|-----|------|--------|
| `a` | Announcements | Press again or ESC to close |
| `u` | Units | Press again or ESC to close |
| `b` | Buildings | Press again or ESC to close |
| `z` | Stocks | Press again or ESC to close |

### Menu Navigation

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate menu items |
| `Enter` | Select item |
| `1-4` | Quick select menu item |
| `Esc` | Close menu (Resume) |

### Removed Global Shortcuts

The following are now only accessible via the Esc menu:
- `q` - Quit (prevents accidental fortress abandonment)
- `s` - Save (use menu or auto-save)

---

## Modal Views

### Main Menu (`Esc`)

```
┌─ MENU ─────────────────────┐
│ ► Resume                   │
│   Settings                 │
│   Save                     │
│   Quit                     │
└────────────────────────────┘
```

Navigation: `↑/↓` to select, `Enter` to activate, `Esc` to close.

### Announcements View (`a`)

Full scrollable event history with tick timestamps, color-coded by type:
- `success` (green): Positive events
- `warning` (yellow): Caution events
- `danger` (red): Critical events
- `info` (white): Neutral events

### Units View (`u`)

Two-mode view: List and Detail.

#### List Mode

```
┌─ UNITS ────────────────────────────────────────────────────────┐
│ Dwarf Roster (7/7 alive)                                       │
│    Name          Labor      Pos    Task           Happy        │
│ ────────────────────────────────────────────────────────────── │
│ ► Urist McDigger mining     12,5   digging         52          │
│   Kol Stonebeard carpentry   8,3   idle            48          │
│   Domas Ironhelm brewing     5,7   producing       61 ★        │
│   ...                                                          │
├────────────────────────────────────────────────────────────────┤
│ ↑/↓ select | Enter details | [u] close | [Space] pause         │
└────────────────────────────────────────────────────────────────┘
```

- Shows happiness instead of H/T/E (detailed needs in detail view)
- `►` selector highlights current dwarf
- `↑/↓` to navigate selection
- `Enter` to view details
- `★` indicates legendary status
- `[mood]` badge for dwarves in strange moods

#### Detail Mode

```
┌─ UNIT: Urist McDigger ─────────────────────────────────────────┐
│ Alive | mining | Pos: 12,5 | ★ Legendary                       │
│ ────────────────────────────────────────────────────────────── │
│ Needs                                                          │
│ Hunger:    ████████░░░░░░░░░░░░ 42                             │
│ Thirst:    ██████████████░░░░░░ 68                             │
│ Energy:    ██░░░░░░░░░░░░░░░░░░ 89                             │
│ Happiness: ██████████░░░░░░░░░░ 52                             │
│                                                                │
│ Personality                                                    │
│ Base Happiness: 54 | Resilience: 1.12 | Empathy: 0.89          │
│                                                                │
│ Thoughts (3)                                                   │
│ • -30: witnessed Kol's death (x2)                              │
│ • +15: quenched their thirst                                   │
│ • +5: is well fed                                              │
├────────────────────────────────────────────────────────────────┤
│ ←/→ prev/next dwarf | Enter/Esc back to list | [u] close       │
└────────────────────────────────────────────────────────────────┘
```

- Visual bars for all needs (color-coded: green/yellow/red)
- Personality traits with color coding:
  - Resilience: green if >1, red if <1
  - Empathy: magenta if >1, blue if <1
- Full list of active thoughts with modifiers
- `←/→` to browse other dwarves without returning to list
- `Enter` or `Esc` to return to list view

### Buildings View (`b`)

Structure list showing:
- Type, Subtype, Position, Status
- Building status: `producing`, `idle`, `building`
- Claimed status for mood-related claims

### Stocks View (`z`)

Resource bars and statistics:
- Wood, Stone, Food, Drink with visual bars
- Building list
- Wealth, Peak Population, Artifacts, Mood statistics

### Settings View

Accessed via menu:
- Color mode toggle (normal/colorblind)
- `←/→` or `Enter` to toggle

---

## Visual Design

### Fortress Name

- White text on blue background for emphasis

### Tree Rendering

- Uses `♣` character instead of `^`
- Alternates between `green` and `greenBright` based on position

### Water Rendering

- Alternates between `cyan` and `cyanBright` for wave effect

### Dig Designation

- Shows wall `#` with gray background and yellow text
- More subtle than previous `d` character replacement

### Alternating Row Shading

- Even rows use `dimColor` for depth perception

### Selection Highlighting

- Selected items use `inverse` attribute (white on colored background)
- `►` selector character indicates current selection

---

## Color Palette

| Element | Color | Notes |
|---------|-------|-------|
| Happy dwarf | `cyan` | ☺ |
| Neutral dwarf | `yellow` | ○ |
| Sad dwarf | `red` | ☹ |
| Wall | `gray` | # |
| Floor | `white` | . |
| Tree | `green`/`greenBright` | ♣ (alternating) |
| Water | `cyan`/`cyanBright` | ~ (alternating) |
| Workshop | `magenta` | X |
| Farm | `green` | % |
| Corpse | `red` | † |
| Dig designation | `yellow` on `gray` bg | # |
| Mood dwarf | `magenta` | M |
| Happiness (high) | `green` | ≥50 |
| Happiness (mid) | `yellow` | 30-49 |
| Happiness (low) | `red` | <30 |
| Positive thought | `green` | +modifier |
| Negative thought | `red` | -modifier |

---

## Event Log

- Shows last 5 events at bottom of main view
- Full history available in Announcements view
- Production messages (still/farm) suppressed to reduce spam

---

## Sidebar Layout

Keys at top, Legend below:
1. KEYS section with full command words
2. Auto-save/Debug status indicators
3. LEGEND section with colored symbols

---

## Files Modified

| File | Changes |
|------|---------|
| `canvas/src/scenarios/fortress/types.ts` | Added `ViewMode` type, `topThoughts` to DwarfStatus |
| `canvas/src/canvases/fortress.tsx` | Modal system, keyboard handling, units view with detail mode |
| `canvas/src/canvases/fortress/colors.ts` | Shared color constants |
| `canvas/src/lib/fortress-sim/map.ts` | Tree character `♣` |
| `canvas/src/lib/fortress-sim/thoughts.ts` | getTopThoughts for UI display |

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Main menu (Esc) | ✅ Implemented | Resume/Settings/Save/Quit |
| View modals | ✅ Implemented | a/u/b/z toggles |
| Space to pause | ✅ Implemented | DF-style |
| Units list view | ✅ Implemented | Selection, happiness display |
| Units detail view | ✅ Implemented | Needs, personality, thoughts |
| Detail navigation | ✅ Implemented | ←/→ to browse dwarves |
| Safe quit | ✅ Implemented | Only via menu |
| Color modes | ✅ Implemented | Normal/colorblind |
| Auto-save | ✅ Implemented | On pause/quit |
