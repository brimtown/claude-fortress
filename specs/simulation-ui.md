---
title: Simulation UI
date: 2026-01-18
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
│ - ~ for water (cyan)                     │  │ [z] stocks [p] pause       │
│ - # with gray bg = dig designation       │  │ [s] save   [d] debug       │
│                                          │  │ [q] quit   [ESC] back      │
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
│ • Urist McDigger completed digging                                           │
│ • Kol Stonebeard assigned to mining                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Modal Views

### Keyboard Shortcuts

| Key | View | Toggle |
|-----|------|--------|
| `a` | Announcements | Press again or ESC to close |
| `u` | Units | Press again or ESC to close |
| `b` | Buildings | Press again or ESC to close |
| `z` | Stocks | Press again or ESC to close |
| `p` | Pause/unpause | N/A |
| `s` | Manual save | N/A |
| `d` | Toggle debug logs | N/A |
| `q` | Quit | N/A |
| `ESC` | Return to main from any modal | N/A |

### Announcements View (`a`)

Full scrollable event history with tick timestamps, color-coded by type:
- `success` (green): Positive events
- `warning` (yellow): Caution events
- `danger` (red): Critical events
- `info` (white): Neutral events

### Units View (`u`)

Dwarf roster table showing:
- Name, Labor, Position, Task
- H/T/E (Hunger/Thirst/Energy) as integers
- Mood state indicators
- Legendary status (★)

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

## Visual Improvements

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

## Event Log

- Shows last 5 events at bottom of main view
- Full history available in Announcements view
- Production messages (still/farm) suppressed to reduce spam

## Sidebar Layout

Keys at top, Legend below:
1. KEYS section with full command words
2. Auto-save/Debug status indicators
3. LEGEND section with colored symbols

## Balance Tuning (Phase 1)

### Needs Rates
- Hunger: 0.3/tick (~330 ticks to starve)
- Thirst: 0.5/tick (~200 ticks to dehydrate)

### Mining Speed
- 12 progress/tick (~8 ticks per tile)

### Starting Resources
- Wood: 20
- Stone: 20
- Food: 100
- Drink: 15

### Tantrum/Berserk
- Tantrum threshold: happiness < 15 (was < 20)
- Tantrum chance: 0.05%/tick (was 0.5%)
- Strange mood frequency: 0.01%/tick (was 0.05%)
- Mood deadline: 600 ticks (~5 min, was 200)

## Files Modified

| File | Changes |
|------|---------|
| `canvas/src/scenarios/fortress/types.ts` | Added `ViewMode` type with "buildings", `debug` config |
| `canvas/src/canvases/fortress.tsx` | Modal system, keyboard handling, color updates, layout |
| `canvas/src/canvases/fortress/colors.ts` | Shared color constants (new file) |
| `canvas/src/lib/fortress-sim/map.ts` | Tree character `♣` |
| `canvas/src/lib/fortress-sim/save.ts` | Silent mode option |
| `canvas/src/lib/fortress-sim/engine.ts` | Tantrum balance |
| `canvas/src/lib/fortress-sim/dwarf.ts` | Needs rate balance |
| `canvas/src/lib/fortress-sim/moods.ts` | Mood frequency/deadline balance |
| `canvas/src/lib/fortress-sim/jobs.ts` | Mining speed, production message removal |
| `canvas/src/lib/fortress-sim/resources.ts` | Starting drink lowered |
| `canvas/src/lib/screenshot.ts` | Bright color variants, tree character |
