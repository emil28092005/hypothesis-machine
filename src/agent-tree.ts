import { randomUUID } from "node:crypto";
import { AgentFactory, taskFingerprint } from "./agent-factory.js";
import { readAgentSpec } from "./agent-spec.js";
import type { RunManifest, RunStore } from "./run-store.js";
import type { AgentRecord, AgentResult, AgentRuntime, AgentRuntimeFactory, ResearchLimits, SpawnRequest } from "./types.js";

export class AgentTreeError extends Error {}

export interface TreeOptions {
  runId?: string;
  goal: string;
  supervisorName?: string;
  inherited?: { model?: string; thinkingLevel?: string };
  onRootMessage?: (fromId: string, message: string) => void;
}

export class AgentTree {
  readonly runId: string;
  private manifest: RunManifest;
  private readonly runtimes = new Map<string, AgentRuntime>();
  private readonly executions = new Map<string, Promise<AgentResult>>();
  private readonly factory: AgentFactory;
  private readonly onRootMessage: ((fromId: string, message: string) => void) | undefined;

  constructor(private readonly store: RunStore, private readonly runtimeFactory: AgentRuntimeFactory, private readonly limits: ResearchLimits, options: TreeOptions) {
    this.runId = options.runId ?? `run-${randomUUID().slice(0, 8)}`;
    this.onRootMessage = options.onRootMessage;
    this.factory = new AgentFactory(store, limits.max_children_per_agent, limits.allow_recursive_spawning);
    if (store.exists(this.runId)) {
      this.manifest = store.load(this.runId);
      for (const agent of Object.values(this.manifest.agents)) if (["running", "waiting"].includes(agent.status)) agent.status = "interrupted";
      store.save(this.manifest);
    } else {
      const { record } = this.factory.create(this.runId, {
        parentId: null, name: options.supervisorName ?? "Supervisor", role: "Root research supervisor", task: options.goal,
        expectedOutput: "A sourced synthesis and explicit conclusion", completionCriteria: "The research goal is met or a coded stop condition is recorded",
      }, undefined, options.inherited);
      this.manifest = store.create(this.runId, options.goal, record);
    }
  }

  static restore(store: RunStore, runtimeFactory: AgentRuntimeFactory, limits: ResearchLimits, runId: string, onRootMessage?: (fromId: string, message: string) => void): AgentTree {
    const manifest = store.load(runId);
    return new AgentTree(store, runtimeFactory, limits, { runId, goal: manifest.goal, ...(onRootMessage ? { onRootMessage } : {}) });
  }

  get rootId(): string { return this.manifest.rootAgentId; }
  get status(): RunManifest["status"] { return this.manifest.status; }
  list(): AgentRecord[] { return Object.values(this.manifest.agents).map((item) => structuredClone(item)); }
  inspect(id: string): AgentRecord { const found = this.manifest.agents[id]; if (!found) throw new AgentTreeError(`Unknown agent: ${id}`); return structuredClone(found); }

  private mutable(id: string): AgentRecord { const found = this.manifest.agents[id]; if (!found) throw new AgentTreeError(`Unknown agent: ${id}`); return found; }
  private persist(): void { this.store.save(this.manifest); }
  private activeCount(): number { return Object.values(this.manifest.agents).filter((agent) => ["running", "waiting"].includes(agent.status)).length; }

  private validateSpawn(request: SpawnRequest, parent: AgentRecord): void {
    if (this.manifest.status !== "active") throw new AgentTreeError(`Run is ${this.manifest.status}`);
    if (!request.task.trim() || request.task.trim().length < 12) throw new AgentTreeError("A concrete task of at least 12 characters is required");
    if (!request.expectedOutput.trim()) throw new AgentTreeError("Expected output is required");
    if (!request.completionCriteria.trim()) throw new AgentTreeError("Completion criteria are required");
    if (["cancelled", "failed", "archived"].includes(parent.status)) throw new AgentTreeError(`Parent branch is ${parent.status}`);
    if (!this.limits.allow_recursive_spawning && parent.depth > 0) throw new AgentTreeError("Recursive spawning is disabled");
    if (parent.depth + 1 > this.limits.max_depth) throw new AgentTreeError(`Maximum depth ${this.limits.max_depth} exceeded`);
    const parentSpecLimit = readAgentSpec(parent.specPath).max_children;
    if (parent.children.length >= Math.min(this.limits.max_children_per_agent, parentSpecLimit)) throw new AgentTreeError("Parent child limit exceeded");
    if (this.activeCount() >= this.limits.max_active_agents) throw new AgentTreeError("Active agent limit exceeded");
    if (Object.keys(this.manifest.agents).length >= this.limits.max_total_agents_per_run) throw new AgentTreeError("Total agent limit exceeded");
    const duplicate = Object.values(this.manifest.agents).find((candidate) => candidate.taskFingerprint === taskFingerprint(request.task) && candidate.status !== "cancelled");
    const validReplication = request.replicationOf && request.independentContext === true;
    if (duplicate && !validReplication) throw new AgentTreeError(`Duplicate task already owned by ${duplicate.id}; mark an independent replication explicitly`);
    if (request.replicationOf && !this.manifest.agents[request.replicationOf]) throw new AgentTreeError(`Replication target not found: ${request.replicationOf}`);
    if (request.role.trim().toLowerCase() === parent.task.trim().toLowerCase()) throw new AgentTreeError("A child must have explicit specialization, not copy its parent");
  }

  async spawn(request: SpawnRequest, inherited: { model?: string; thinkingLevel?: string } = {}): Promise<AgentRecord> {
    const parent = this.mutable(request.parentId ?? this.rootId);
    this.validateSpawn(request, parent);
    const { record } = this.factory.create(this.runId, { ...request, parentId: parent.id }, parent, inherited);
    this.manifest.agents[record.id] = record;
    parent.children.push(record.id);
    this.persist();
    if (request.background !== false) void this.start(record.id).catch(() => undefined);
    return structuredClone(record);
  }

  async start(id: string): Promise<AgentResult> {
    const existing = this.executions.get(id);
    if (existing) return existing;
    const record = this.mutable(id);
    if (!["created", "interrupted"].includes(record.status)) throw new AgentTreeError(`Cannot start ${id} from ${record.status}`);
    const spec = readAgentSpec(record.specPath);
    const runtime = await this.runtimeFactory.create(structuredClone(record), spec);
    this.runtimes.set(id, runtime);
    if (runtime.sessionFile) record.sessionFile = runtime.sessionFile;
    record.status = "running"; record.startedAt = new Date().toISOString(); this.persist();
    const prompt = `Execute your specification at ${record.specPath}. Your agent id is ${id}. Return a concise evidence-backed result. Use spawn_agent when a genuinely specialized subtask merits recursion.`;
    const execution = runtime.start(prompt).then((result) => {
      if (record.status === "interrupted") return result;
      if (record.status === "cancelled") return record.result ?? ({ status: "cancelled", summary: "Cancelled", completedAt: record.finishedAt ?? new Date().toISOString() } satisfies AgentResult);
      record.result = result; record.status = result.status; record.finishedAt = result.completedAt; this.persist(); return result;
    }).catch((error: unknown) => {
      record.status = "failed"; record.error = error instanceof Error ? error.message : String(error); record.finishedAt = new Date().toISOString(); this.persist();
      return { status: "failed", summary: record.error, completedAt: record.finishedAt } satisfies AgentResult;
    }).finally(() => { runtime.dispose(); this.runtimes.delete(id); this.executions.delete(id); });
    this.executions.set(id, execution);
    return execution;
  }

  async message(id: string, text: string, fromId = "system"): Promise<void> { if (id === this.rootId && !this.runtimes.has(id)) { if (!this.onRootMessage) throw new AgentTreeError("Supervisor message bridge is unavailable"); this.onRootMessage(fromId, text); return; } return this.followUp(id, text); }
  async steer(id: string, text: string): Promise<void> { const runtime = this.runtimes.get(id); if (!runtime) throw new AgentTreeError(`${id} is not running`); await runtime.steer(text); }
  async followUp(id: string, text: string): Promise<void> { const runtime = this.runtimes.get(id); if (!runtime) throw new AgentTreeError(`${id} is not running`); await runtime.followUp(text); }
  async wait(id: string): Promise<AgentResult> { const execution = this.executions.get(id); if (execution) return execution; const record = this.mutable(id); if (record.result) return record.result; throw new AgentTreeError(`${id} has no result and is not running`); }
  async waitMany(ids: string[]): Promise<AgentResult[]> { return Promise.all(ids.map((id) => this.wait(id))); }

  async cancel(id: string): Promise<void> {
    const record = this.mutable(id); await this.runtimes.get(id)?.cancel(); record.status = "cancelled"; record.finishedAt = new Date().toISOString(); record.result = { status: "cancelled", summary: "Cancelled by branch control", completedAt: record.finishedAt }; this.persist();
  }
  async cancelBranch(id: string): Promise<void> { const record = this.mutable(id); await Promise.all(record.children.map((child) => this.cancelBranch(child))); await this.cancel(id); }
  collectResult(id: string): AgentResult | undefined { return this.mutable(id).result ? structuredClone(this.mutable(id).result) : undefined; }
  archive(id: string): void { const record = this.mutable(id); if (["running", "waiting"].includes(record.status)) throw new AgentTreeError("Cancel a running agent before archiving"); record.status = "archived"; this.persist(); }
  pause(): void { this.manifest.status = "paused"; this.persist(); }
  resume(): void { this.manifest.status = "active"; this.persist(); }
  setGoal(goal: string): void { this.manifest.goal = goal.trim(); const root = this.mutable(this.rootId); if (root.children.length === 0) { root.task = goal.trim(); root.taskFingerprint = taskFingerprint(goal); } this.persist(); }
  async stop(): Promise<void> { this.manifest.status = "stopped"; await this.cancelBranch(this.rootId); this.persist(); }
  async shutdown(): Promise<void> {
    for (const [id, runtime] of this.runtimes) { await runtime.cancel().catch(() => undefined); const record = this.mutable(id); if (record.status === "running" || record.status === "waiting") record.status = "interrupted"; runtime.dispose(); }
    this.runtimes.clear(); this.executions.clear(); this.persist();
  }

  render(): string {
    const lines: string[] = [];
    const walk = (id: string, prefix: string, last: boolean, root = false) => {
      const agent = this.mutable(id); lines.push(`${root ? "" : `${prefix}${last ? "└─ " : "├─ "}`}${agent.id} [${agent.status}] — ${agent.task}`);
      const childPrefix = root ? "" : `${prefix}${last ? "   " : "│  "}`;
      agent.children.forEach((child, index) => walk(child, childPrefix, index === agent.children.length - 1));
    };
    walk(this.rootId, "", true, true); return lines.join("\n");
  }
}
