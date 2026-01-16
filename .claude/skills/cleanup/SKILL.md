---
name: cleanup
description: Clean up stuck fortress processes
---

# Cleanup Workflow

Nuclear cleanup when fortress processes get stuck.

## When to Use

Trigger on: "cleanup", "kill fortress", "stuck", "reset", "clean up"

## Commands

```bash
# Kill all fortress processes
pkill -9 -f "canvas-fortress"

# Remove socket files
rm -f /tmp/canvas-*.sock

# Remove wrapper scripts
rm -f /tmp/canvas-spawn-*.sh

# Remove pane tracking file
rm -f /tmp/claude-canvas-pane-id
```

## One-liner

```bash
pkill -9 -f "canvas-fortress"; rm -f /tmp/canvas-*.sock /tmp/canvas-spawn-*.sh /tmp/claude-canvas-pane-id
```

## Verify Clean

```bash
# Should show nothing
ps aux | grep -i fortress | grep -v grep
ls /tmp/canvas-*.sock 2>/dev/null
```
