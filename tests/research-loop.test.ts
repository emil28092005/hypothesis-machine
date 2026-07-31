import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { ResearchLoop } from "../src/research-loop.js";

const report = (newFindings = 0) => ({ goal: "goal", tasks: ["task"], activeAgents: [], expectedOutput: "finding", state: "synthesized", newFindings, closedQuestions: 0, contradictions: 0, reason: "evaluation" });
describe("ResearchLoop", () => {
  it("stops after configured iterations without information gain", () => { const loop = new ResearchLoop(mkdtempSync(resolve(tmpdir(), "hm-loop-")), "run", "goal", { ...DEFAULT_CONFIG, max_iterations_without_progress: 2 }); loop.start(); loop.record(report()); expect(loop.record(report()).status).toBe("completed"); expect(loop.snapshot().stopReason).toMatch(/without information gain/); });
  it("resets no-progress counter and handles pause/resume", () => { const loop = new ResearchLoop(mkdtempSync(resolve(tmpdir(), "hm-loop-")), "run", "goal", DEFAULT_CONFIG); loop.start(); loop.record(report()); loop.record(report(1)); expect(loop.snapshot().noProgressIterations).toBe(0); loop.pause(); expect(loop.snapshot().status).toBe("paused"); loop.resume(); expect(loop.snapshot().status).toBe("running"); });
});
