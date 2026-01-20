/**
 * Thoughts System
 *
 * Dwarves accumulate "thoughts" from events that affect their long-term happiness.
 * This enables real grief cascades and emergent narratives.
 *
 * Key formula: happiness = personality.baseHappiness + sum(thought.modifiers)
 */

import type { Dwarf, Thought, ThoughtType, DwarfPersonality } from "../../scenarios/fortress/types";

// Configuration for each thought type
interface ThoughtConfig {
  modifier: number;        // Happiness modifier
  duration: number;        // Ticks until expiration (Infinity for condition-based)
  stacks: boolean;         // Whether multiple instances stack
  description: string;     // Human-readable description
}

export const THOUGHT_CONFIG: Record<ThoughtType, ThoughtConfig> = {
  witnessed_death: {
    modifier: -30,
    duration: 300,
    stacks: true,
    description: "witnessed a death",
  },
  starving: {
    modifier: -20,
    duration: Infinity,
    stacks: false,
    description: "is starving",
  },
  dehydrated: {
    modifier: -25,
    duration: Infinity,
    stacks: false,
    description: "is dehydrated",
  },
  exhausted: {
    modifier: -10,
    duration: Infinity,
    stacks: false,
    description: "is exhausted",
  },
  ate_while_starving: {
    modifier: 15,
    duration: 100,
    stacks: false,
    description: "ate a satisfying meal",
  },
  drank_while_parched: {
    modifier: 15,
    duration: 100,
    stacks: false,
    description: "quenched their thirst",
  },
  well_fed: {
    modifier: 5,
    duration: Infinity,
    stacks: false,
    description: "is well fed",
  },
  well_hydrated: {
    modifier: 5,
    duration: Infinity,
    stacks: false,
    description: "is well hydrated",
  },
  witnessed_tantrum: {
    modifier: -15,
    duration: 150,
    stacks: true,
    description: "witnessed a tantrum",
  },
  created_artifact: {
    modifier: 50,
    duration: 500,
    stacks: false,
    description: "created a legendary artifact",
  },
};

/**
 * Generate a random personality for a new dwarf
 */
export function generatePersonality(): DwarfPersonality {
  return {
    baseHappiness: 45 + Math.floor(Math.random() * 20), // 45-64
    resilience: 0.7 + Math.random() * 0.6,              // 0.7-1.3
    empathy: 0.7 + Math.random() * 0.6,                 // 0.7-1.3
  };
}

/**
 * Add a thought to a dwarf
 * For stacking thoughts: increments intensity and refreshes timer
 * For non-stacking thoughts: replaces/refreshes existing
 */
export function addThought(
  dwarf: Dwarf,
  tick: number,
  type: ThoughtType,
  customDescription?: string
): void {
  if (!dwarf.thoughts) {
    dwarf.thoughts = [];
  }

  const config = THOUGHT_CONFIG[type];
  const existingIndex = dwarf.thoughts.findIndex(t => t.type === type);

  if (existingIndex !== -1) {
    const existing = dwarf.thoughts[existingIndex]!;
    if (config.stacks) {
      // Stack: increment intensity and refresh timer
      existing.intensity++;
      existing.createdAt = tick;
      existing.expiresAt = config.duration === Infinity ? Infinity : tick + config.duration;
    } else {
      // Non-stacking: refresh timer
      existing.createdAt = tick;
      existing.expiresAt = config.duration === Infinity ? Infinity : tick + config.duration;
    }
  } else {
    // Add new thought
    const thought: Thought = {
      type,
      createdAt: tick,
      expiresAt: config.duration === Infinity ? Infinity : tick + config.duration,
      modifier: config.modifier,
      intensity: 1,
      description: customDescription || config.description,
    };
    dwarf.thoughts.push(thought);
  }
}

/**
 * Remove expired thoughts and apply resilience-based faster decay for negative thoughts
 */
export function decayThoughts(dwarf: Dwarf, tick: number): void {
  if (!dwarf.thoughts) return;

  const resilience = dwarf.personality?.resilience ?? 1.0;

  dwarf.thoughts = dwarf.thoughts.filter(thought => {
    // Condition-based thoughts never expire by time
    if (thought.expiresAt === Infinity) return true;

    // Apply resilience: higher resilience = faster decay of negative thoughts
    let effectiveExpiry = thought.expiresAt;
    if (thought.modifier < 0 && resilience > 1.0) {
      // For negative thoughts, resilient dwarves recover faster
      const originalDuration = thought.expiresAt - thought.createdAt;
      const adjustedDuration = originalDuration / resilience;
      effectiveExpiry = thought.createdAt + adjustedDuration;
    }

    return tick < effectiveExpiry;
  });
}

/**
 * Remove a condition-based thought (e.g., when no longer starving)
 */
export function removeConditionThought(dwarf: Dwarf, type: ThoughtType): void {
  if (!dwarf.thoughts) return;
  dwarf.thoughts = dwarf.thoughts.filter(t => t.type !== type);
}

/**
 * Check if dwarf has a specific thought type
 */
export function hasThought(dwarf: Dwarf, type: ThoughtType): boolean {
  if (!dwarf.thoughts) return false;
  return dwarf.thoughts.some(t => t.type === type);
}

/**
 * Get the intensity (stack count) of a specific thought type
 */
export function getThoughtIntensity(dwarf: Dwarf, type: ThoughtType): number {
  if (!dwarf.thoughts) return 0;
  const thought = dwarf.thoughts.find(t => t.type === type);
  return thought?.intensity ?? 0;
}

/**
 * Calculate happiness from personality and thoughts
 */
export function calculateHappiness(dwarf: Dwarf): number {
  const baseHappiness = dwarf.personality?.baseHappiness ?? 50;

  if (!dwarf.thoughts || dwarf.thoughts.length === 0) {
    return Math.max(0, Math.min(100, baseHappiness));
  }

  let totalModifier = 0;
  for (const thought of dwarf.thoughts) {
    // For stacking thoughts, multiply modifier by intensity
    const config = THOUGHT_CONFIG[thought.type];
    if (config.stacks) {
      totalModifier += thought.modifier * thought.intensity;
    } else {
      totalModifier += thought.modifier;
    }
  }

  return Math.max(0, Math.min(100, baseHappiness + totalModifier));
}

/**
 * Get the top N strongest thoughts for UI display
 * Sorted by absolute modifier value (most impactful first)
 */
export function getTopThoughts(dwarf: Dwarf, count: number = 3): string[] {
  if (!dwarf.thoughts || dwarf.thoughts.length === 0) {
    return [];
  }

  // Sort by absolute impact (modifier * intensity for stacking)
  const sorted = [...dwarf.thoughts].sort((a, b) => {
    const configA = THOUGHT_CONFIG[a.type];
    const configB = THOUGHT_CONFIG[b.type];
    const impactA = Math.abs(a.modifier) * (configA.stacks ? a.intensity : 1);
    const impactB = Math.abs(b.modifier) * (configB.stacks ? b.intensity : 1);
    return impactB - impactA;
  });

  return sorted.slice(0, count).map(thought => {
    const config = THOUGHT_CONFIG[thought.type];
    const sign = thought.modifier > 0 ? "+" : "";
    const intensitySuffix = config.stacks && thought.intensity > 1
      ? ` (x${thought.intensity})`
      : "";
    return `${sign}${thought.modifier * (config.stacks ? thought.intensity : 1)}: ${thought.description}${intensitySuffix}`;
  });
}
