Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Claude Fortress Development

### Running the Fortress

**Always use `spawn` (not `show`)** when running the fortress:

```bash
cd canvas
bun run src/cli.ts spawn fortress --config '{"fortressName":"TestFort","save":true}'
```

`show` requires a TTY with raw mode - it will fail in Claude Code's bash subprocess or any non-interactive environment. `spawn` creates a new tmux window with proper terminal support.

### Key Paths

- Socket: `/tmp/canvas-fortress-1.sock`
- Saves: `~/.claude/fortress-saves/{name}.json`
- Wrapper script: `/tmp/canvas-spawn-fortress-1.sh`
- Pane tracking: `/tmp/claude-canvas-pane-id`

### IPC Debugging

```bash
# Query state
echo '{"type":"getSummary"}' | nc -U /tmp/canvas-fortress-1.sock

# Send command
echo '{"type":"command","command":{"type":"dig","area":{"x":12,"y":2,"width":5,"height":3}}}' | nc -U /tmp/canvas-fortress-1.sock
```

### Cleanup

```bash
pkill -f "canvas-fortress"; rm -f /tmp/canvas-*.sock
```

### Plugin Testing

```bash
# Local development (from any directory)
claude --plugin-dir /path/to/claude-fortress/canvas

# Then use /claude-fortress:embark or /claude-fortress:resume
```

See `CONTRIBUTING.md` for development workflows, troubleshooting, and release process.
See `specs/` for game systems and architecture documentation.
