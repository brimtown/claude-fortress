# Claude Fortress - Developer Notes

**Last Updated**: 2026-01-08
**Status**: ✅ WORKING - Movement, jobs, IPC queries, autonomous debugging, improved dig command!

## 🚀 Quick Start for New Sessions

**Get running in 30 seconds:**

```bash
# 1. Navigate to canvas directory (from repo root)
cd canvas

# 2. Clean up any old processes
pkill -f "canvas-fortress"; rm -f /tmp/canvas-*.sock

# 3. Spawn a fortress
bun run src/cli.ts spawn fortress --config='{"fortressName":"DevSession","save":false}'

# 4. Verify it's running (wait 2-3 seconds for socket)
ls /tmp/canvas-fortress-1.sock

# 5. Query state to see what's happening
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | python3 -m json.tool

# 6. Send a dig command to test
echo '{"type":"command","command":{"type":"dig","area":{"x":12,"y":2,"width":5,"height":3}}}' | nc -U /tmp/canvas-fortress-1.sock

# 7. Check miners are working
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'Jobs: {len(d[\"jobs\"])}, Workers: {len([dw for dw in d[\"dwarves\"] if dw.get(\"currentJob\")])}');"
```

**You should see:** Fortress in tmux pane, miners walking to dig sites, tiles changing from `#` to `.`, stone resource increasing.

## 🔍 IPC Query System (PRIMARY DEBUGGING TOOL)

**This is how you debug without screenshots!**

### Quick Queries

```bash
# Get lightweight summary (RECOMMENDED - fits in buffer)
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | python3 -m json.tool

# Full state with map (WARNING: 8KB+, may truncate)
echo '{"type":"getState"}' | nc -U /tmp/canvas-fortress-1.sock

# Check specific things
echo '{"type":"getSummary"}' | nc ... | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'Tick: {d[\"tick\"]}')
print(f'Jobs: {len(d[\"jobs\"])} pending')
print(f'Workers: {len([dw for dw in d[\"dwarves\"] if dw.get(\"currentJob\")])} active')
print(f'Stone: {d[\"resources\"][\"stone\"]}')
"
```

### What getSummary Returns

```json
{
  "type": "state",
  "data": {
    "tick": 123,
    "year": 251,
    "season": "Spring",
    "resources": {"wood": 20, "stone": 45, "food": 85, "drink": 57},
    "dwarves": [{
      "id": 0,
      "name": "Urist McDigger",
      "x": 5, "y": 3,
      "labor": "mining",
      "hunger": 45, "thirst": 52, "happiness": 65,
      "currentJob": {"type": "dig", "x": 12, "y": 5, "progress": 60}
    }],
    "jobs": [{"type": "dig", "x": 12, "y": 5, "progress": 60, "assignedDwarfId": 0}],
    "buildings": [],
    "events": [{"message": "Designated 5 tiles for mining", ...}]
  }
}
```

### Debugging Workflow

```bash
# 1. Send a command
echo '{"type":"command","command":{"type":"dig",...}}' | nc -U /tmp/canvas-fortress-1.sock

# 2. Immediately verify it worked
echo '{"type":"getSummary"}' | nc ... | grep jobs
# Expected: Should show new jobs created

# 3. Wait a few ticks, check progress
sleep 5 && echo '{"type":"getSummary"}' | nc ... | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
for job in d['jobs'][:5]:
    print(f'Job at ({job[\"x\"]},{job[\"y\"]}): {job[\"progress\"]}% complete')
"

# 4. Debug why miners aren't working
echo '{"type":"getSummary"}' | nc ... | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
for dw in d['dwarves']:
    if dw.get('currentJob'):
        job = dw['currentJob']
        print(f'{dw[\"name\"]}: at ({dw[\"x\"]},{dw[\"y\"]}) working on ({job[\"x\"]},{job[\"y\"]})')
"
```

**Key insight:** You can now verify every change programmatically instead of asking for screenshots!

## 🎉 What We Built

A fully functional Dwarf Fortress simulation for Claude Code using the canvas plugin system:
- **Fortress Canvas**: Real-time ASCII fortress display in tmux pane
- **Simulation Engine**: Game loop with dwarves, resources, needs, events, random migrants
- **IPC Command System**: Claude can send commands (dig, build, assign) to control the fortress
- **Save/Load**: Auto-saves every 10 ticks to `~/.claude/fortress-saves/`
- **Claude Code Skill**: Natural language → fortress commands translation

## 📂 Key Files

### Canvas Implementation
```
canvas/src/
├── canvases/fortress.tsx          - Main UI component (React/Ink)
├── scenarios/fortress/
│   ├── types.ts                   - Type definitions (FortressState, Commands, etc.)
│   └── simulation.ts              - Scenario registration
├── lib/fortress-sim/
│   ├── engine.ts                  - Game loop, tick processing, command handler
│   ├── map.ts                     - Procedural map generation (40x20 grid)
│   ├── dwarf.ts                   - Dwarf entities, needs, name generation
│   ├── resources.ts               - Resource tracking & building costs
│   ├── events.ts                  - Event generation & messages
│   └── save.ts                    - Save/load to ~/.claude/fortress-saves/
└── terminal.ts                    - **IMPORTANT**: Tmux spawn logic (wrapper script approach)
```

### Claude Code Skill
```
~/.claude/skills/claude-fortress/
├── SKILL.md                       - Skill definition, spawn commands, IPC examples
└── (copy from canvas/skills/claude-fortress/)
```

## 🔧 How It Works

### 1. Spawning the Fortress
```bash
cd canvas  # from repo root
bun run src/cli.ts spawn fortress --config='{"fortressName":"ClawdeFort","save":true}'
```

**What happens:**
1. `terminal.ts` creates a wrapper script at `/tmp/canvas-spawn-fortress-1.sh`
2. Wrapper script contains the full `bun run` command with config
3. Tmux splits window and runs the wrapper script
4. Canvas loads, creates IPC socket at `/tmp/canvas-fortress-1.sock`
5. Simulation starts ticking every 500ms

### 2. Sending Commands
```bash
echo '{"type":"command","command":{"type":"dig","area":{"x":15,"y":5,"width":10,"height":5}}}' | nc -U /tmp/canvas-fortress-1.sock
```

**Command types:**
- `dig`: Designate mining area (adds stone to resources)
- `build`: Construct workshop/stockpile/bed (costs resources)
- `assign`: Change dwarf's labor
- `pause`: Pause/resume simulation
- `save`: Trigger manual save

### 3. IPC Flow
```
Claude Code (nc command)
    ↓
Unix Socket (/tmp/canvas-fortress-1.sock)
    ↓
FortressCanvas IPC Server (fortress.tsx useEffect)
    ↓
handleCommand (engine.ts)
    ↓
setState (React state update)
    ↓
Fortress renders with new state
```

## 🐛 Known Issues & Quirks

### CRITICAL: Tmux Spawn Wrapper Script Fix (UPDATED 2026-01-08)
**Issue 1**: Originally tried passing command directly to tmux - failed!
**Solution**: Create wrapper shell script at `/tmp/canvas-spawn-{id}.sh`
**Location**: `canvas/src/terminal.ts` lines 92-120

**Issue 2**: Passing wrapper script directly to `split-window` command caused "Raw mode not supported" error
**Root Cause**: When tmux executes command directly in split-window, stdin isn't attached properly for Ink
**Solution**: Create empty pane FIRST, THEN send command via send-keys
```typescript
// ❌ WRONG - Raw mode error
spawn("tmux", ["split-window", "-h", "-p", "67", wrapperScript]);

// ✅ CORRECT - Create pane, then send command
spawn("tmux", ["split-window", "-h", "-p", "67", "-P", "-F", "#{pane_id}"]);
// Then:
spawn("tmux", ["send-keys", "-t", paneId, `bash ${wrapperScript}`, "Enter"]);
```

**Issue 3**: Event ID duplicate keys crash React on save/load
**Root Cause**: `nextEventId` counter resets to 0 on load while saved events have IDs in the thousands
**Solution**: Added `restoreEventIdCounter()` in `events.ts`, called on load in `fortress.tsx:45`
**Location**: `canvas/src/lib/fortress-sim/events.ts` lines 8-13, `fortress.tsx` line 45

### Rendering Issues
- **Unicode dwarves (☺)** sometimes render as dots depending on terminal font
- **Map overwrites itself** in some terminal configs - this is Ink's raw mode requirement
- Works best in iTerm2 with proper Unicode font support

### IPC Socket Creation Timing
- Socket takes ~1-2 seconds to create after spawn
- Check with: `ls -la /tmp/canvas-fortress-1.sock`
- If missing, fortress crashed on startup (check React errors)

### Save File Location
- Saves go to `~/.claude/fortress-saves/`
- Filename: sanitized fortress name (e.g., `ClawdeFort.json`)
- Auto-saves every 10 ticks (5 seconds real-time)
- Also saves on 's' key press and on exit (q)

### Dwarves Don't Move
- MVP simplification: dwarves stay in starting positions
- They still consume food/drink and have needs
- Position (x,y) exists in state but not updated
- **TODO**: Add simple movement AI

### Dig Command Improvements (FIXED 2026-01-08)
**Problem**: Previously, dig commands only created jobs for wall tiles adjacent to existing floors. This caused:
- Silent failures when designating large areas
- Confusing behavior where commands seemed to do nothing
- Users had to designate areas incrementally as they dug

**Solution Implemented**:
- **Designation Phase**: ALL wall tiles in the designated area get jobs created (like real Dwarf Fortress!)
- **Assignment Phase**: Dwarves only work on accessible tiles (adjacent to existing floors)
- **Progressive Excavation**: As dwarves dig, more tiles become accessible naturally
- **Better Feedback**: Clear event messages for success, already-designated, or invalid areas

**Code Changes**:
- `engine.ts`: Removed accessibility check from `handleDigCommand()`, added better feedback messages
- `jobs.ts`: Added `isJobAccessible()` check to `findJobForDwarf()` for smarter job assignment
- Jobs are created eagerly, assigned intelligently

**Result**: You can now designate entire halls/rooms at once, and dwarves will dig from the outside in!

## ✅ What's Working

- ✅ Fortress spawns reliably in tmux pane
- ✅ IPC socket created and listening
- ✅ Commands sent via `nc` work perfectly
- ✅ Dig command with smart job assignment (designate large areas, dwarves dig from outside in!)
- ✅ Build command deducts resources (untested but code exists)
- ✅ Auto-save every 10 ticks
- ✅ Load from save on restart
- ✅ Migrant waves (1% chance per tick)
- ✅ Season progression (every 300 ticks)
- ✅ Resource consumption (dwarves eat/drink)
- ✅ Happiness system based on needs
- ✅ Event log with DF-style messages

## ⚡ Dev Workflow - Fast Iteration Cycle

**The workflow that emerged from this session:**

```bash
# 1. Make code changes in your editor (Bun hot-reloads TypeScript!)

# 2. Kill current fortress
pkill -f "canvas-fortress"  # Or press 'q' in fortress pane

# 3. Respawn immediately (reuses tmux pane)
/usr/local/bin/tmux send-keys -t %29 "bash /tmp/canvas-spawn-fortress-1.sh" Enter

# 4. Verify it worked
sleep 2 && ls /tmp/canvas-fortress-1.sock  # Socket exists?

# 5. Test your changes with IPC
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | python3 -m json.tool

# 6. Send commands to test behavior
echo '{"type":"command","command":{"type":"dig","area":{"x":12,"y":2,"width":5,"height":3}}}' | nc -U /tmp/canvas-fortress-1.sock

# 7. Query again to verify
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | grep jobs
```

**Key insights:**
- No need to kill tmux pane, just the process
- Wrapper script stays at `/tmp/canvas-spawn-fortress-1.sh`
- Socket recreates automatically
- Query immediately after commands to debug
- Cycle time: ~5 seconds from code change to verification

## 📝 Feature TODOs & Future Work

### 🎯 Skill System (High Priority)
Make this a proper Claude Code skill instead of raw bash commands:

- [ ] **Skill command wrappers** - `/dig 15 8 5 5` instead of JSON blobs
  - `/dig <x> <y> <width> <height>` - Designate dig area
  - `/build <type> <x> <y>` - Build workshop/bed/stockpile
  - `/assign <dwarf> <labor>` - Change dwarf's job
  - `/query` - Show fortress status (calls getSummary)
  - `/pause` / `/unpause` - Control simulation
- [ ] **Natural language parsing** - "Dig out a 10x10 hall at coordinates 15,8"
- [ ] **Skill help system** - `/fortress help` shows available commands
- [ ] **Error feedback** - Nice error messages instead of failed nc calls
- [ ] **Command history** - Track what commands were sent for debugging

### 🎨 Visual Improvements (Medium Priority)
Make the fortress prettier and easier to read:

- [ ] **Color-coded tiles** - Different colors for different tile types
  - Walls: dark gray
  - Floor: light gray
  - Designated tiles: yellow `d`
  - Water: blue `~`
  - Trees: green `^`
  - Ore veins: colored by type (gold=yellow, iron=gray)
- [ ] **Dwarf indicators** - Show what dwarves are doing
  - `☼` = working on job
  - `☺` = idle/walking
  - `≈` = eating/drinking
  - Color by mood (happy=green, unhappy=red)
- [ ] **Progress bars** - Show job completion visually
  - `[####....] 40%` next to active jobs
- [ ] **Mini-map** - Small overview showing full fortress layout
- [ ] **Event log colors** - Color events by type (success=green, danger=red)
- [ ] **Resource trend indicators** - ↑↓ arrows showing resource changes

### 🏗️ Fun Subsystems to Flesh Out
Core gameplay mechanics that would make it feel more like DF:

- [ ] **Death system** - Dwarves actually die from starvation/dehydration
  - Corpses appear on map (`X`)
  - Ghost haunting chance if unhappy death
  - Memorial engravings for legendary dwarves
- [ ] **Workshop production** - Workshops actually produce items over time
  - Still produces drink from plants
  - Carpenter produces beds/barrels from wood
  - Smelter produces metal bars from ore
  - Production jobs assigned like dig jobs
- [ ] **Hauling system** - Items need to be moved to stockpiles
  - Resources have locations on map
  - Haulers pathfind to pick up and deliver
  - Stockpiles show inventory counts
- [ ] **Room system** - Rooms have quality ratings
  - Bedrooms assigned to dwarves
  - Dining halls for eating
  - Room quality affects happiness
- [ ] **Needs beyond hunger/thirst** - More dwarf personality
  - Sleep (need beds)
  - Alcohol preference (unhappy without drink)
  - Socialization (need dining halls/meeting areas)
  - Art appreciation (engravings, statues)
- [ ] **Military basics** - Defense against threats
  - Squads of soldier dwarves
  - Training grounds
  - Equipment (weapons/armor)
  - Simple goblin sieges (narrative events)
- [ ] **Z-levels** - Multiple floors
  - Stairs/ramps to connect levels
  - Surface, underground, caverns
  - Different resources per depth
- [ ] **Temperature/Seasons** - Environmental effects
  - Rivers freeze in winter
  - Crops grow in spring/summer
  - Magma for forges (deep levels)

### 🛠️ Technical Improvements (Low Priority)
Infrastructure and quality of life:

- [ ] **Faster pathfinding** - A* instead of simple adjacency
- [ ] **Tick rate controls** - Speed up/slow down simulation
- [ ] **Faster save/load** - Compress saves, lazy load map
- [ ] **Multiple fortress management** - Run several fortresses simultaneously
- [ ] **Replay system** - Record and playback fortress history
- [ ] **Web dashboard** - View fortress in browser alongside CLI
- [ ] **Automated testing** - Unit tests for job system, pathfinding, etc.
- [ ] **Performance profiling** - Optimize tick processing for larger fortresses

### 🎭 Narrative & Storytelling
Features that enhance emergent stories:

- [ ] **Dwarf relationships** - Friends, rivals, marriages
- [ ] **Personality traits** - Lazy, hardworking, artistic, violent
- [ ] **Legendary artifacts** - Rare masterwork creations
- [ ] **Historical events** - Track fortress timeline
- [ ] **Engraved records** - Dwarves carve history into walls
- [ ] **Tavern visitors** - Bards, merchants, performers
- [ ] **Strange moods** - Dwarves create artifacts or go berserk

## 🎯 How to Resume Development

### Starting Fresh Session
1. **Navigate to canvas dir**: `cd canvas` (from repo root)
2. **Ensure Bun installed**: `bun --version`
3. **Sync skill to user dir** (required for Claude Code to find it):
   ```bash
   mkdir -p ~/.claude/skills/claude-fortress
   cp canvas/skills/claude-fortress/SKILL.md ~/.claude/skills/claude-fortress/SKILL.md
   ```
4. **Clean up any orphaned processes**: `pkill -9 -f "canvas-fortress"; rm -f /tmp/canvas-*.sock /tmp/claude-canvas-pane-id`
5. **Test spawn**: `bun run src/cli.ts spawn fortress --config='{"fortressName":"Test","save":false}'`
6. **Verify pane appeared**: You should see a new tmux pane split to the right (67% width)
7. **Check socket created** (after 2-3 seconds): `ls -la /tmp/canvas-fortress-1.sock`
8. **Test CLI query**: `bun run src/cli.ts query fortress-1`

### Skill Development Note
The skill file lives in two places:
- **Source**: `canvas/skills/claude-fortress/SKILL.md` (in repo, edit this one)
- **Active**: `~/.claude/skills/claude-fortress/SKILL.md` (Claude Code reads from here)

After editing the skill, sync it:
```bash
cp canvas/skills/claude-fortress/SKILL.md ~/.claude/skills/claude-fortress/SKILL.md
```

Or create a symlink for auto-sync (replace with your actual repo path):
```bash
rm -rf ~/.claude/skills/claude-fortress
ln -s /path/to/claude-fortress/canvas/skills/claude-fortress ~/.claude/skills/claude-fortress
```

### Debugging Spawn Issues
If fortress doesn't appear:
```bash
# 1. Check if pane was created
/usr/local/bin/tmux list-panes | wc -l  # Should increase by 1

# 2. Check saved pane ID
cat /tmp/claude-canvas-pane-id

# 3. Check if wrapper script exists and is valid
cat /tmp/canvas-spawn-fortress-1.sh

# 4. Manually run wrapper to see errors
bash /tmp/canvas-spawn-fortress-1.sh

# 5. Check for orphaned processes holding sockets
lsof /tmp/canvas-fortress-1.sock
ps aux | grep fortress | grep -v grep

# 6. Nuclear cleanup
pkill -9 -f "canvas-fortress"
rm -f /tmp/canvas-*.sock /tmp/canvas-spawn-*.sh /tmp/claude-canvas-pane-id
```

### zsh tmux Plugin Interference
**Issue**: If `which tmux` shows `tmux: aliased to _zsh_tmux_plugin_run`, some commands may fail
**Solution**: Use full path `/usr/local/bin/tmux` or `/opt/homebrew/bin/tmux` for debugging
```bash
# Find real tmux binary
command -v tmux
/usr/bin/which -a tmux

# Use full path for debugging
/usr/local/bin/tmux list-panes
/usr/local/bin/tmux capture-pane -t %26 -p
```

### Quick Iteration Loop
When developing new features, use this workflow:
```bash
# 1. Make code changes in your editor

# 2. Kill current fortress (press 'q' in fortress pane, or:)
pkill -f "canvas-fortress"

# 3. Respawn immediately (code reloads automatically with Bun)
bun run src/cli.ts spawn fortress --config='{"fortressName":"DevTest","save":false}'

# 4. Test your changes by sending commands
echo '{"type":"command","command":{"type":"dig","area":{"x":15,"y":8,"width":5,"height":5}}}' | nc -U /tmp/canvas-fortress-1.sock

# 5. Watch the fortress pane to see results
```

**Pro tip**: No need to restart - Bun hot-reloads TypeScript changes! Just kill and respawn.

**Testing with saves**:
```bash
# Create a test fortress with save enabled
bun run src/cli.ts spawn fortress --config='{"fortressName":"SaveTest","save":true}'

# Let it run for a bit (migrants, resource consumption, etc.)
# Then kill with 'q' (auto-saves on exit)

# Reload to test save/load
bun run src/cli.ts spawn fortress --config='{"fortressName":"SaveTest","save":true}'

# Should resume with same tick, dwarves, resources
```

### Testing Build Command
```bash
# Need to test if this actually works:
echo '{"type":"command","command":{"type":"build","structure":"workshop","subtype":"still","location":{"x":5,"y":5}}}' | nc -U /tmp/canvas-fortress-1.sock
```
Expected:
- Resources decrease (10 wood, 15 stone)
- Map tile at (5,5) becomes 'X'
- Event: "still construction completed"

### Testing Assign Command
```bash
echo '{"type":"command","command":{"type":"assign","dwarfId":0,"labor":"brewing"}}' | nc -U /tmp/canvas-fortress-1.sock
```
Expected:
- Dwarf 0's labor changes to "brewing"
- Event: "{name} assigned to brewing"

## 🔑 Key Design Decisions

### Why Wrapper Scripts?
Tmux's `spawn` doesn't handle complex shell strings well. Creating a temp script at `/tmp/canvas-spawn-{id}.sh` ensures the command executes exactly as written.

### Why nc Instead of send-command.ts?
The send-command.ts utility works but `nc -U` is simpler and more direct. Keep both - nc for development, send-command for production use.

### Why 500ms Tick Rate?
- Fast enough to feel alive
- Slow enough Claude can narrate
- 2 ticks/second = manageable event rate
- User can see changes happening

### Why Auto-Save Every 10 Ticks?
- 10 ticks = 5 seconds real-time
- Frequent enough to not lose much progress
- Infrequent enough to not hammer disk
- Bun's async file I/O makes it cheap

## 🎨 Simulation Mechanics Summary

### Dwarf Needs (per tick)
- Hunger: +0.5/tick (critical at 90+)
- Thirst: +0.7/tick (critical at 90+)
- Energy: -0.3/tick when working, +0.5/tick when idle

### Resource Consumption
- Dwarf eats: -1 food (when hunger >90)
- Dwarf drinks: -1 drink (when thirst >90)
- Mining: +1 stone per tile dug
- Building workshop: -10 wood, -15 stone

### Random Events
- Migrant wave: 1% chance per tick (1-3 dwarves)
- Resource warning: Every 100 ticks if food/drink <20
- Season change: Every 300 ticks

### Map Generation
- 40x20 grid (fits most terminals)
- Starting area: (1,1) to (12,8) pre-dug
- 8 random trees on right side
- 3x3 water pond
- 5 random ore deposits (iron, gold, copper)

## 🚨 Common Errors & Fixes

### "Raw mode is not supported"
**Cause**: Running via background Bash or non-interactive terminal
**Fix**: Must run in actual tmux pane with interactive stdin

### Socket file not created
**Cause**: Fortress crashed on startup (likely React error)
**Fix**: Check console output, ensure Bun/React deps installed

### Pane closes immediately
**Cause**: Wrapper script has syntax error or can't find bun
**Fix**: Test wrapper script manually: `/tmp/canvas-spawn-fortress-1.sh`

### Command doesn't work
**Cause**: Socket doesn't exist or wrong path
**Fix**: Verify socket exists, check fortress is still running

## 🎓 What We Learned

1. **Tmux spawn is finicky** - wrapper scripts are the way
2. **IPC sockets are fast** - sub-millisecond command delivery
3. **React/Ink works great** for terminal UIs
4. **Bun is amazing** - fast startup, native TypeScript
5. **DF mechanics are emergent** - even simplified version creates stories
6. **Save/load is crucial** - users want persistent fortresses
7. **Natural language → commands** is way better than traditional DF UI!

## 💡 Future Vision

### State Subscription
Add IPC endpoint for Claude to READ state:
```bash
echo '{"type":"getState"}' | nc -U /tmp/canvas-fortress-1.sock
# Returns: {"type":"state","data":{...full FortressState...}}
```
This lets Claude narrate without save files!

### Multi-Fortress
Support multiple simultaneous fortresses:
- Different socket paths per fortress
- Canvas skill tracks active fortress
- Switch between them: "Show me Irondeep" vs "Show me ClawdeFort"

### Collaboration Mode
Multiple Claudes commanding same fortress:
- Shared socket, multiple clients
- Event broadcast to all watchers
- Chaos ensues (in a fun way)

## 📊 Stats & Metrics

**Initial Development**: ~4 hours (2026-01-08, 11:00 PM - 3:30 AM)
**Bug Fix Session**: ~1 hour (2026-01-08, 11:30 PM - 12:30 AM)
**Lines of Code**: ~2500 (canvas + skill)
**Files Created**: 14
**Critical Bugs Fixed**: 9
  - tmux spawn wrapper script issues (2 fixes)
  - React duplicate keys from event IDs
  - Raw mode stdin attachment issue
**Fortresses Embarked**: 6+ (Test, ClawdeFort, FinalTest, AutoTest, QuickTest, DevTest)
**Migrants Arrived**: 8+ (ClawdeFort had 3 waves!)
**Commands Sent**: 5+ (dig, pause, build attempts - all working!)
**Max Fortress Survival**: Year 252 (ClawdeFort - RIP)

## 🙏 Acknowledgments

This was a collaboration between human creativity and AI implementation. The idea was brilliant, the execution was a team effort, and the result is genuinely fun to use.

**Strike the earth!** ⚒️

---

## Quick Reference Commands

```bash
# Spawn fortress (from repo root)
cd canvas
bun run src/cli.ts spawn fortress --config='{"fortressName":"NAME","save":true}'

# Send commands
echo '{"type":"command","command":{"type":"dig","area":{"x":15,"y":5,"width":10,"height":5}}}' | nc -U /tmp/canvas-fortress-1.sock
echo '{"type":"command","command":{"type":"pause","paused":true}}' | nc -U /tmp/canvas-fortress-1.sock

# Check status
ls -la /tmp/canvas-fortress-1.sock
ls -la ~/.claude/fortress-saves/
cat ~/.claude/fortress-saves/ClawdeFort.json | head -50

# Kill fortress
# In fortress pane: press 'q'
```
