# Playtest 002: Feature Ranking Playtest

**Date:** 2026-01-18
**Version:** v0.3.3+ (post-playtest-001 fixes)
**Agents:** 2x Claude Haiku + 1x Claude Opus
**Focus:** Evaluating potential new features for prioritization

## Setup

Three agents were spawned in parallel with different evaluation lenses:

| Agent | Instance ID | Focus Area | Fortress Name |
|-------|-------------|------------|---------------|
| Haiku-A | haiku-playtest-a | Player experience & accessibility | Deepdelve |
| Haiku-B | haiku-playtest-b | Gameplay loops & engagement | Deepforge-2 |
| Opus | opus-playtest-2 | Technical feasibility & architecture | (explored codebase) |

All agents played through core mechanics, then evaluated 9 candidate features.

---

## Feature Candidates Evaluated

1. **Larger Map** - Expand from 40x20 to larger size
2. **Dwarf Skill System** - Experience, leveling, specialization
3. **Legible UI** - Better announcements, dwarf thoughts, status formatting
4. **Ore Deposits** - Metal ore veins in stone
5. **Z-Levels** - Multiple vertical layers
6. **Crafting Chains** - Ore → smelt → bars → forge items
7. **Social Dynamics** - Relationships, friendships, grudges, nobles
8. **Military/Threats** - Squads, training, sieges, wildlife
9. **Environment** - Seasons, weather, water, temperature

---

## Synthesized Rankings

### Unanimous High Priority

| Feature | Haiku-A | Haiku-B | Opus | Notes |
|---------|---------|---------|------|-------|
| **Dwarf Skill System** | 8/10 | 10/10 | 8/10 | "Makes every action meaningful" - creates attachment to individual dwarves |
| **Legible UI** | 8/10 | 7/10 | 7/10 | Quick win, low risk. "Could be done in a day and make the game 30% more engaging" |

### Strong Consensus (High Priority)

| Feature | Haiku-A | Haiku-B | Opus | Notes |
|---------|---------|---------|------|-------|
| **Ore Deposits** | 7/10 | 9/10 | "Nearly a freebie" | **Infrastructure already exists in codebase!** Just needs collection + display |
| **Crafting Chains** | 7/10 | 7/10 | 7/10 | Transforms resources from static to flowing. Requires ore deposits. |

### Split Opinion

| Feature | Haiku-A | Haiku-B | Opus | Notes |
|---------|---------|---------|------|-------|
| **Z-Levels** | 9/10 | 8/10 | 9 impact / 9 complexity / 8 risk | Haiku agents love it; Opus warns of architectural complexity |

### Defer

| Feature | Haiku-A | Haiku-B | Opus | Notes |
|---------|---------|---------|------|-------|
| Larger Map | 6/10 | 6/10 | 6/10 | "The 40x20 map isn't the problem—lack of reasons to expand is" |
| Social Dynamics | 5/10 | 5/10 | 8/10 | Fun but risky. Start with friendship/rivalry only. |
| Military/Threats | 6/10 | 6/10 | 8/10 | Needs stable core loops first. Start with weak wildlife. |
| Environment | 5/10 | 4/10 | 6/10 | Quick win: winter farming restriction. Defer water physics. |

---

## Critical Discovery: Ore Infrastructure Exists

Opus discovered that ore deposit infrastructure is **already implemented** but underused:

```typescript
// In map.ts - generateMap():
const resources: Array<"stone" | "iron" | "gold" | "copper"> = ["iron", "gold", "copper"];
map[y]![x]!.resource = resources[rng.int(resources.length)];

// In jobs.ts - completeJob():
if (tile.resource) {
  state.events.push(
    createEvent(state.tick, `Struck ${tile.resource} at (${job.x},${job.y})!`, "success")
  );
}
```

**Missing pieces:**
1. Visual indication on map (show ore color on wall tiles)
2. Actually collecting ore into inventory
3. `resources.iron`, `resources.gold`, `resources.copper` fields

This is a high-value, low-effort win.

---

## Wild Card Suggestions

Each agent suggested a feature not on the original list:

| Agent | Wild Card | Rationale |
|-------|-----------|-----------|
| Haiku-A | **Persistent Threats** | Cave creatures when mining deep. Simpler than full military, adds tension. |
| Haiku-B | **Artifacts & Moods** | Already partially implemented! Dwarves demand items for legendary artifacts. |
| Opus | **Trading Caravans** | Recovery mechanism for struggling fortresses. Creates meaningful economy. |

---

## Z-Levels: The Great Debate

**Haiku Agents (Pro):**
- "Soul of Dwarf Fortress" - vertical mining is core to DF appeal
- Solves cramped map more elegantly than expanding horizontally
- Opens fortress depth literally and metaphorically

**Opus (Caution):**
- Complexity: 9/10 - touches map generation, pathfinding, UI rendering, job accessibility, building placement
- Risk: 8/10 - ASCII rendering of 3D space is challenging
- Recommendation: "Defer Z-levels until core horizontal gameplay is solid. Many DF-likes (Rimworld, Oxygen Not Included) do fine without them."

**Verdict:** Consider for Phase 3 after foundation features are stable.

---

## Recommended Implementation Order

### Phase 1: Quick Wins
1. **Ore Deposits** - Infrastructure exists, just needs collection/display
2. **Legible UI** - Dwarf thoughts, better event formatting
3. **Environment Basics** - Winter farming restriction (quick win from existing seasons)

### Phase 2: Foundation Features
4. **Dwarf Skill System** - Enables quality, affects all future features
5. **Crafting Chains** - Basic ore → bar → item
6. **Larger Map** (60x30) - With viewport controls

### Phase 3: Advanced Features
7. **Social Dynamics** - Relationships, enhanced grief
8. **Military/Threats** - Wildlife first, sieges later
9. **Z-Levels** - Major undertaking, do last

---

## Themed Update Bundles

Opus suggested grouping features into themed releases:

### Update 1: "The Deep Earth"
- Ore deposits with visual indicators
- Smelter and forge workshops
- Skill progression with speed/quality bonuses
- *Narrative: "Strike the earth and forge your destiny"*

### Update 2: "The Living Fortress"
- Dwarf relationships and enhanced grief
- Thought system and better mood display
- Seasonal effects (winter, farming)
- *Narrative: "Your dwarves have hopes, fears, and friends"*

### Update 3: "Siege and Steel"
- Squad system and basic combat
- Goblin sieges as late-game challenge
- Expand map to 80x40 with viewport
- Add 3 Z-levels (surface, main, deep)
- *Narrative: "Defend your mountain home or die trying"*

---

## Key Quotes

> "The 40x20 map isn't the problem—the lack of compelling reasons to expand is." — Haiku-B

> "Ore deposits are nearly a freebie—the infrastructure already exists!" — Opus

> "Z-levels are the most dangerous feature. They touch everything." — Opus

> "Currently all dwarves are clones. Adding experience creates attachment and long-term strategy." — Haiku-A

> "The game sustains interest for ~10-15 commands, then plateaus. Without a reason to dig deeper or build more, the player naturally stops." — Haiku-B

---

## Agent Reports

### Haiku-A Summary
- **Fortress:** Deepdelve (131 ticks, 7 dwarves, 0 casualties)
- **Key Experience:** Hit wood shortage mid-playtest, couldn't build more beds
- **Top 3:** Z-Levels, Legible UI, Dwarf Skills
- **Wild Card:** Persistent threats (cave creatures)

### Haiku-B Summary
- **Fortress:** Deepforge-2 (stable, explored core loop)
- **Key Insight:** Core loop works but lacks "narrative momentum"
- **Top 3:** Dwarf Skills, Ore/Crafting, Z-Levels
- **Wild Card:** Artifacts and Moods

### Opus Summary
- **Focus:** Codebase architecture analysis
- **Key Discovery:** Ore infrastructure already exists
- **Top 3:** Ore Deposits (free), Legible UI, Dwarf Skills
- **Wild Card:** Trading Caravans
- **Critical Warning:** Z-Levels touch too many systems, defer until horizontal game is solid

---

## Conclusion

**Immediate next steps:**
1. Activate ore deposit collection (low effort, high impact)
2. Add dwarf thoughts/better UI (quick win)
3. Implement skill system (foundational)

**The core insight:** The game needs depth through *systems* (skills, crafting, economy) before depth through *space* (Z-levels, larger maps). Players stop playing not because the map is small, but because there's nothing compelling to do with more space.

**Fun Assessment:** All agents confirmed the simulation creates authentic DF-style emergent gameplay. Opus experienced a full tantrum spiral with berserk rampages. The foundation is solid—now it needs progression systems to extend engagement.
