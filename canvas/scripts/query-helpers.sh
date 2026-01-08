#!/bin/bash
# Helper functions to query fortress state

SOCKET="${FORTRESS_SOCKET:-/tmp/canvas-fortress-1.sock}"

query_state() {
  echo '{"type":"getState"}' | nc -U "$SOCKET" -w 1
}

# Get just the tick count
get_tick() {
  query_state | grep -o '"tick":[0-9]*' | cut -d: -f2
}

# Count pending jobs
count_jobs() {
  query_state | grep -o '"jobs":\[' | wc -l
}

# Count dwarves
count_dwarves() {
  query_state | grep -o '"id":[0-9]*' | wc -l
}

# Get resources
get_resources() {
  query_state | grep -o '"resources":{[^}]*}' | head -1
}

# Check if jobs exist
has_jobs() {
  local state=$(query_state)
  if echo "$state" | grep -q '"jobs":\[\]'; then
    echo "No jobs pending"
    return 1
  else
    echo "Jobs found"
    return 0
  fi
}

# Get dwarf positions (first 5)
get_dwarf_positions() {
  query_state | grep -o '"name":"[^"]*","x":[0-9]*,"y":[0-9]*' | head -5
}

# Export functions for use in other scripts
export -f query_state get_tick count_jobs count_dwarves get_resources has_jobs get_dwarf_positions
