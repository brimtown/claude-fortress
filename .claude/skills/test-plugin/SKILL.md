---
name: test-plugin
description: Test the plugin locally
---

# Test Plugin Workflow

Quick workflow to test the claude-fortress plugin.

## When to Use

Trigger on: "test plugin", "verify plugin", "test locally", "try the plugin"

## Process

1. **Cleanup** any existing fortress:
   ```bash
   pkill -f "canvas-fortress" 2>/dev/null; rm -f /tmp/canvas-*.sock
   ```

2. **Start Claude with plugin** from a test directory:
   ```bash
   cd /tmp && claude --plugin-dir /path/to/claude-fortress/canvas
   ```

3. **Test the command**:
   ```
   /claude-fortress:embark TestFort
   ```

4. **Verify MCP tools work**:
   - Check fortress spawns in tmux
   - Try `dig`, `build`, `query` tools
   - Confirm no permission prompt spam

## Quick Verification

After spawning, verify socket exists:
```bash
ls -la /tmp/canvas-fortress-1.sock
```
