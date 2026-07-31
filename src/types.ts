import type { AgentSession } from "@earendil-works/pi-coding-agent";

export type AgentStatus =
  | "created" | "running" | "waiting" | "completed" | "failed"
  | "cancelled" | "interrupted" | "archived";

export interface AgentSpec {
  id: string;
  name: string;
  parent_id: string | null;
  root_run_id: string;
  depth: number;
  model: string;
  thinking_level: string;
  can_spawn_agents: boolean;
  max_children: number;
  tools: string[];
  replication_of?: string;
  independent_context?: boolean;
  role: string;
  goal: string;
  context: string;
  responsibilities: string;
  completion_criteria: string;
  expected_output: string;
}

export interface AgentRecord {
  id: string;
  runId: string;
  parentId: string | null;
  children: string[];
  lineage: string[];
  depth: number;
  task: string;
  taskFingerprint: string;
  expectedOutput: string;
  completionCriteria: string;
  specPath: string;
  sessionFile?: string;
  status: AgentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: AgentResult;
  error?: string;
  replicationOf?: string;
  independentContext?: boolean;
}

export interface AgentResult {
  status: "completed" | "failed" | "cancelled";
  summary: string;
  structured?: unknown;
  completedAt: string;
}

export interface SpawnRequest {
  parentId: string | null;
  name: string;
  role: string;
  task: string;
  expectedOutput: string;
  completionCriteria: string;
  context?: string;
  responsibilities?: string;
  tools?: string[];
  background?: boolean;
  replicationOf?: string;
  independentContext?: boolean;
}

export interface AgentRuntime {
  readonly sessionFile: string | undefined;
  start(prompt: string): Promise<AgentResult>;
  steer(message: string): Promise<void>;
  followUp(message: string): Promise<void>;
  cancel(): Promise<void>;
  dispose(): void;
}

export interface AgentRuntimeFactory {
  create(record: AgentRecord, spec: AgentSpec): Promise<AgentRuntime>;
}

export interface PiSessionRuntime extends AgentRuntime {
  readonly session: AgentSession;
}

export interface ResearchLimits {
  max_depth: number;
  max_children_per_agent: number;
  max_active_agents: number;
  max_total_agents_per_run: number;
  max_iterations_without_progress: number;
  allow_recursive_spawning: boolean;
  max_research_iterations: number;
  agent_timeout_seconds: number;
  /** Maximum number of subagent sessions streaming at the same time (keeps the main chat responsive when the model backend serializes requests). */
  agent_concurrency: number;
}
