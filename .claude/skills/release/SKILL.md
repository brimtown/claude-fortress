---
name: release
description: Bump version and prepare release
---

# Release Workflow

Run the release script to bump versions across all plugin files.

## When to Use

Trigger on: "release", "bump version", "prepare release", "new version"

## Process

1. Ask user for version bump type if not specified
2. Run the release script
3. Show the git commands to complete the release

```bash
bun run scripts/release.ts [patch|minor|major]
```

## After Running

Remind user to:
```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```
