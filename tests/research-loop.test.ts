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
  it("restarts from stopped and resets counters and reports", () => { const loop = new ResearchLoop(mkdtempSync(resolve(tmpdir(), "hm-loop-")), "run", "goal", DEFAULT_CONFIG); loop.start(); loop.record(report(1)); expect(loop.snapshot().iteration).toBe(1); loop.stop(); expect(loop.snapshot().status).toBe("stopped"); loop.start(); expect(loop.snapshot().status).toBe("running"); expect(loop.snapshot().iteration).toBe(0); expect(loop.snapshot().reports).toHaveLength(0); expect(loop.snapshot().stopReason).toBeUndefined(); });
  it("allows changing the goal after stop, then restarting", () => { const loop = new ResearchLoop(mkdtempSync(resolve(tmpdir(), "hm-loop-")), "run", "old goal", DEFAULT_CONFIG); loop.start(); loop.record(report()); loop.stop(); loop.setGoal("new goal"); expect(loop.snapshot().goal).toBe("new goal"); loop.start(); expect(loop.snapshot().status).toBe("running"); });
  it("rejects changing the goal mid-run after iterations", () => { const loop = new ResearchLoop(mkdtempSync(resolve(tmpdir(), "hm-loop-")), "run", "goal", DEFAULT_CONFIG); loop.start(); loop.record(report()); expect(() => loop.setGoal("different")).toThrow(/new research run/); });
});
