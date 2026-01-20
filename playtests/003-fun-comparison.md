# Playtest 003: Fun Comparison (v0.3.3 vs v0.4.3)

**Date**: 2026-01-19
**Methodology**: Sequential A/B testing with identical Haiku agents
**Goal**: Validate whether v0.4.3 rebalancing reduced "Fun" (Dwarf Fortress-style chaos)

## Executive Summary

| Metric | v0.3.3 | v0.4.3 | Delta |
|--------|--------|--------|-------|
| **Fun Rating** | 9/10 | 5.5/10 | **-3.5** |
| Final State | Total Collapse | Thriving | - |
| Dwarf Deaths | 7/7 (100%) | 0/7 (0%) | **-7** |
| Berserker Events | 2 | 0 | -2 |
| Tantrum Spirals | 2 | 0 | -2 |
| Peak Chaos Level | 10/10 | 6/10 | -4 |
| Cycles Played | ~35 | ~26 | +9 |

**Verdict**: v0.4.3 rebalancing significantly reduced Fun. The chaos mechanics that create emergent narratives (death → grief → berserk → cascade) appear to be suppressed or removed.

## Detailed Comparison

### v0.3.3: "Chaosholm" (Fun: 9/10)

The fortress experienced a classic Dwarf Fortress death spiral:

1. **Resource Crisis**: All 7 dwarves hit dual starvation (89) + dehydration (87)
2. **First Death**: Kogsak died of thirst while others recovered
3. **Grief Cascade**: Zasit went berserk from grief, killed Shem, then died
4. **Spiral Continues**: More thirst deaths → more grief → more berserkers
5. **Total Collapse**: All 7 dwarves dead, "Your fortress has crumbled to its end..."

**Key mechanics observed**:
- Dwarves CAN die from thirst (thirst 100 = death)
- Death triggers grief in other dwarves
- Grief can trigger berserk state
- Berserkers attack others AND can be killed
- Cascade failures create emergent narratives

### v0.4.3: "Mithrilhold" (Fun: 5.5/10)

The fortress survived identical (and worse) crises without consequence:

1. **Resource Crisis**: All 7 dwarves hit dual starvation (88) + dehydration (82)
2. **No Deaths**: Despite extreme stats, all dwarves survived
3. **Seasonal Reset**: Year transition reset hunger/thirst to low values
4. **Stabilization**: Fortress reached indefinite stability

**Key mechanics observed**:
- Dwarves appear unable to die from thirst/starvation
- Seasonal reset acts as "get out of jail free" mechanic
- No grief → berserk cascade observed
- No tantrum spirals despite prolonged stress

## Hypothesis: What Changed?

The playtest agents hypothesized that v0.4.3 removed dwarf death from needs. However, this needs code verification. Possible changes:

1. **Death threshold raised or removed** - Dwarves may no longer die at thirst/hunger 100
2. **Seasonal reset buffed** - Reset may be more aggressive, preventing threshold breach
3. **Berserk trigger nerfed** - Grief may no longer trigger berserk state
4. **Cascade prevention** - Some mechanic may interrupt the death spiral

## Agent Recommendations

### From v0.4.3 Agent:
> "Restore ONE chaotic mechanic - either tantrum spirals OR death consequences OR cascading failures. The game needs at least one vector where player mistakes matter."

### From v0.3.3 Agent:
> "This balance of chaos vs stability is excellent. The game is challenging but not impossible - early recovery from dual crisis shows skill can matter. But poor management (zero drink) leads to inevitable doom. This is the sweet spot."

## Conclusion

The v0.4.3 rebalancing successfully addressed "random berserker spirals" but overcorrected by removing ALL existential threat. The result is a game that's more stable but less engaging.

**Recommended next steps**:
1. Code review to identify specific mechanic changes
2. Consider partial revert or tuning of death/berserk mechanics
3. Preserve seasonal reset but allow death at extreme thresholds

---

## Raw Playtest Data

- [v0.3.3 Full Report](~/.claude/playtests/003-v0.3.3-fun.md)
- [v0.4.3 Full Report](~/.claude/playtests/003-v0.4.3-fun.md)
