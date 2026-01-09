#!/usr/bin/env bun
// Quick test script for slash commands

import { parseSlashCommand } from "./src/commands/fortress-commands";
import { sendFortressCommand, getFortressSummary } from "./src/api/fortress-api";

const socketPath = "/tmp/canvas-fortress-1.sock";

async function testSlashCommand(cmd: string) {
  console.log(`\n🎮 Testing: ${cmd}`);

  const parsed = parseSlashCommand(cmd);

  if (!parsed.success) {
    console.log(`❌ Parse error: ${parsed.error}`);
    return;
  }

  if (parsed.queryType) {
    console.log(`📊 Query type: ${parsed.queryType}`);
    const summary = await getFortressSummary(socketPath);
    console.log(`✅ Result: Stone=${summary.resources.stone}, Jobs=${summary.activeJobs}, Dwarves=${summary.dwarfCount}`);
  } else if (parsed.command) {
    console.log(`✅ Parsed: ${JSON.stringify(parsed.command, null, 2)}`);
    await sendFortressCommand(socketPath, parsed.command);
    console.log(`📤 Command sent!`);

    // Check result
    await new Promise(resolve => setTimeout(resolve, 1000));
    const summary = await getFortressSummary(socketPath);
    console.log(`📊 After: Stone=${summary.resources.stone}, Jobs=${summary.activeJobs}`);
  }
}

// Run tests
(async () => {
  console.log("🏰 FORTRESS SLASH COMMAND TEST\n");

  await testSlashCommand("/query");
  await testSlashCommand("/dig 20 8 8 4");
  await testSlashCommand("/pause");

  console.log("\n✨ All tests complete!");
})();
