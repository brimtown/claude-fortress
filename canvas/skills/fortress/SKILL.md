---
name: fortress
description: Control and monitor a Dwarf Fortress simulation in a side panel with slash commands
---

# Fortress Skill

Control and monitor a dwarf fortress simulation running in a tmux side panel. Issue strategic commands via slash syntax and watch your fortress grow!

## Quick Start

```
User: "Start a fortress called IronDeep"
Claude: [Spawns fortress in tmux pane]

User: "/dig 15 8 10 5"
Claude: [Designates 10x5 mining area, dwarves start digging]

User: "/query"
Claude: [Shows stone: 45, jobs: 12, events: migrants arrived]
```

## Slash Commands

### /dig <x> <y> <width> <height>

Designate a rectangular mining area. Dwarves will dig from accessible edges inward, progressively excavating the entire area.

**Examples**:
- `/dig 15 8 10 5` - Dig 10x5 hall starting at (15,8)
- `/dig 20 3 8 8` - Dig 8x8 great hall

**Notes**:
- Coordinates validated (map is 40x20: x∈[0-39], y∈[0-19])
- Only wall tiles create jobs
- Dwarves work on accessible tiles first (adjacent to existing floors)
- As they dig, more tiles become accessible

### /build <type> <x> <y> [subtype]

Construct a building at the specified location.

**Types**: `workshop`, `stockpile`, `bed`
**Workshop subtypes**: `still`, `carpenter`, `smelter`

**Examples**:
- `/build workshop 10 12 still` - Build still workshop at (10,12)
- `/build bed 15 8` - Place bed at (15,8)
- `/build stockpile 20 5` - Create stockpile

**Requirements**:
- Location must be dug floor (not wall/water/tree)
- Sufficient resources (workshops: 10 wood + 15 stone)
- Validates before sending

### /assign <dwarf_id> <labor>

Change a dwarf's labor assignment.

**Labors**: `mining`, `carpentry`, `brewing`, `farming`, `hauling`

**Examples**:
- `/assign 0 mining` - Make dwarf #0 a miner
- `/assign 3 carpentry` - Assign dwarf #3 to carpentry

**Notes**:
- Dwarf IDs shown in `/query dwarves`
- Validates dwarf ID exists

### /query [detail_level]

Show fortress status.

**Detail levels**:
- `quick` (default) - Lightweight summary: resources, jobs, recent events
- `full` - Complete state with full map
- `dwarves` - Dwarf list with names, positions, jobs, needs
- `jobs` - Active job queue with progress

**Examples**:
- `/query` - Quick summary
- `/query full` - Full state dump
- `/query dwarves` - See all dwarves

**Token costs**:
- `quick`: ~200 tokens
- `full`: ~2000 tokens (includes 40x20 map)

### /pause

Toggle simulation pause. Useful for planning without time pressure.

**Example**: `/pause`

### /save

Trigger manual save (fortress also auto-saves every 10 ticks).

**Example**: `/save`

---

## Auto-Monitoring

The fortress skill includes **hyper-minimal auto-monitoring** every 10-30 seconds:

**What gets narrated** (token-efficient):
- Migrant waves (`type: success`)
- Resource warnings (`type: warning`)
- Starvation/dehydration alerts (`type: danger`)
- Ore strikes (`type: success`)
- Building completions (`type: success`)

**What doesn't** (too noisy):
- Regular job designations
- Tick updates
- Minor hunger/thirst changes

**Token budget**: ~250 tokens/poll × 3 polls/min = 750 tokens/min

**Manual override**: Use `/query` anytime for deeper inspection

---

## Map Coordinates

**Map size**: 40 columns × 20 rows
**Valid ranges**: x ∈ [0-39], y ∈ [0-19]
**Starting area** (pre-dug): (1,1) to (11,7)

**Coordinate system**:
```
       0   5   10  15  20  25  30  35  39
    0  ┌───────────────────────────────────┐
    5  │   ........#######################│
   10  │   ........#######################│
   15  │   ........#######################│
   19  └───────────────────────────────────┘
```

**Origin**: Top-left (0,0)

---

## Tile Types

| Symbol | Type | Description |
|--------|------|-------------|
| `#` | Wall | Solid stone, can be dug |
| `.` | Floor | Dug out space, walkable |
| `☺` | Dwarf | Your industrious workers |
| `^` | Tree | Harvestable for wood |
| `~` | Water | Impassable liquid |
| `X` | Workshop | Constructed building |
| `≈` | Stockpile | Resource storage |
| `=` | Bed | Sleeping quarters |

---

## Validation & Error Handling

All commands validate inputs **before** sending to fortress:

**Dig validation**:
- ✓ Coordinates in bounds [0-39, 0-19]
- ✗ "Dig coordinates (50,50) out of bounds - map is 40x20"

**Build validation**:
- ✓ Location is dug floor
- ✓ Sufficient resources available
- ✗ "Can't build at (15,8) - tile is a wall, need floor"
- ✗ "Insufficient resources: need 10 wood, have 5"

**Assign validation**:
- ✓ Dwarf ID exists
- ✓ Labor is valid enum
- ✗ "Dwarf ID 12 not found - fortress has 7 dwarves (IDs 0-6)"
- ✗ "Invalid labor 'smithing' - valid: mining, carpentry, brewing, farming, hauling"

---

## Game Mechanics Reference

### Resources
- **Stone**: Mined from walls, used for construction
- **Wood**: Chopped from trees, used for construction
- **Food**: Consumed when hunger > 90
- **Drink**: Consumed when thirst > 90

### Dwarf Needs (per tick)
- Hunger: +0.5/tick → Eats at 90+
- Thirst: +0.7/tick → Drinks at 90+
- Happiness: Affected by needs satisfaction

### Job System
- Jobs created by /dig and /build commands
- Dwarves auto-assign to jobs matching their labor
- Progress: 10% per tick (10 ticks to complete)
- Dig jobs yield +1 stone on completion

### Random Events
- **Migrant waves**: 0.1% chance/tick (1-3 new dwarves)
- **Season change**: Every 300 ticks (~2.5 min)
- **Resource warnings**: Every 100 ticks if food/drink < 20

---

## Example Workflows

### Expand Starting Area
```
/dig 12 1 8 7      # Dig eastward extension
/query              # Check progress
[Wait for mining to complete]
/dig 20 1 10 7     # Continue east
```

### Build Workshop Quarter
```
/dig 15 10 12 8    # Dig workshop floor
[Wait for floor completion]
/build workshop 16 11 still       # Still
/build workshop 20 11 carpenter   # Carpenter
/build stockpile 24 11             # Storage
```

### Assign Specialized Labor
```
/query dwarves     # See dwarf list
/assign 0 mining   # Dedicated miner
/assign 1 mining   # Another miner
/assign 2 carpentry # Carpenter
/assign 3 brewing   # Brewer
```

---

## Spawning & Management

**Spawn fortress**:
```bash
bun run src/cli.ts spawn fortress --config='{"fortressName":"IronDeep","save":true}'
```

**Configuration options**:
```typescript
interface FortressConfig {
  fortressName?: string;  // Default: random dwarf name
  seed?: number;          // Map generation seed
  save?: boolean;         // Enable auto-save (default: false)
}
```

**Socket path**: `/tmp/canvas-fortress-1.sock`

**Tmux pane**: Spawns 2/3 width split on right side

---

## Troubleshooting

**Fortress not responding**:
```bash
ls -la /tmp/canvas-fortress-1.sock  # Socket exists?
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock  # Test IPC
```

**Dwarves not working**:
- Check /query jobs - are jobs accessible (next to floors)?
- Check /query dwarves - are they hungry/thirsty (>90)?
- Use /assign to ensure miners available

**Commands failing**:
- Validation errors show immediately
- Check coordinates in [0-39, 0-19]
- Ensure resources available for builds
- Verify dwarf IDs with /query dwarves

---

## API for Developers

For programmatic access, use TypeScript API:

```typescript
import { spawnFortress, sendFortressCommand, getFortressSummary } from "./api/fortress-api";

// Spawn fortress
const socket = await spawnFortress({ fortressName: "TestFort", save: false });

// Send commands
await sendFortressCommand(socket, {
  type: "dig",
  area: { x: 15, y: 8, width: 10, height: 5 }
});

// Query state
const summary = await getFortressSummary(socket);
console.log(`Stone: ${summary.resources.stone}, Jobs: ${summary.activeJobs}`);
```

See `canvas/src/api/fortress-api.ts` for full API documentation.

---

## Token Efficiency Tips

1. **Use /query (quick) not /query full** - 10x fewer tokens
2. **Batch commands** - Issue multiple /dig before querying
3. **Let auto-poll handle updates** - Don't manually poll every second
4. **Filter events** - Auto-monitoring only reports significant events
5. **Disable monitoring if needed** - `/monitor off` (future feature)

**Typical session (30 min)**:
- Auto-polls: 90 × 250 tokens = 22,500 tokens
- Commands: 10 × 100 tokens = 1,000 tokens
- Narration: 20 × 75 tokens = 1,500 tokens
- **Total: ~25,000 tokens** (12.5% of 200k context)

---

## Advanced Patterns

### Automated Fortress Manager
Let Claude run autonomously:
```
User: "Manage the fortress for me - expand to 100 stone"
Claude:
  - Auto-designates mining areas
  - Monitors progress via auto-poll
  - Reports milestones
  - Assigns specialized labor as needed
```

### Strategic Planning
```
User: "Plan a fortress layout with great hall, bedrooms, and workshops"
Claude:
  - Designs layout on paper
  - Issues /dig commands for structure
  - Waits for completion via auto-poll
  - Issues /build commands for furnishings
```

### Crisis Response
```
[Auto-poll detects warning]
Claude: "Food running low (18 remaining). Assigning farmers."
[Issues /assign commands]
[Monitors with /query until resolved]
```
