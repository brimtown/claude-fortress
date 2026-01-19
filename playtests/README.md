# Claude Fortress Playtests

This directory contains playtest reports from AI agent sessions playing Claude Fortress.

## Playtests

| # | Description | Agents | Version | Date |
|---|-------------|--------|---------|------|
| [001](./001-initial-playtest.md) | Initial dual-agent playtest | Haiku + Opus | v0.3.2 | 2026-01-17 |
| [002](./002-feature-ranking-playtest.md) | Feature ranking for next development phase | 2x Haiku + Opus | v0.3.3+ | 2026-01-18 |

## How Playtests Work

Playtests are run by spawning subagents from a main Claude Code session. Each subagent plays an independent fortress instance, then provides structured feedback on gameplay and "Fun" (the Dwarf Fortress community term for catastrophic failure cascades).

### Prerequisites

- Claude Code with `--dangerously-skip-permissions` (subagents need to call MCP tools freely)
- Claude Fortress plugin loaded (`--plugin-dir /path/to/claude-fortress/canvas`)
- tmux installed (the fortress runs in a tmux window)

### Running a Playtest

From Claude Code, spawn playtest agents using the Task tool:

```
Task tool with:
  - subagent_type: "general-purpose"
  - model: "haiku" or "opus" (vary for different perspectives)
  - run_in_background: true
  - prompt: [see template below]
```

Use unique instance IDs for each agent (e.g., `haiku-test`, `opus-test`) to avoid conflicts.

### Prompt Template

```
You are playtesting Claude Fortress, a Dwarf Fortress-inspired ASCII simulation game.
Your goal is to play through a full session and provide detailed feedback on gameplay
and "Fun" (the Dwarf Fortress community term for challenging/chaotic experiences).

**Your fortress instance ID is: {unique-instance-id}**

## Playtest Instructions

1. **Embark** - Use mcp__plugin_claude-fortress_cli__embark with instance="{unique-instance-id}"
   and give your fortress a creative name

2. **Explore all mechanics** - Try each feature multiple times:
   - **Dig**: Designate mining areas of various sizes. Try edge cases (large areas, small areas, edges of map)
   - **Build**: Place workshops (still, carpenter, smelter), stockpiles (food, wood, stone), beds, and farms
   - **Assign**: Reassign dwarves to different labors (mining, carpentry, brewing, farming, hauling)
   - **Query**: Check fortress state frequently to see resources, dwarf status, jobs, events
   - **Screenshot**: Use the screenshot tool to see the visual map layout
   - **Pause/Unpause**: Control game flow

3. **Play multiple cycles** - Let the simulation run, make decisions, see what happens.
   Try to build a functional fortress.

4. **Document your experience** - Note what works well, what's confusing, what's fun, what's frustrating.

## Feedback Format

After playing, provide structured feedback:

### Overall Experience
- First impressions
- Learning curve
- Engagement level

### Mechanics Feedback
For each mechanic (dig, build, assign, query, screenshot, pause):
- Did it work as expected?
- Was it intuitive?
- Any bugs or issues?
- Suggestions for improvement

### Fun Factor
- What created memorable moments?
- What felt tedious or frustrating?
- Did you experience any "Fun" (Dwarf Fortress style disasters/chaos)?

### Priority Improvements
List your top 5 suggested improvements in order of importance.

Play thoroughly and be honest in your feedback!
```

### Tips for Running Playtests

1. **Use different model tiers** - Haiku tends to focus on UX and new player experience; Opus explores edge cases and game balance more deeply

2. **Run agents in parallel** - Spawn multiple agents in a single message to maximize parallelism

3. **Let agents run to completion** - Full sessions take 2-5 minutes; use `run_in_background: true` and check with TaskOutput

4. **Synthesize findings** - After agents complete, synthesize their reports into prioritized improvements

5. **Context management** - Playtests consume significant context (~68% for dual-agent). Write results to markdown so fresh instances can implement fixes

### After the Playtest

1. Synthesize feedback from all agents into prioritized improvements
2. Write results to a numbered markdown file in this directory
3. Update the table in this README
4. A fresh Claude Code instance can then read the playtest and implement fixes
