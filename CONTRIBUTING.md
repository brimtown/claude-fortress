# Contributing to Claude Fortress

## Development Setup

```bash
cd canvas
bun install
```

## Testing the Plugin

### Local Development (fast iteration)

Use `--plugin-dir` to load the plugin directly from disk:

```bash
# From any directory (e.g., /tmp to simulate real usage)
claude --plugin-dir /path/to/claude-fortress/canvas
```

Changes to the plugin are picked up on Claude restart. **Note**: MCP servers don't hot-reload - restart Claude after modifying `mcp-server.ts`.

### Release Validation (full user flow)

Test the complete installation experience:

```bash
# Remove any existing installation
claude
/plugin uninstall claude-fortress
/plugin marketplace remove brimtown/claude-fortress

# Install from local marketplace
/plugin marketplace add /path/to/claude-fortress
/plugin install claude-fortress
```

### Remote Testing (what users get)

After pushing to GitHub:

```bash
claude
/plugin marketplace add brimtown/claude-fortress
/plugin install claude-fortress
```

## Running the Fortress Manually

For debugging without the plugin:

```bash
cd canvas
bun run src/cli.ts spawn fortress --config '{"fortressName":"TestFort","save":true}'
```

**Important**: Use `spawn` not `show`. `show` requires a TTY with raw mode.

## IPC Debugging

Query a running fortress directly:

```bash
# Get state summary
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock

# Send a command
echo '{"type":"command","command":{"type":"dig","area":{"x":12,"y":2,"width":5,"height":3}}}' | nc -U /tmp/canvas-fortress-1.sock
```

## Key Paths

| Path | Purpose |
|------|---------|
| `/tmp/canvas-fortress-1.sock` | IPC socket for running fortress |
| `~/.claude/fortress-saves/{name}.json` | Save files |
| `/tmp/canvas-spawn-fortress-1.sh` | Tmux wrapper script |

## Cleanup

Kill stuck processes and sockets:

```bash
pkill -f "canvas-fortress"; rm -f /tmp/canvas-*.sock
```

## Plugin Structure

```
canvas/                          # Plugin root
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server config
├── commands/
│   ├── embark.md                # /claude-fortress:embark
│   └── resume.md                # /claude-fortress:resume
├── src/
│   ├── mcp-server.ts            # MCP tools
│   ├── cli.ts                   # CLI commands
│   └── ...
└── package.json
```

## MCP Tools

The plugin exposes these tools via MCP (no bash permission prompts):

| Tool | Purpose |
|------|---------|
| `embark` | Start new fortress |
| `resume` | Resume saved fortress (opens picker UI) |
| `query` | Get fortress state |
| `dig` | Designate mining area |
| `build` | Place structures |
| `assign` | Change dwarf labor |
| `pause` | Pause/unpause simulation |
| `save` | Manual save |
| `screenshot` | Capture PNG of fortress map |
| `cancel` | Cancel dig designations |

## Troubleshooting

### "Raw mode is not supported"
**Cause**: Using `show` instead of `spawn`, or running in non-TTY environment
**Fix**: Always use `spawn` - it creates a tmux pane with proper TTY

### Socket file not created
**Cause**: Fortress crashed on startup (likely React/dependency error)
**Fix**:
1. Check if wrapper script exists: `cat /tmp/canvas-spawn-fortress-1.sh`
2. Run it manually to see errors: `bash /tmp/canvas-spawn-fortress-1.sh`
3. Ensure dependencies installed: `cd canvas && bun install`

### Pane closes immediately
**Cause**: Wrapper script has syntax error or can't find bun
**Fix**: Test wrapper manually: `bash /tmp/canvas-spawn-fortress-1.sh`

### zsh tmux plugin interference
If `which tmux` shows `tmux: aliased to _zsh_tmux_plugin_run`, use full path:
```bash
/usr/local/bin/tmux list-panes
/opt/homebrew/bin/tmux list-panes  # on Apple Silicon
```

### Nuclear cleanup
When things are really stuck:
```bash
pkill -9 -f "canvas-fortress"
rm -f /tmp/canvas-*.sock /tmp/canvas-spawn-*.sh /tmp/claude-canvas-pane-id
```

## Releasing

**Always use the release workflow** to keep versions in sync across all files.

From this repo, just say:
```
release patch   # bug fixes: 0.3.0 → 0.3.1
release minor   # new features: 0.3.0 → 0.4.0
release major   # breaking changes: 0.3.0 → 1.0.0
```

This will:
1. Bump versions in marketplace.json, plugin.json, and mcp-server.ts
2. Stage and commit the changes
3. Create a git tag
4. Prompt you to push

Or run manually:
```bash
bun run scripts/release.ts [patch|minor|major]
git add -A && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```
