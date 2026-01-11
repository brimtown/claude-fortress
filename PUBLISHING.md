# 📦 Publishing Guide - Claude Fortress

## Getting This Out There So Other Claudes Can Play! 🎮

### Pre-Publishing Checklist

- [ ] Clean up temp files: `rm /tmp/canvas-* /tmp/spawn-*`
- [ ] Test fresh install on clean system
- [ ] Update DEVELOPER_NOTES.md with any new learnings
- [ ] Add MIT LICENSE file
- [ ] Create demo GIF/video
- [ ] Write clear README (see below)

### GitHub Setup

1. **Create new repo:**
```bash
cd /path/to/claude-fortress
git init
git add .
git commit -m "Initial commit: Claude Fortress for Claude Code

- Real-time ASCII fortress simulation
- Natural language command system via IPC
- Claude acts as overseer/narrator
- Persistent save/load system
- Simplified DF mechanics for emergent storytelling"
```

2. **Push to GitHub:**
```bash
# Create repo on GitHub first (github.com/new)
git remote add origin https://github.com/YOUR_USERNAME/claude-fortress.git
git branch -M main
git push -u origin main
```

3. **Add topics:**
- `dwarf-fortress`
- `claude-code`
- `terminal-game`
- `ascii-game`
- `tmux`
- `bun`
- `react-ink`

### Distribution Options

#### Option 1: GitHub Only (Simplest)
Just the repo with good docs. Users clone and run.

**Pros**: Simple, direct
**Cons**: Users need to manually install skill

#### Option 2: Claude Code Plugin Marketplace
Package as a plugin for the canvas marketplace.

**Required**:
- `.claude-plugin/plugin.json` with metadata
- Skills bundled in plugin
- Clear installation instructions

#### Option 3: NPM Package (Future)
`npx claude-fortress` to install everything.

**Pros**: One-command install
**Cons**: More setup

### README Must-Haves

✅ **Clear "What is this?"** - Explain DF + Claude in 2 sentences
✅ **Demo/GIF** - Show it in action (recording ClawdeFort!)
✅ **Quick Start** - Clone → Install → Play in < 5 commands
✅ **How Commands Work** - Examples of natural language → fortress
✅ **What's Implemented** - Set expectations (MVP, not full DF)
✅ **Known Issues** - Unicode rendering, wrapper script quirk
✅ **Contributing** - Welcome PRs, list easy first issues
✅ **Credits** - Bay12, dvdsgl/claude-canvas, you + Claude collaboration

### Demo Content Ideas

**Screenshots to capture:**
1. Fortress spawning in tmux
2. Claude sending a dig command
3. Events appearing in log
4. Migrant wave arriving
5. Resource counters changing
6. Full fortress after 10 minutes

**GIF/Video (30-60 sec):**
- Start: "Let's embark on a fortress"
- Show: Canvas spawns in tmux
- Command: "Dig out a great hall"
- Show: Event log updates, stone increases
- Command: "Build a brewery"
- Show: Workshop appears
- End: Pan across thriving fortress

### Social Media Launch

**Tweet/Post Template:**
```
🏰 Dwarf Fortress × Claude Code

I built a DF simulation where Claude acts as your overseer.

Instead of memorizing 500 hotkeys:
You: "Dig out a dining hall!"
Claude: [sends IPC command]

Emergent storytelling, ASCII graphics, persistent saves.

Try it: [github link]

Built in one 4hr session with @AnthropicAI Claude. Strike the earth! ⚒️
```

**Post to:**
- Twitter/X
- Hacker News (Show HN: Dwarf Fortress controlled by Claude Code)
- r/dwarffortress
- r/roguelikes
- Claude Discord community

### License

**Recommendation**: MIT License

```
MIT License

Copyright (c) 2026 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software...
```

Simple, permissive, encourages remixing.

### Installation Testing

**Test on fresh machine:**
```bash
# Clone
git clone https://github.com/YOU/claude-fortress.git
cd claude-fortress/canvas

# Install
bun install  # Should work out of box

# Test spawn
bun run src/cli.ts spawn fortress --config='{"fortressName":"Test"}'

# Verify
ls /tmp/canvas-fortress-1.sock  # Socket exists?
ps aux | grep fortress          # Process running?
```

### Future Enhancements for v2

Post-launch improvements:

1. **One-command install**: `npx create-dwarf-fortress`
2. **Web dashboard**: View fortress state in browser
3. **Multi-fortress**: Manage multiple concurrent fortresses
4. **Production chains**: Workshops actually produce items
5. **Threats**: Sieges, cave-ins, goblin attacks
6. **Trading**: Caravans every season
7. **Achievements**: "Survived 1 year", "Population 50+", etc.

### Community Building

**Good first issues for contributors:**
- [ ] Add more dwarf name combinations
- [ ] Implement tree chopping for wood
- [ ] Add season-specific events
- [ ] Create more map generation variants
- [ ] Write additional skill examples
- [ ] Test on Linux/other terminals
- [ ] Add fortress statistics export

**Discord/Discussions:**
- Share fortress stories
- Post save files
- Collaborate on fortresses
- Share custom scenarios

### Metrics to Track

- GitHub stars
- Install attempts (via clone count)
- Issues/PRs
- Social media mentions
- "Show me your fortress" posts

### The Vision

This isn't just a game - it's a proof of concept:

**What if AI could make complex systems accessible through conversation?**

- Dwarf Fortress → Natural language
- CAD software → "Design a bracket"
- Video editing → "Make this dramatic"
- Code review → "Check for security issues"

DF is the perfect test case because it's famously complex but generates amazing stories.

### Final Polish

Before hitting "publish":

1. **Spell check everything**
2. **Test all commands in README**
3. **Verify links work**
4. **Add badges** (build status, license, etc.)
5. **Thank contributors** (even if it's just you + Claude!)
6. **Add contact info** for questions

---

## 🎉 Ready to Strike the Earth?

When you're ready to publish:

```bash
git tag -a v1.0.0 -m "Initial MVP release - ClawdeFort awaits!"
git push origin v1.0.0
```

Then share it with the world and watch other Claudes discover the joy of fortress management!

**"For the glory of ClawdeFort!"** ⚒️🏰
