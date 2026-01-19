# Claude Fortress Specifications

This directory contains specifications for game systems implemented in Claude Fortress.

## Specs

| Spec | Description | Date |
|------|-------------|------|
| [dwarf-death](./dwarf-death.md) | Starvation, dehydration, and corpse mechanics | 2026-01-11 |
| [dwarf-moods](./dwarf-moods.md) | Artifact creation and insanity mechanics | 2026-01-11 |
| [dwarf-movement](./dwarf-movement.md) | Pathfinding and navigation | 2026-01-12 |
| [dwarf-jobs](./dwarf-jobs.md) | Work designations and task assignment | 2026-01-12 |
| [fortress-production](./fortress-production.md) | Workshop and farm resource generation | 2026-01-11 |
| [agent-observability](./agent-observability.md) | How Claude perceives fortress state via IPC | 2026-01-12 |
| [fortress-losing](./fortress-losing.md) | Grief spiral, tantrum cascade, and game over | 2026-01-14 |
| [fortress-migration](./fortress-migration.md) | Wealth-based migration and death reputation | 2026-01-14 |
| [simulation-ui](./simulation-ui.md) | Modal UI system, keyboard shortcuts, colors, balance | 2026-01-18 |

## Adding New Specs

Use the following frontmatter format:

```yaml
---
title: System Name
date: YYYY-MM-DD
status: implemented | planned | deprecated
---
```
