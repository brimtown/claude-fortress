---
name: release
description: Bump version, commit, and tag a release
---

# Release Workflow

Trigger on: "release", "bump version", "prepare release", "new version"

## Instructions

When triggered, **execute all steps** (don't just show commands):

1. **Determine version bump type** from user input or ask:
   - `patch` (0.3.0 → 0.3.1) - bug fixes
   - `minor` (0.3.0 → 0.4.0) - new features
   - `major` (0.3.0 → 1.0.0) - breaking changes

2. **Run the release script**:
   ```bash
   bun run scripts/release.ts <type>
   ```

3. **Stage all changes**:
   ```bash
   git add -A
   ```

4. **Commit with version in message**:
   ```bash
   git commit -m "chore: release v<NEW_VERSION>"
   ```

5. **Create git tag**:
   ```bash
   git tag v<NEW_VERSION>
   ```

6. **Tell user to push**:
   ```
   Ready to publish! Run: git push && git push --tags
   ```

## Example

User: "release patch"
→ Run script with patch
→ git add -A
→ git commit -m "chore: release v0.3.1"
→ git tag v0.3.1
→ Tell user to push
