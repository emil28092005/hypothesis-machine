import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ExperimentRunner, dockerArguments, validateTestPlan } from "../src/tools/experiment.js";

const plan = { hypothesis: "A improves B", data: "fixed.csv", baseline: "mean", split: "predefined", metrics: ["rmse"], successCriterion: "rmse < 1", refutationCriterion: "rmse >= 1", confounders: ["leakage"], resourceLimits: "1 CPU" };
describe("ExperimentRunner", () => {
  it("requires precommitted test criteria", () => { expect(() => validateTestPlan(plan)).not.toThrow(); expect(() => validateTestPlan({ ...plan, baseline: "" })).toThrow(/baseline/); });
  it("constructs networkless resource-limited Docker arguments", () => { const args = dockerArguments({ image: "python", cpus: 1.5, memory_mb: 512, timeout_seconds: 30 }, "/tmp/exp", "python", "python source/test.py"); expect(args).toEqual(expect.arrayContaining(["--network", "none", "--read-only", "--cpus", "1.5", "--memory", "512m", "--cap-drop", "ALL"])); expect(args.join(" ")).not.toMatch(/\.pi|HOME|API_KEY/); });
  it("requires a different agent for independent review", () => { const dir = mkdtempSync(resolve(tmpdir(), "hm-review-")); const expDir = resolve(dir, "experiments", "exp-aabbccdd"); mkdirSync(expDir, { recursive: true }); writeFileSync(resolve(expDir, "experiment-manifest.json"), JSON.stringify({ createdBy: "implementer", planHash: "abc", hypothesisStatus: "testing" })); const runner = new ExperimentRunner(dir, { image: "none", cpus: 1, memory_mb: 128, timeout_seconds: 1 }); expect(() => runner.review({ experimentId: "exp-aabbccdd", reviewerId: "implementer", verdict: "supported", summary: "Looks good", limitations: "Small sample" })).toThrow(/other than/); expect(runner.review({ experimentId: "exp-aabbccdd", reviewerId: "reviewer", verdict: "inconclusive", summary: "Metric is unstable", limitations: "Small sample" }).status).toBe("inconclusive"); });
});
