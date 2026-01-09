#!/usr/bin/env bun
// More slash command tests

import { parseSlashCommand } from "./src/commands/fortress-commands";
import { sendFortressCommand, getFortressSummary } from "./src/api/fortress-api";

const socketPath = "/tmp/canvas-fortress-1.sock";

async function runCommand(cmd: string) {
  console.log(`\n💎 ${cmd}`);
  const parsed = parseSlashCommand(cmd);

  if (!parsed.success) {
    console.log(`   ❌ ${parsed.error}`);
    return;
  }

  if (parsed.command) {
    await sendFortressCommand(socketPath, parsed.command);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const summary = await getFortressSummary(socketPath);
  console.log(`   📊 Stone: ${summary.resources.stone}, Jobs: ${summary.activeJobs}, Tick: ${summary.tick}`);
  if (summary.recentEvents[0]) {
    console.log(`   📰 ${summary.recentEvents[0].message}`);
  }
}

(async () => {
  console.log("⚒️  FORTRESS ADVENTURE - Let's build something!\n");

  await runCommand("/query");
  await runCommand("/dig 25 2 10 8");
  await runCommand("/pause"); // Unpause to let them work

  console.log("\n⏸️  Paused - waiting 3 seconds for mining...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  await runCommand("/query");

  console.log("\n🏗️  Let's try building something!");
  await runCommand("/build workshop 5 5 still");

  console.log("\n👥 Assigning specialized labor:");
  await runCommand("/assign 0 mining");
  await runCommand("/assign 1 brewing");

  await runCommand("/query");

  console.log("\n✨ Fortress commands complete! Check the tmux pane to see the results.");
})();
