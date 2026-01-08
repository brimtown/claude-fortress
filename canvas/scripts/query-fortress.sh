#!/bin/bash
# Query fortress state via IPC

SOCKET="${1:-/tmp/canvas-fortress-1.sock}"

if [ ! -S "$SOCKET" ]; then
  echo "Error: Socket $SOCKET not found"
  exit 1
fi

# Send getState command and capture response
# Using timeout to avoid hanging if no response
echo '{"type":"getState"}' | nc -U "$SOCKET" -w 1 | jq '.'
