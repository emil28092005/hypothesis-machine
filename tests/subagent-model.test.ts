import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentTree } from "../src/agent-tree.js";
import { readAgentSpec } from "../src/agent-spec.js";
import { DEFAULT_CONFIG, DEFAULT_SUBAGENT_MODEL } from "../src/config.js";
import { RunStore } from "../src/run-store.js";
import { createResearchTools } from "../src/tools/index.js";
import { FakeRuntimeFactory } from "./helpers.js";

describe("subagent model selection", () => {
  it("pins spawned agents to DeepSeek V4 Flash instead of the caller model", async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "hm-subagent-model-"));
    const store = new RunStore(cwd);
    const tree = new AgentTree(store, new FakeRuntimeFactory(), DEFAULT_CONFIG, { goal: "Test subagent model routing" });
    const spawn = createResearchTools({ tree, parentId: tree.rootId, memory: {} as any, web: {} as any, experiments: {} as any, cwd }).find((tool) => tool.name === "spawn_agent")!;

    await spawn.execute("spawn-1", {
      name: "Direct API verifier", role: "routing verifier", task: "Verify that subagents use the configured direct model", expected_output: "Agent specification", completion_criteria: "Model is pinned", background: false,
    }, undefined, undefined, { model: { provider: "openai", id: "gpt-5.6-terra" }, thinkingLevel: "high" } as any);

    const child = tree.list().find((agent) => agent.id !== tree.rootId)!;
    expect(readAgentSpec(child.specPath).model).toBe(DEFAULT_SUBAGENT_MODEL);
  });
});
