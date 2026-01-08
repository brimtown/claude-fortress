# Claude Fortress 🏰

A Dwarf Fortress-inspired simulation for Claude Code where Claude acts as your overseer. Built on the canvas plugin system, Claude Fortress turns the famously complex fortress management game into a natural language interface.

**Note:** This is a proof of concept built in one epic session. Losing is fun! ⚒️

## What is This?

Instead of memorizing 500 hotkeys, you talk to Claude:

```
You: "Dig out a great hall 10 tiles wide"
Claude: [creates dig designations]
Miners: [pathfind to site and excavate over time]
You: [watch the fortress come alive]
```

Watch dwarves move, work, eat, drink, and (eventually) starve in glorious ASCII. The simulation runs in a tmux pane with real-time updates, emergent behavior, and persistent saves.

## Features

✅ **Real-time ASCII simulation** - Fortress updates every 500ms in tmux pane
✅ **Working job system** - Dwarves pathfind to jobs and execute them over time
✅ **Natural language commands** - Claude translates your intent to fortress actions
✅ **Emergent storytelling** - Migrants arrive, resources deplete, seasons change
✅ **Persistent saves** - Your fortress survives between sessions
✅ **IPC debugging** - Query fortress state programmatically

## Requirements

- [Bun](https://bun.sh) — TypeScript runtime
- [tmux](https://github.com/tmux/tmux) — Terminal multiplexer
- Claude Code CLI
- macOS or Linux (tested on macOS)

## Quick Start

```bash
# 1. Clone and navigate
git clone https://github.com/YOUR_USERNAME/claude-fortress.git
cd claude-fortress/canvas

# 2. Install dependencies
bun install

# 3. Spawn your first fortress
bun run src/cli.ts spawn fortress --config='{"fortressName":"MyFort","save":true}'

# 4. Watch it run in the tmux pane!
# Press 'q' to quit, 'p' to pause, 's' to save

# 5. Send commands via IPC
echo '{"type":"command","command":{"type":"dig","area":{"x":12,"y":2,"width":8,"height":5}}}' | nc -U /tmp/canvas-fortress-1.sock

# 6. Query fortress state
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock | python3 -m json.tool
```

## How It Works

1. **Canvas spawns** in a tmux pane with ASCII fortress display
2. **Simulation ticks** every 500ms - dwarves move, consume resources, work on jobs
3. **IPC commands** sent via Unix socket control the fortress
4. **Claude translates** your natural language into fortress commands
5. **Watch emergent stories** unfold as your fortress thrives or collapses

## What's Implemented (MVP)

- ✅ Dwarf movement and pathfinding
- ✅ Job system (dig, build, assign labor)
- ✅ Resource management (wood, stone, food, drink)
- ✅ Needs system (hunger, thirst, happiness)
- ✅ Migrant waves
- ✅ Season progression
- ✅ Save/load system
- ✅ Event log with DF-style messages

## What's Coming

See [DEVELOPER_NOTES.md](DEVELOPER_NOTES.md#-feature-todos--future-work) for the full roadmap:

- Death system (dwarves actually die!)
- Workshop production (brewers make drink, carpenters make beds)
- Visual improvements (colors, progress bars, better indicators)
- Skill command wrappers (`/dig` instead of JSON blobs)
- More subsystems (military, trading, z-levels)

## Architecture

```
canvas/
├── src/
│   ├── canvases/fortress.tsx    # Main UI (React/Ink)
│   ├── lib/fortress-sim/
│   │   ├── engine.ts           # Game loop
│   │   ├── jobs.ts             # Job system
│   │   ├── movement.ts         # Pathfinding
│   │   ├── dwarf.ts            # Dwarf entities
│   │   └── ...
│   └── scenarios/fortress/types.ts  # Type definitions
└── scripts/                    # Query helpers
```

## Development

See [DEVELOPER_NOTES.md](DEVELOPER_NOTES.md) for:
- Quick start guide (30 seconds to running fortress)
- IPC debugging workflow
- Fast iteration cycle
- Common issues and solutions

```bash
# Fast dev cycle
pkill -f "canvas-fortress"  # Kill old process
bun run src/cli.ts spawn fortress --config='{"fortressName":"Dev","save":false}'
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock  # Verify working
```

## Known Issues

- Unicode dwarves (☺) may render poorly in some terminals
- Migrant waves can spawn too many dwarves (work in progress)
- No pathfinding around obstacles yet (simple adjacency only)
- Tmux spawn requires wrapper script (see DEVELOPER_NOTES.md)

## Credits

- **Dwarf Fortress** by Bay 12 Games - Inspiration and mechanics
- **Claude Canvas** by [@dvdsgl](https://github.com/dvdsgl) - Plugin system foundation
- Built by humans + Claude Sonnet 4.5 in one intense session

## License

MIT

## The Story

This project started at 11 PM with "wouldn't it be cool if..." and became a working fortress by 3:30 AM. ClawdeFort, the first fortress, survived to Year 252 before collapsing in a food crisis. It was peak Dwarf Fortress.

The goal isn't to recreate DF - it's to prove that **AI can make complex systems accessible through conversation**.

**Strike the earth!** ⚒️

---

*"In memory of ClawdeFort, Year 251-252. They struck the earth with pride."*
