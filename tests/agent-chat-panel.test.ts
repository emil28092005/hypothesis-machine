import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { buildTreeRows, parseAgentModel, parseAgentTranscript, renderTranscriptLines, shortAgentName } from "../src/agent-chat-panel.js";
import type { AgentRecord } from "../src/types.js";

const SESSION_HEADER = [
  '{"type":"session","version":3,"id":"s-1","timestamp":"2026-07-31T00:00:00.000Z","cwd":"/proj"}',
  '{"type":"model_change","id":"m-1","parentId":null,"timestamp":"2026-07-31T00:00:00.000Z","provider":"deepseek","modelId":"deepseek-v4-flash"}',
].join("\n");

const USER_MSG = '{"type":"message","id":"u-1","parentId":null,"timestamp":"2026-07-31T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Research the market"}]}}';

const ASSISTANT_MSG = '{"type":"message","id":"a-1","parentId":"u-1","timestamp":"2026-07-31T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I should spawn a child."},{"type":"text","text":"I will delegate."},{"type":"toolCall","id":"call_1","name":"spawn_agent","arguments":"{\\"name\\":\\"critic\\"}"}],"model":"deepseek-v4-flash"}}';

const TOOL_RESULT_MSG = '{"type":"message","id":"t-1","parentId":"a-1","timestamp":"2026-07-31T00:00:03.000Z","message":{"role":"toolResult","toolCallId":"call_1","toolName":"spawn_agent","content":[{"type":"text","text":"{\\"status\\":\\"completed\\"}"}]}}';

const MALFORMED = "{not json";

function writeSession(dir: string, lines: string[]): string {
  const file = join(dir, "agent.jsonl");
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return file;
}

describe("parseAgentTranscript", () => {
  it("extracts user, assistant, thinking, tool calls and tool results in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-transcript-"));
    try {
      const file = writeSession(dir, [SESSION_HEADER, USER_MSG, ASSISTANT_MSG, TOOL_RESULT_MSG, MALFORMED].flatMap((line) => [line]));
      const entries = parseAgentTranscript(file);
      expect(entries.map((entry) => entry.role)).toEqual(["user", "assistant", "thinking", "tool", "tool"]);
      expect(entries[0]).toMatchObject({ role: "user", label: "user", text: "Research the market" });
      expect(entries[1]).toMatchObject({ role: "assistant", label: "assistant", text: "I will delegate." });
      expect(entries[2]).toMatchObject({ role: "thinking", label: "thinking" });
      expect(entries[2]?.text).toContain("spawn a child");
      expect(entries[3]).toMatchObject({ role: "tool", label: "→ spawn_agent" });
      expect(entries[3]?.text).toContain('"name": "critic"');
      expect(entries[4]).toMatchObject({ role: "tool", label: "← spawn_agent" });
      expect(entries[4]?.text).toContain('"status":"completed"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-message entries and malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-transcript-"));
    try {
      const file = writeSession(dir, [SESSION_HEADER, MALFORMED]);
      expect(parseAgentTranscript(file)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads the actual provider/model from a model-change entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-transcript-"));
    try {
      const file = writeSession(dir, [SESSION_HEADER, ASSISTANT_MSG]);
      expect(parseAgentModel(file)).toBe("deepseek/deepseek-v4-flash");
      expect(parseAgentModel(undefined)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the task when the file is missing or absent", () => {
    expect(parseAgentTranscript(undefined)).toEqual([]);
    expect(parseAgentTranscript(undefined, "Do the thing")).toEqual([{ role: "assistant", label: "task", text: "Do the thing" }]);
    expect(parseAgentTranscript("/no/such/file.jsonl", "Fallback")).toEqual([{ role: "assistant", label: "task", text: "Fallback" }]);
  });
});

const base: Omit<AgentRecord, "id" | "status"> = {
  runId: "run-test", parentId: "root", children: [], lineage: [], depth: 0,
  task: "t", taskFingerprint: "t", expectedOutput: "", completionCriteria: "", specPath: "",
  createdAt: new Date().toISOString(),
};
const agent = (id: string, status: AgentRecord["status"], parentId: string | null, depth: number, startedMin: number, finishedMin?: number): AgentRecord => {
  const record: AgentRecord = { ...base, id, parentId, depth, status, startedAt: new Date(Date.now() - startedMin * 60_000).toISOString() };
  if (finishedMin !== undefined) record.finishedAt = new Date(Date.now() - finishedMin * 60_000).toISOString();
  return record;
};

describe("buildTreeRows", () => {
  it("flattens depth-first with depth and short names", () => {
    const root = agent("supervisor-91e05755", "created", null, 0, 0);
    const lead = agent("arithmetic-lead-80d7cee9", "running", root.id, 1, 3);
    const calc = agent("independent-calculator-39d08b41", "completed", lead.id, 2, 5, 2);
    root.children = [lead.id]; lead.children = [calc.id];
    const rows = buildTreeRows([root, lead, calc], root.id, Date.now());
    expect(rows.map((row) => row.id)).toEqual([root.id, lead.id, calc.id]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.name)).toEqual(["supervisor", "arithmetic-lead", "independent-calculator"]);
    expect(rows[1]?.elapsed).toMatch(/^\d{2}:\d{2}$/);
    expect(rows[0]?.elapsed).toBe("");
    expect(rows[1]?.status).toBe("running");
    expect(rows[1]?.hasSession).toBe(false);
  });

  it("computes elapsed from start to finish for completed agents", () => {
    const lead = agent("arithmetic-lead-80d7cee9", "completed", "supervisor-91e05755", 1, 10, 4);
    const root = agent("supervisor-91e05755", "created", null, 0, 0);
    root.children = [lead.id];
    const rows = buildTreeRows([root, lead], root.id, Date.now());
    expect(rows[1]?.elapsed).toBe("06:00");
  });
});

describe("renderTranscriptLines", () => {
  it("adds role separators and wraps content to the width", () => {
    const entries = [
      { role: "user" as const, label: "user", text: "short" },
      { role: "assistant" as const, label: "assistant", text: "word ".repeat(40) },
    ];
    const width = 30;
    const lines = renderTranscriptLines(entries, width);
    expect(lines[0]).toMatchObject({ kind: "separator", role: "user" });
    expect(lines[0]?.text.startsWith("── user")).toBe(true);
    expect(lines[1]).toMatchObject({ kind: "content", role: "user", text: "short" });
    for (const line of lines) expect(visibleWidth(line.text)).toBeLessThanOrEqual(width);
    expect(lines.filter((line) => line.role === "assistant" && line.kind === "content").length).toBeGreaterThan(2);
  });

  it("stays width-safe with long labels", () => {
    const lines = renderTranscriptLines([{ role: "tool" as const, label: "← some_really_long_tool_name", text: "x" }], 20);
    expect(visibleWidth(lines[0]!.text)).toBeLessThanOrEqual(20);
  });
});

describe("shortAgentName", () => {
  it("strips the trailing 8-hex id", () => {
    expect(shortAgentName("arithmetic-lead-80d7cee9")).toBe("arithmetic-lead");
    expect(shortAgentName("plain")).toBe("plain");
  });
});
