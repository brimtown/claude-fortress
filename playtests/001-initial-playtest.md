# Playtest 001: Initial Dual-Agent Playtest

**Date:** 2026-01-17
**Version:** v0.3.2 (commit a56cdf4)
**Agents:** Claude Haiku + Claude Opus
**Duration:** ~5 minutes per agent
**Context Used:** ~68% of session context window

## Setup

Two subagents were spawned in parallel, each managing an independent fortress instance:

| Agent | Instance ID | Fortress Name | Outcome |
|-------|-------------|---------------|---------|
| Haiku | haiku-test | Irondeep | Survived (barely) - 0 deaths |
| Opus | opus-test | Skullthorn | Catastrophic failure - 5/7 deaths (berserk) |

Both agents played full sessions (~300-550 ticks), testing all mechanics: dig, build, assign, query, screenshot, pause/unpause, save.

---

## Synthesized Findings

### What Works Well

1. **Core Loop** - Dig → Build → Assign → Survive works intuitively
2. **Query Tool** - Excellent structured markdown output for state inspection
3. **Screenshot Tool** - Clear visual representation with legend
4. **Crisis System** - Dehydration, starvation, and mood cascades create genuine tension
5. **Event Narrative** - Messages like "Migrants refused to journey here - 5 deaths have tarnished the fortress's reputation" add authentic flavor
6. **Pause/Unpause** - Works flawlessly
7. **Tantrum Spirals** - Opus experienced a full DF-style collapse with grief cascades and berserk rampages

### Issues Identified

| Issue | Haiku | Opus | Priority |
|-------|-------|------|----------|
| Invalid input accepted silently | ✓ | ✓ | **HIGH** |
| Building requirements unclear | ✓ | ✓ | **HIGH** |
| "Insufficient resources" lacks detail | - | ✓ | **HIGH** |
| Workshops too expensive (can't make drinks) | - | ✓ | **HIGH** |
| No way to see why dwarves are "idle" | ✓ | ✓ | **MEDIUM** |
| No way to cancel dig designations | ✓ | - | **MEDIUM** |
| No "wait N ticks" command | - | ✓ | **LOW** |

---

## Prioritized Improvements

### 1. Input Validation (HIGH - Both Agents)

**Problem:** Invalid coordinates and dwarf IDs are accepted without error.
- Opus: Assigning dwarf #99 (non-existent) returned success
- Haiku: Negative coordinates accepted, failed silently later
- Both: Out-of-bounds dig coordinates accepted, only failed later with vague message

**Fix:** Validate all inputs at command time. Return immediate, clear errors.

**Files likely affected:** `canvas/src/fortress/commands.ts` or wherever dig/build/assign commands are processed

### 2. Resource Feedback for Construction (HIGH - Opus)

**Problem:** "Insufficient resources for construction" doesn't say which resource or how much is needed.

**Fix:** Change error message to specify: "Insufficient resources: need 5 wood, have 4"

**Files likely affected:** `canvas/src/fortress/buildings.ts` or construction logic

### 3. Building Placement UX (HIGH - Haiku)

**Problem:** New players repeatedly try to build on surface/walls. Requirement that buildings must be on dug floor is non-obvious.

**Fix:**
- Validate build location immediately (not after "Queued construction")
- Return clearer error: "Cannot build here - tile at (x,y) is not dug floor"
- Consider adding a hint in the build tool description about floor requirements

**Files likely affected:** Build command handler, tool descriptions in MCP

### 4. Workshop Balance (HIGH - Opus, Game-Breaking)

**Problem:** Opus could never build a still despite having resources. Without drink production, death spiral is inevitable.

**Evidence:** Opus had wood=4, stone=17 but still couldn't build workshops. Multiple "Insufficient resources" errors with no clarity on what was needed.

**Fix:**
- Review workshop resource costs (possibly too high for early game)
- Ensure at least one workshop type is affordable at game start
- Document building costs in help text or tool descriptions

**Files likely affected:** `canvas/src/fortress/buildings.ts`, building cost constants

### 5. Dwarf Task Visibility (MEDIUM - Both Agents)

**Problem:** Dwarves showing "idle" when dig jobs exist is confusing.

**Fix:** Show more granular states in query output: "no path", "seeking job", "resting", "eating", "drinking"

**Files likely affected:** Dwarf state reporting in query handler

### 6. Designation Management (MEDIUM - Haiku)

**Problem:** No way to clear/cancel dig designations once placed.

**Fix:** Add a cancel command, or allow re-digging an area to toggle off

### 7. Resource Prediction (LOW - Haiku)

**Problem:** Hard to plan ahead without knowing consumption rates.

**Fix:** Add to query output: "Drink at current consumption: depletes in ~X ticks"

---

## Agent Reports (Key Excerpts)

### Haiku Report - Fortress "Irondeep"

> **Overall Assessment**: Highly playable and genuinely fun. Ready for wider playtesting with the noted UX improvements.

**Memorable Moments:**
- Dehydration crisis with all 7 dwarves in crisis list - genuine tension
- Dwarves recovered autonomously after drinking last supplies
- Happiness dynamics: Happy → Unhappy → Miserable → Content

**Top Issue:** Building placement UX - "The requirement that buildings MUST be on dug floor is not intuitive - players naturally try to build on surface first."

**Edge Cases Tested:**
- Single tile (1x1) at map corner (0,0): Works
- Large area (15x5): Works
- Bottom-right corner (39,19): Works
- Out-of-bounds (40,0): Accepted silently, failed later

### Opus Report - Fortress "Skullthorn"

> **Final Score: 7.5/10 - Would lose another fortress to tantrum spirals again.**

**The Catastrophe Timeline:**
- Tick 182: Lokum attacks Domas (starvation-triggered berserk)
- Grief cascade: Domas Steelforge goes berserk from grief, kills Zasit Goldtooth
- Tick 500: "Migrants refused to journey here - 5 deaths have tarnished the fortress's reputation"
- Tick 531: Zasit Stonebeard falls into despair
- Final state: 2/7 alive, both starving and dehydrated, drink=0

**Top Issue:** Workshop building - "I never successfully built a still/workshop despite having wood and stone - unclear what the actual requirements are"

**What Felt Frustrating:**
1. Not being able to build workshops (couldn't figure out resource requirements)
2. Miners being "idle" with 100+ jobs queued
3. No way to produce drinks → unsolvable death spiral

---

## Fun Assessment

Both agents confirmed the game creates authentic Dwarf Fortress-style "Fun":

| Metric | Haiku | Opus |
|--------|-------|------|
| Authentic DF Experience | ✓ | ✓✓ (full tantrum spiral) |
| Memorable Moments | Dehydration crisis | 5 berserk deaths |
| Emergent Narrative | ✓ | ✓ |
| Would Play Again | Yes | "Would lose another fortress again" |

---

## Recommended Implementation Order

1. **Quick fixes** (can ship immediately):
   - Input validation for coordinates and dwarf IDs
   - Improve resource error messages with specific amounts
   - Validate build location immediately

2. **Balance tuning** (requires playtesting):
   - Review workshop costs - ensure drink production is achievable early
   - Consider increasing starting resources or lowering costs

3. **UX polish** (nice to have):
   - Enhance dwarf task states beyond "idle"
   - Add designation cancel command
   - Add resource depletion predictions
