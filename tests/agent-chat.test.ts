import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RunStore } from "../src/run-store.js";
import { buildAgentChatOptions, runIdFromSessionPath } from "../src/supervisor.js";
import type { AgentRecord } from "../src/types.js";

const base: Omit<AgentRecord, "id" | "status" | "startedAt" | "finishedAt"> = {
  runId: "run-test", parentId: "root", children: [], lineage: [], depth: 1,
  task: "x", taskFingerprint: "x", expectedOutput: "", completionCriteria: "", specPath: "",
  createdAt: new Date(Date.now() - 60_000).toISOString(),
};
const mk = (id: string, status: AgentRecord["status"], startedMin: number, finishedMin?: number): AgentRecord => {
  const record: AgentRecord = {
    ...base, id, status,
    startedAt: new Date(Date.now() - startedMin * 60_000).toISOString(),
  };
  if (finishedMin !== undefined) record.finishedAt = new Date(Date.now() - finishedMin * 60_000).toISOString();
  return record;
};

describe("runIdFromSessionPath", () => {
  const stateDir = "/proj/.hypothesis-machine";
  it("derives the run id from an agent session file under the state dir", () => {
    const sessionFile = resolve(stateDir, "runs/run-132965dd/sessions/agent-abc123.jsonl");
    expect(runIdFromSessionPath(sessionFile, stateDir)).toBe("run-132965dd");
  });
  it("returns undefined for session files outside the state dir", () => {
    expect(runIdFromSessionPath("/proj/.hypothesis-machine/other/file.jsonl", stateDir)).toBeUndefined();
    expect(runIdFromSessionPath(resolve(stateDir, "runs/x.jsonl"), stateDir)).toBeUndefined();
    expect(runIdFromSessionPath(undefined, stateDir)).toBeUndefined();
    expect(runIdFromSessionPath("/home/emil/.pi/agent/sessions/main.jsonl", stateDir)).toBeUndefined();
  });
  it("rejects malformed run ids", () => {
    expect(runIdFromSessionPath(resolve(stateDir, "runs/../evil/sessions/a.jsonl"), stateDir)).toBeUndefined();
  });
});

describe("buildAgentChatOptions", () => {
  it("formats status glyphs, short names, elapsed time and task", () => {
    const now = Date.now();
    const options = buildAgentChatOptions([
      mk("market-competitors-bb389dda", "running", 3),
      mk("science-education-niches-293d399a", "completed", 55, 12),
      mk("demand-b2b-b2g-57637d25", "failed", 40, 9),
    ], now);
    expect(options).toHaveLength(3);
    expect(options[0]).toContain("• market-competitors [running] 03:00");
    expect(options[0]).toContain("x");
    expect(options[1]).toContain("✓ science-education-niches [completed] 43:00");
    expect(options[2]).toContain("✖ demand-b2b-b2g [failed] 31:00");
  });
  it("collapses whitespace in the task", () => {
    const agent = mk("a-bb1", "waiting", 1);
    agent.task = "  Multi\nline   task  ";
    expect(buildAgentChatOptions([agent], Date.now())[0]).toContain("— Multi line task");
  });
});

describe("RunStore mainSessionFile", () => {
  it("persists and reads back the main session file", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-runstore-"));
    try {
      const store = new RunStore(dir);
      const runId = "run-main";
      const root: AgentRecord = { ...base, id: "root", parentId: null, depth: 0, runId, status: "completed" };
      store.create(runId, "goal", root);
      expect(store.mainSessionFileOf(runId)).toBeUndefined();
      store.setMainSessionFile(runId, "/main/session.jsonl");
      expect(store.mainSessionFileOf(runId)).toBe("/main/session.jsonl");
      // survives reload
      const reloaded = new RunStore(dir);
      expect(reloaded.mainSessionFileOf(runId)).toBe("/main/session.jsonl");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
