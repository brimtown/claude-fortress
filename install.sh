#!/bin/bash
# Claude Fortress - Manual Installation Script
# For development or if you prefer not to use the plugin system
#
# Recommended: Use the plugin system instead:
#   /plugin marketplace add brimtown/claude-fortress
#   /plugin install claude-fortress@claude-fortress

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Claude Fortress Installer"
echo "========================="
echo ""

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "ERROR: Bun is not installed"
    echo "Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check for tmux
if ! command -v tmux &> /dev/null; then
    echo "ERROR: tmux is not installed"
    echo "Install with: brew install tmux (macOS) or apt install tmux (Linux)"
    exit 1
fi

echo "Prerequisites OK: bun $(bun --version), tmux $(tmux -V | cut -d' ' -f2)"
echo ""

# Install dependencies
echo "Installing dependencies..."
cd "$SCRIPT_DIR/canvas"
bun install

echo ""
echo "Installation complete!"
echo ""
echo "To use with the plugin system (recommended):"
echo "  /plugin marketplace add brimtown/claude-fortress"
echo "  /plugin install claude-fortress@claude-fortress"
echo ""
echo "Or for development, run directly:"
echo "  cd $SCRIPT_DIR/canvas"
echo "  bun run src/cli.ts spawn fortress"
echo ""
echo "Strike the earth!"
