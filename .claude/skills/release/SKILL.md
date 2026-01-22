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

5. **Create annotated git tag with release notes**:
   ```bash
   git tag -a v<NEW_VERSION> -m "<RELEASE_NOTES>"
   ```

   Write release notes summarizing what's in this release:
   - Start with version header: `v<VERSION> - <SHORT_TITLE>`
   - Group changes under `## New Features`, `## Bug Fixes`, `## Technical`, etc.
   - Be concise but descriptive
   - Look at commits since last tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`

6. **Push commits and tags**:
   ```bash
   git push && git push --tags
   ```

## Example

User: "release patch"
→ Run script with patch
→ git add -A
→ git commit -m "chore: release v0.3.1"
→ git tag -a v0.3.1 -m "v0.3.1 - Bug Fixes\n\n## Bug Fixes\n- Fixed crash on startup\n- Fixed save corruption"
→ git push && git push --tags

## Viewing Release Notes

```bash
# View tag message
git tag -l -n99 v<VERSION>

# Create GitHub release from tag
gh release create v<VERSION> --notes-from-tag
```
