import { resolve } from "node:path";
import { defineTool, ModelRuntime, type ExtensionAPI, type ExtensionContext, type ModelRegistry, type Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { AgentTree } from "./agent-tree.js";
import { loadConfig, type HypothesisMachineConfig } from "./config.js";
import { PiAgentRuntimeFactory } from "./pi-runtime.js";
import { ResearchLoop } from "./research-loop.js";
import { ResearchMemory } from "./research-memory.js";
import { RunStore } from "./run-store.js";
import { ExperimentRunner } from "./tools/experiment.js";
import { createResearchTools } from "./tools/index.js";
import { WebGateway } from "./tools/web.js";

const RUN_ENTRY = "hypothesis-machine-run";
const toolText = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], details: {} });

export class SupervisorIntegration {
  config: HypothesisMachineConfig | undefined; tree: AgentTree | undefined; memory: ResearchMemory | undefined; web: WebGateway | undefined; experiments: ExperimentRunner | undefined; loop: ResearchLoop | undefined;
  private modelRuntime: ModelRuntime | undefined;
  private modelRegistry: ModelRegistry | undefined;
  private lastScheduledIteration = 0;
  private widgetTimer: NodeJS.Timeout | undefined;
  private requestAgentRender: (() => void) | undefined;
  constructor(private readonly pi: ExtensionAPI) {}

  async start(ctx: ExtensionContext): Promise<void> {
    this.config = loadConfig(ctx.cwd); const stateDir = resolve(ctx.cwd, this.config.state_dir); const store = new RunStore(stateDir);
    this.memory = new ResearchMemory(stateDir); this.web = new WebGateway(this.config, this.memory); this.experiments = new ExperimentRunner(stateDir, this.config.experiment);
    const Runtime = ModelRuntime as unknown as { create?: () => Promise<ModelRuntime> } | undefined;
    if (typeof Runtime?.create === "function") this.modelRuntime = await Runtime.create();
    else this.modelRegistry = ctx.modelRegistry;
    const previous = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === RUN_ENTRY);
    const runId = previous && previous.type === "custom" ? (previous.data as { runId?: string } | undefined)?.runId : undefined;
    const runtimeFactory = new PiAgentRuntimeFactory({ cwd: ctx.cwd, config: this.config, store, memory: this.memory, web: this.web, experiments: this.experiments, ...(this.modelRuntime ? { modelRuntime: this.modelRuntime } : {}), ...(this.modelRegistry ? { modelRegistry: this.modelRegistry } : {}), ...(ctx.model ? { model: ctx.model } : {}), ...(ctx.thinkingLevel ? { thinkingLevel: ctx.thinkingLevel } : {}) });
    const onRootMessage = (fromId: string, message: string) => this.pi.sendMessage({ customType: "hypothesis-machine-agent-update", content: `Agent ${fromId} reports:\n\n${message}`, display: true, details: { fromId, runId: this.tree?.runId } }, { triggerTurn: false, deliverAs: "nextTurn" });
    this.tree = runId && store.exists(runId) ? AgentTree.restore(store, runtimeFactory, this.config, runId, onRootMessage) : new AgentTree(store, runtimeFactory, this.config, { goal: "Research requested in the current Supervisor session", inherited: { model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "inherit", thinkingLevel: ctx.thinkingLevel ?? "inherit" }, onRootMessage });
    runtimeFactory.attachTree(this.tree); if (!runId) this.pi.appendEntry(RUN_ENTRY, { runId: this.tree.runId });
    this.loop = new ResearchLoop(stateDir, this.tree.runId, this.tree.inspect(this.tree.rootId).task, this.config);
    this.lastScheduledIteration = this.loop.snapshot().iteration;
    const tools = createResearchTools({ tree: this.tree, parentId: this.tree.rootId, memory: this.memory, web: this.web, experiments: this.experiments, cwd: ctx.cwd });
    for (const tool of [...tools, this.researchControlTool()]) this.pi.registerTool(this.withCompactRenderer(tool));
    if (ctx.hasUI) { ctx.ui.setStatus("hypothesis-machine", `HM ${this.tree.runId} · ready`); this.installAgentWidget(ctx); }
  }

  private required() { if (!this.tree || !this.loop || !this.memory || !this.web || !this.experiments) throw new Error("Hypothesis Machine has not received session_start"); return { tree: this.tree, loop: this.loop, memory: this.memory, web: this.web, experiments: this.experiments }; }

  private researchControlTool(): ToolDefinition {
    return defineTool({
      name: "research_control", label: "Research loop control", description: "Start, record, inspect, pause, resume, or stop the explicit research state machine. Record one report per completed iteration; coded stop conditions prevent infinite prompt loops.",
      promptSnippet: "Control the bounded autonomous research loop",
      parameters: Type.Object({ action: StringEnum(["start", "status", "record_iteration", "pause", "resume", "stop"] as const), goal: Type.Optional(Type.String()), report: Type.Optional(Type.Object({ goal: Type.String(), tasks: Type.Array(Type.String()), activeAgents: Type.Array(Type.String()), expectedOutput: Type.String(), state: Type.String(), newFindings: Type.Integer({ minimum: 0 }), closedQuestions: Type.Integer({ minimum: 0 }), contradictions: Type.Integer({ minimum: 0 }), reason: Type.String(), goalAchieved: Type.Optional(Type.Boolean()), criticalMethodError: Type.Optional(Type.Boolean()), onlyExternalQuestions: Type.Optional(Type.Boolean()), userDecisionRequired: Type.Optional(Type.Boolean()) })) }),
      execute: async (_id, params) => { const { tree, loop } = this.required(); if (params.action === "start") { if (!params.goal?.trim()) throw new Error("goal is required"); const loopState = loop.snapshot(); const loopTerminal = ["stopped", "completed"].includes(loopState.status); const root = tree.inspect(tree.rootId); const rootSpawnable = !["cancelled", "failed", "archived"].includes(root.status); if (loopTerminal || tree.status !== "active" || !rootSpawnable) tree.restart(params.goal); loop.setGoal(params.goal); loop.start(); return toolText(loop.snapshot()); } if (params.action === "status") return toolText(loop.snapshot()); if (params.action === "pause") { if (loop.snapshot().status !== "running") throw new Error(`Cannot pause a ${loop.snapshot().status} loop`); loop.pause(); tree.pause(); } else if (params.action === "resume") { if (loop.snapshot().status !== "paused") throw new Error("Only a paused loop can resume"); loop.resume(); tree.resume(); } else if (params.action === "stop") { loop.stop(); await tree.stop(); } else { if (!params.report) throw new Error("report is required"); return toolText(loop.record(params.report)); } return toolText(loop.snapshot()); },
    });
  }

  private withCompactRenderer(tool: ToolDefinition): ToolDefinition {
    if (tool.name !== "spawn_agent") return tool;
    return { ...tool, renderCall: (args: any, theme) => new Text(`${theme.fg("accent", "◆ spawn_agent")}: ${args.name}\n  parent: ${this.tree?.rootId ?? "?"}\n  status: starting`, 0, 0), renderResult: (result, _options, theme) => new Text(theme.fg("muted", result.content.filter((part) => part.type === "text").map((part: any) => part.text).join("\n")), 0, 0) };
  }

  team(): string { return this.required().tree.render(); }
  findings(kind?: string): unknown { return this.required().memory.list(kind); }

  /** Live subagent dashboard widget above the editor, refreshed on a light timer. */
  private installAgentWidget(ctx: ExtensionContext): void {
    ctx.ui.setWidget("hm-agents", (tui, theme) => {
      this.requestAgentRender = () => tui.requestRender();
      return {
        render: (width) => this.agentWidgetLines(theme).map((line) => truncateToWidth(line, width)),
        invalidate: () => { /* lines are rebuilt fresh on every render */ },
      };
    });
    this.widgetTimer = setInterval(() => { this.requestAgentRender?.(); }, 1500);
  }

  private agentWidgetLines(theme: Theme): string[] {
    const tree = this.tree; const loop = this.loop;
    if (!tree || !loop) return [];
    const state = loop.snapshot();
    const agents = tree.list();
    const active = agents.filter((agent) => agent.status === "running" || agent.status === "waiting");
    if (active.length === 0 && state.status !== "running") return [];
    const now = Date.now();
    const lines: string[] = [theme.fg("accent", `◆ ${state.runId} · ${state.status} · iter ${state.iteration} · ${active.length} active`)];
    for (const agent of active) {
      const elapsed = agent.startedAt ? Math.max(0, Math.round((now - Date.parse(agent.startedAt)) / 1000)) : 0;
      const stamp = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
      lines.push(`  ${theme.fg("accent", "▸")} ${this.shortName(agent.id)} ${theme.fg("dim", stamp)}`);
    }
    for (const agent of agents.filter((agent) => agent.status === "completed" || agent.status === "failed").slice(-2).reverse()) {
      const icon = agent.status === "completed" ? theme.fg("success", "✓") : theme.fg("error", "✖");
      lines.push(`  ${icon} ${this.shortName(agent.id)} ${theme.fg("dim", agent.status)}`);
    }
    return lines;
  }

  private shortName(id: string): string { return id.replace(/-[a-f0-9]{8}$/, ""); }
  continueIfNeeded(ctx: ExtensionContext): void { const loop = this.loop; if (!loop || !ctx.isIdle()) return; const state = loop.snapshot(); if (state.status !== "running" || state.iteration <= this.lastScheduledIteration) return; this.lastScheduledIteration = state.iteration; if (ctx.hasUI) ctx.ui.setStatus("hypothesis-machine", `HM ${state.runId} · iteration ${state.iteration + 1}`); this.pi.sendUserMessage(`Continue bounded research run ${state.runId} with iteration ${state.iteration + 1}. Reassess unknowns and contradictions, use agents only where they add information, then call research_control record_iteration. Stop when its coded state is no longer running.`); }
  async shutdown(): Promise<void> { if (this.widgetTimer) { clearInterval(this.widgetTimer); this.widgetTimer = undefined; } this.requestAgentRender = undefined; await this.tree?.shutdown(); this.memory?.close(); this.tree = undefined; }
}
