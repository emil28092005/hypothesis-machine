import { describe, expect, it } from "vitest";
import { parseAgentSpec, serializeAgentSpec, AgentSpecError } from "../src/agent-spec.js";

const spec = { id: "statistical-reviewer", name: "Statistical Reviewer", parent_id: "lead", root_run_id: "run-1", depth: 2, model: "inherit", thinking_level: "inherit", can_spawn_agents: true, max_children: 6, tools: ["read", "spawn_agent"], role: "Independent statistical reviewer", goal: "Review EXP-014 for leakage", context: "experiment/EXP-014", responsibilities: "Check metrics and split", completion_criteria: "Reproduced or invalidated", expected_output: "Structured review" };

describe("agent markdown", () => {
  it("round-trips validated frontmatter and sections", () => expect(parseAgentSpec(serializeAgentSpec(spec))).toEqual(spec));
  it("rejects missing required sections", () => expect(() => parseAgentSpec("---\nid: okay\n---\n# Role\nX")).toThrow(AgentSpecError));
  it("rejects unsafe ids", () => expect(() => parseAgentSpec(serializeAgentSpec({ ...spec, id: "../escape" }))).toThrow(/kebab-case/));
});
