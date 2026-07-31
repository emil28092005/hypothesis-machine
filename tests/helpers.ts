import type { AgentRecord, AgentResult, AgentRuntime, AgentRuntimeFactory, AgentSpec } from "../src/types.js";

export class FakeRuntime implements AgentRuntime {
  sessionFile: string | undefined;
  steered: string[] = []; followed: string[] = []; cancelled = false;
  constructor(readonly id: string, private readonly delay = 0) { this.sessionFile = `/fake/${id}.jsonl`; }
  async start(prompt: string): Promise<AgentResult> { if (this.delay) await new Promise((resolve) => setTimeout(resolve, this.delay)); return { status: this.cancelled ? "cancelled" : "completed", summary: `result:${this.id}:${prompt.includes(this.id)}`, structured: { id: this.id }, completedAt: new Date().toISOString() }; }
  async steer(message: string) { this.steered.push(message); }
  async followUp(message: string) { this.followed.push(message); }
  async cancel() { this.cancelled = true; }
  dispose() {}
}

export class FakeRuntimeFactory implements AgentRuntimeFactory {
  runtimes = new Map<string, FakeRuntime>();
  constructor(private readonly delay = 0) {}
  async create(record: AgentRecord, spec: AgentSpec): Promise<AgentRuntime> { void spec; const runtime = new FakeRuntime(record.id, this.delay); this.runtimes.set(record.id, runtime); return runtime; }
}
