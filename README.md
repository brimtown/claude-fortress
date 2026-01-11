# Claude Fortress

A Dwarf Fortress-inspired simulation where Claude Code acts as your fortress overseer. Spawn an ASCII fortress in your terminal and command dwarves through natural language!

![Claude Canvas Screenshot](media/screenshot.png)

## Requirements

- [Bun](https://bun.sh) - JavaScript runtime (v1.0+)
- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer (canvases spawn in split panes)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - CLI for Claude

## Installation

### 1. Install Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Or via Homebrew (macOS)
brew install oven-sh/bun/bun

# Verify installation
bun --version
```

### 2. Install tmux

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Verify installation
tmux -V
```

### 3. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-fortress.git
cd claude-fortress

# Install dependencies
cd canvas
bun install
```

### 4. Install the Skill

Copy the skill file so Claude Code can find it:

```bash
# Create the skills directory if it doesn't exist
mkdir -p ~/.claude/skills/claude-fortress

# Copy the skill file
cp canvas/skills/claude-fortress/SKILL.md ~/.claude/skills/claude-fortress/SKILL.md
```

Or create a symlink for auto-updates during development:

```bash
ln -s "$(pwd)/canvas/skills/claude-fortress" ~/.claude/skills/claude-fortress
```

### 5. Set Environment Variable (Optional)

For easier CLI usage, set the repo location:

```bash
# Add to your ~/.bashrc or ~/.zshrc
export CLAUDE_FORTRESS_DIR="/path/to/claude-fortress"
```

## Quick Start

1. **Start a tmux session** (required for canvas panes):
   ```bash
   tmux new -s fortress
   ```

2. **Launch Claude Code** and say:
   ```
   Strike the earth!
   ```

3. Claude will spawn a fortress and you can command it naturally:
   - "Dig out a great hall to the east"
   - "Build a brewery"
   - "How are my dwarves doing?"

## Manual Usage

If you want to run without Claude Code:

```bash
cd canvas

# Spawn a fortress
bun run src/cli.ts spawn fortress --config='{"fortressName":"Irondeep","save":true}'

# Query state
bun run src/cli.ts query fortress-1

# Send commands via IPC
echo '{"type":"command","command":{"type":"dig","area":{"x":15,"y":5,"width":10,"height":5}}}' | nc -U /tmp/canvas-fortress-1.sock
```

## Features

- Real-time ASCII fortress simulation
- Natural language command system via IPC
- Dwarf needs (hunger, thirst, happiness)
- Mining, building, and resource management
- Migrant waves and seasonal events
- Persistent save/load system
- Claude acts as dramatic narrator/overseer

## Troubleshooting

### "Raw mode is not supported"
Must run inside a real tmux pane with interactive stdin.

### Socket file not created
The fortress may have crashed on startup. Check that Bun dependencies are installed: `cd canvas && bun install`

### Bun not found
Ensure Bun is in your PATH. After installation, you may need to restart your terminal or run `source ~/.bashrc`.

## Development

See [DEVELOPER_NOTES.md](DEVELOPER_NOTES.md) for detailed development documentation.

## License

MIT

## Acknowledgments

- Inspired by [Dwarf Fortress](https://www.bay12games.com/dwarves/)
- Built on [dvdsgl/claude-canvas](https://github.com/dvdsgl/claude-canvas)
- A collaboration between human creativity and Claude
