#!/usr/bin/env bun
/**
 * Release script for Claude Fortress
 *
 * Bumps version in all locations and optionally creates git commit/tag.
 *
 * Usage:
 *   bun run scripts/release.ts patch    # 0.3.0 -> 0.3.1
 *   bun run scripts/release.ts minor    # 0.3.0 -> 0.4.0
 *   bun run scripts/release.ts major    # 0.3.0 -> 1.0.0
 *   bun run scripts/release.ts 1.2.3    # Set exact version
 */

const MARKETPLACE_JSON = ".claude-plugin/marketplace.json";
const PLUGIN_JSON = "canvas/.claude-plugin/plugin.json";
const MCP_SERVER_TS = "canvas/src/mcp-server.ts";

type BumpType = "patch" | "minor" | "major";

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${version}`);
  }
  return parts as [number, number, number];
}

function bumpVersion(current: string, bump: BumpType): string {
  const [major, minor, patch] = parseVersion(current);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path);
  return JSON.parse(await file.text());
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

async function getCurrentVersion(): Promise<string> {
  const plugin = (await readJson(PLUGIN_JSON)) as { version: string };
  return plugin.version;
}

async function updateMarketplace(newVersion: string): Promise<void> {
  const data = (await readJson(MARKETPLACE_JSON)) as {
    version: string;
    plugins: { version: string }[];
  };
  data.version = newVersion;
  data.plugins[0].version = newVersion;
  await writeJson(MARKETPLACE_JSON, data);
}

async function updatePluginJson(newVersion: string): Promise<void> {
  const data = (await readJson(PLUGIN_JSON)) as { version: string };
  data.version = newVersion;
  await writeJson(PLUGIN_JSON, data);
}

async function updateMcpServer(newVersion: string): Promise<void> {
  const file = Bun.file(MCP_SERVER_TS);
  let content = await file.text();

  // Replace PLUGIN_VERSION constant
  content = content.replace(
    /const PLUGIN_VERSION = "[^"]+"/,
    `const PLUGIN_VERSION = "${newVersion}"`
  );

  await Bun.write(MCP_SERVER_TS, content);
}

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Usage: bun run scripts/release.ts [patch|minor|major|x.y.z]");
    process.exit(1);
  }

  const currentVersion = await getCurrentVersion();
  let newVersion: string;

  if (["patch", "minor", "major"].includes(arg)) {
    newVersion = bumpVersion(currentVersion, arg as BumpType);
  } else {
    // Validate explicit version
    parseVersion(arg);
    newVersion = arg;
  }

  console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

  // Update all files
  console.log(`  Updating ${MARKETPLACE_JSON}...`);
  await updateMarketplace(newVersion);

  console.log(`  Updating ${PLUGIN_JSON}...`);
  await updatePluginJson(newVersion);

  console.log(`  Updating ${MCP_SERVER_TS}...`);
  await updateMcpServer(newVersion);

  console.log(`\nVersion bumped to ${newVersion}`);
  console.log(`\nNext steps:`);
  console.log(`  git add -A`);
  console.log(`  git commit -m "chore: release v${newVersion}"`);
  console.log(`  git tag v${newVersion}`);
  console.log(`  git push && git push --tags`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
