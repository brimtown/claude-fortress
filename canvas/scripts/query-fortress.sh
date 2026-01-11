#!/bin/bash
# Query fortress state via IPC

# Check dependencies
if ! command -v nc &> /dev/null; then
  echo "Error: 'nc' (netcat) is required but not installed"
  echo "Install with: brew install netcat (macOS) or apt install netcat (Linux)"
  exit 1
fi

SOCKET="${1:-/tmp/canvas-fortress-1.sock}"

if [ ! -S "$SOCKET" ]; then
  echo "Error: Socket $SOCKET not found"
  echo "Make sure a fortress is running: bun run src/cli.ts spawn fortress"
  exit 1
fi

# Send getState command and capture response
# Using timeout to avoid hanging if no response
RESPONSE=$(echo '{"type":"getState"}' | nc -U "$SOCKET" -w 1)

# Format with jq if available, otherwise output raw
if command -v jq &> /dev/null; then
  echo "$RESPONSE" | jq '.'
else
  echo "$RESPONSE"
fi
