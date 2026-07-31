import { createHash, randomUUID } from "node:crypto";
import { writeAgentSpec } from "./agent-spec.js";
import type { AgentRecord, AgentSpec, SpawnRequest } from "./types.js";
import type { RunStore } from "./run-store.js";

export function taskFingerprint(task: string): string {
  return createHash("sha256").update(task.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 20);
}

export class AgentFactory {
  constructor(private readonly store: RunStore, private readonly maxChildren = 8, private readonly allowRecursive = true) {}

  create(runId: string, request: SpawnRequest, parent: AgentRecord | undefined, inherited: { model?: string; thinkingLevel?: string } = {}): { record: AgentRecord; spec: AgentSpec } {
    const id = `${request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "agent"}-${randomUUID().slice(0, 8)}`;
    const depth = parent ? parent.depth + 1 : 0;
    const lineage = parent ? [...parent.lineage, parent.id] : [];
    const spec: AgentSpec = {
      id, name: request.name.trim(), parent_id: parent?.id ?? null, root_run_id: runId, depth,
      model: inherited.model ?? "inherit", thinking_level: inherited.thinkingLevel ?? "inherit",
      can_spawn_agents: !parent || this.allowRecursive, max_children: this.maxChildren,
      tools: request.tools ?? ["read", "grep", "find", "ls", "search_memory", "read_artifact", "publish_finding", "spawn_agent", "agent_control", "web_search", "web_read", "web_crawl", "web_browse", "download_source", "run_experiment", "review_experiment"],
      ...(request.replicationOf ? { replication_of: request.replicationOf } : {}),
      ...(request.independentContext !== undefined ? { independent_context: request.independentContext } : {}),
      role: request.role.trim(), goal: request.task.trim(), context: request.context?.trim() ?? "",
      responsibilities: request.responsibilities?.trim() ?? "Investigate the goal, preserve provenance, and report limitations.",
      completion_criteria: request.completionCriteria.trim(), expected_output: request.expectedOutput.trim(),
    };
    const specPath = writeAgentSpec(this.store.agentDir(runId), spec);
    const record: AgentRecord = {
      id, runId, parentId: parent?.id ?? null, children: [], lineage, depth, task: request.task.trim(),
      taskFingerprint: taskFingerprint(request.task), expectedOutput: request.expectedOutput.trim(),
      completionCriteria: request.completionCriteria.trim(), specPath, status: "created", createdAt: new Date().toISOString(),
      ...(request.replicationOf ? { replicationOf: request.replicationOf } : {}),
      ...(request.independentContext !== undefined ? { independentContext: request.independentContext } : {}),
    };
    return { record, spec };
  }
}
