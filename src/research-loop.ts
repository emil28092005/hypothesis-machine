import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResearchLimits } from "./types.js";

export type LoopStatus = "planning" | "running" | "paused" | "completed" | "stopped" | "blocked";
export interface IterationReport { goal: string; tasks: string[]; activeAgents: string[]; expectedOutput: string; state: string; newFindings: number; closedQuestions: number; contradictions: number; reason: string; criticalMethodError?: boolean; onlyExternalQuestions?: boolean; userDecisionRequired?: boolean; goalAchieved?: boolean }
export interface ResearchLoopState { runId: string; goal: string; status: LoopStatus; iteration: number; noProgressIterations: number; createdAt: string; updatedAt: string; reports: IterationReport[]; stopReason?: string }

export class ResearchLoop {
  private state: ResearchLoopState;
  private readonly path: string;
  constructor(stateDir: string, runId: string, goal: string, private readonly limits: ResearchLimits) {
    this.path = resolve(stateDir, "runs", runId, "research-loop.json"); mkdirSync(resolve(stateDir, "runs", runId), { recursive: true });
    this.state = (() => { try { return JSON.parse(readFileSync(this.path, "utf8")) as ResearchLoopState; } catch { const now = new Date().toISOString(); return { runId, goal, status: "planning", iteration: 0, noProgressIterations: 0, createdAt: now, updatedAt: now, reports: [] }; } })(); this.persist();
  }
  snapshot(): ResearchLoopState { return structuredClone(this.state); }
  setGoal(goal: string): void { if (this.state.iteration > 0 && this.state.goal !== goal.trim()) throw new Error("Start a new research run to change the goal after iterations have been recorded"); this.state.goal = goal.trim(); this.persist(); }
  start(): void { if (["completed", "stopped"].includes(this.state.status)) throw new Error(`Research loop is ${this.state.status}`); this.state.status = "running"; this.persist(); }
  pause(): void { if (this.state.status === "running") { this.state.status = "paused"; this.persist(); } }
  resume(): void { if (this.state.status !== "paused") throw new Error("Only a paused loop can resume"); this.state.status = "running"; this.persist(); }
  stop(reason = "Stopped by user"): void { this.state.status = "stopped"; this.state.stopReason = reason; this.persist(); }
  record(report: IterationReport): ResearchLoopState {
    if (this.state.status !== "running") throw new Error(`Cannot record iteration while ${this.state.status}`);
    this.state.iteration++; this.state.reports.push(report);
    const progress = report.newFindings + report.closedQuestions + report.contradictions;
    this.state.noProgressIterations = progress > 0 ? 0 : this.state.noProgressIterations + 1;
    if (report.goalAchieved) this.finish("completed", "Goal achieved");
    else if (report.criticalMethodError) this.finish("blocked", "Critical methodological error");
    else if (report.userDecisionRequired) this.finish("blocked", "User decision required");
    else if (report.onlyExternalQuestions) this.finish("blocked", "Only externally verifiable questions remain");
    else if (this.state.noProgressIterations >= this.limits.max_iterations_without_progress) this.finish("completed", `${this.state.noProgressIterations} iterations without information gain`);
    else if (this.state.iteration >= this.limits.max_research_iterations) this.finish("completed", "Iteration limit reached");
    this.persist(); return this.snapshot();
  }
  private finish(status: "completed" | "blocked", reason: string): void { this.state.status = status; this.state.stopReason = reason; }
  private persist(): void { this.state.updatedAt = new Date().toISOString(); writeFileSync(this.path, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); }
}
