import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { SupervisorIntegration } from "./supervisor.js";

export default function hypothesisMachine(pi: ExtensionAPI): void {
  const supervisor = new SupervisorIntegration(pi);
  pi.registerMessageRenderer("hypothesis-machine-agent-update", (message, _options, theme) => new Text(`${theme.fg("accent", "◆ agent update")}\n${message.content}`, 0, 0));
  pi.on("session_start", async (_event, ctx) => { try { await supervisor.start(ctx); } catch (error) { ctx.ui.notify(`Hypothesis Machine failed to initialize: ${error instanceof Error ? error.message : String(error)}`, "error"); } });
  pi.on("agent_settled", async (_event, ctx) => { supervisor.continueIfNeeded(ctx); });
  pi.on("agent_end", async (_event, ctx) => { supervisor.continueIfNeeded(ctx); });
  pi.on("session_shutdown", async () => { await supervisor.shutdown(); });

  pi.registerCommand("team", { description: "Show the recursive research team", handler: async (_args, ctx) => { ctx.ui.notify(supervisor.team(), "info"); } });
  pi.registerCommand("agents", { description: "Show the interactive agent tree overlay", handler: async (_args, ctx) => { await supervisor.showAgentTree(ctx); } });
  pi.registerCommand("research", { description: "Start a bounded research run", handler: async (args, ctx) => { const goal = args.trim(); if (!goal) { ctx.ui.notify("Usage: /research <goal>", "warning"); return; } const state = supervisor.loop; if (!state || !supervisor.tree) throw new Error("Not initialized"); supervisor.tree.setGoal(goal); state.setGoal(goal); state.start(); const prompt = `Research goal: ${goal}\nUse research_control and the recursive agent tools. Create specialized children only when useful. Record each iteration and stop on the coded conditions. Report important progress without flooding the chat.`; if (ctx.isIdle()) pi.sendUserMessage(prompt); else pi.sendUserMessage(prompt, { deliverAs: "followUp" }); } });
  pi.registerCommand("research-status", { description: "Show research loop state", handler: async (_args, ctx) => { ctx.ui.notify(JSON.stringify(supervisor.loop?.snapshot() ?? {}, null, 2), "info"); } });
  pi.registerCommand("research-pause", { description: "Pause spawning and the loop", handler: async (_args, ctx) => { if (supervisor.loop?.snapshot().status !== "running") { ctx.ui.notify("Cannot pause a non-running loop", "warning"); return; } supervisor.loop?.pause(); supervisor.tree?.pause(); ctx.ui.notify("Research paused", "info"); } });
  pi.registerCommand("research-resume", { description: "Resume a paused loop", handler: async (_args, ctx) => { if (supervisor.loop?.snapshot().status !== "paused") { ctx.ui.notify("Only a paused loop can resume", "warning"); return; } supervisor.loop?.resume(); supervisor.tree?.resume(); ctx.ui.notify("Research resumed", "info"); } });
  pi.registerCommand("research-stop", { description: "Stop the run and cancel all branches", handler: async (_args, ctx) => { supervisor.loop?.stop(); await supervisor.tree?.stop(); ctx.ui.notify("Research stopped; active branches cancelled", "warning"); } });
  pi.registerCommand("findings", { description: "List synthesized findings", handler: async (_args, ctx) => { ctx.ui.notify(JSON.stringify(supervisor.findings(), null, 2), "info"); } });
  pi.registerCommand("hypotheses", { description: "List stored hypotheses", handler: async (_args, ctx) => { ctx.ui.notify(JSON.stringify(supervisor.findings("hypothesis"), null, 2), "info"); } });
}

export * from "./agent-tree.js";
export * from "./agent-spec.js";
export * from "./research-memory.js";
export * from "./research-loop.js";
export * from "./tools/web.js";
export * from "./tools/experiment.js";
