#!/bin/bash
# Claude Fortress Installation Script
# Creates symlink for the skill so Claude Code can find it

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SOURCE="$SCRIPT_DIR/canvas/skills/claude-fortress"
SKILL_TARGET="$HOME/.claude/skills/claude-fortress"

echo "Claude Fortress Installer"
echo "========================="
echo ""

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Warning: Bun is not installed or not in PATH"
    echo "Install with: curl -fsSL https://bun.sh/install | bash"
    echo ""
fi

# Check for tmux
if ! command -v tmux &> /dev/null; then
    echo "Warning: tmux is not installed"
    echo "Install with: brew install tmux (macOS) or apt install tmux (Linux)"
    echo ""
fi

# Create skills directory if needed
mkdir -p "$HOME/.claude/skills"

# Remove existing skill (file or symlink)
if [ -e "$SKILL_TARGET" ] || [ -L "$SKILL_TARGET" ]; then
    echo "Removing existing skill at $SKILL_TARGET"
    rm -rf "$SKILL_TARGET"
fi

# Create symlink
ln -s "$SKILL_SOURCE" "$SKILL_TARGET"
echo "Created symlink: $SKILL_TARGET -> $SKILL_SOURCE"

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$SCRIPT_DIR/canvas"
bun install

# Set environment variable hint
echo ""
echo "Installation complete!"
echo ""
echo "Optional: Add this to your ~/.bashrc or ~/.zshrc:"
echo "  export CLAUDE_FORTRESS_DIR=\"$SCRIPT_DIR\""
echo ""
echo "To play:"
echo "  1. Start tmux: tmux new -s fortress"
echo "  2. Launch Claude Code and say: Strike the earth! (or /claude-fortress)"
echo ""
echo "Strike the earth!"
