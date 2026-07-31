import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { HypothesisMachineConfig } from "../config.js";

export type HypothesisStatus = "proposed" | "testable" | "testing" | "supported" | "partially_supported" | "inconclusive" | "contradicted" | "invalid_experiment" | "requires_external_validation";
export interface TestPlan { hypothesis: string; data: string; baseline: string; split: string; metrics: string[]; successCriterion: string; refutationCriterion: string; confounders: string[]; resourceLimits: string }
export interface ExperimentRequest { plan: TestPlan; command: string; sourceFiles: Record<string, string>; dataManifest?: unknown; image?: string; createdBy?: string }
export interface ExperimentResult { id: string; status: "completed" | "failed" | "timeout" | "docker_unavailable"; exitCode?: number; directory: string; planHash: string }
export interface ExperimentReview { experimentId: string; reviewerId: string; verdict: Extract<HypothesisStatus, "supported" | "partially_supported" | "inconclusive" | "contradicted" | "invalid_experiment" | "requires_external_validation">; summary: string; limitations: string }

export function validateTestPlan(plan: TestPlan): void { for (const [key, value] of Object.entries(plan)) if (Array.isArray(value) ? value.length === 0 : !String(value).trim()) throw new Error(`Test plan field ${key} is required`); }
export function dockerArguments(config: HypothesisMachineConfig["experiment"], directory: string, image: string, command: string, containerName?: string): string[] {
  return ["run", "--rm", ...(containerName ? ["--name", containerName] : []), "--network", "none", "--read-only", "--cpus", String(config.cpus), "--memory", `${config.memory_mb}m`, "--pids-limit", "128", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "-v", `${directory}:/workspace:ro`, "-v", `${resolve(directory, "artifacts")}:/workspace/artifacts:rw`, "-w", "/workspace", image, "sh", "-lc", command];
}

async function runProcess(command: string, args: string[], timeoutMs: number, onTimeout?: () => void): Promise<{ code: number; stdout: string; stderr: string; timeout: boolean }> {
  return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } }); let stdout = "", stderr = "", timeout = false; child.stdout.on("data", (chunk) => stdout += String(chunk)); child.stderr.on("data", (chunk) => stderr += String(chunk)); const timer = setTimeout(() => { timeout = true; onTimeout?.(); child.kill("SIGKILL"); }, timeoutMs); child.on("error", reject); child.on("close", (code) => { clearTimeout(timer); resolvePromise({ code: code ?? 1, stdout, stderr, timeout }); }); });
}

export class ExperimentRunner {
  constructor(private readonly stateDir: string, private readonly config: HypothesisMachineConfig["experiment"]) {}
  async health(): Promise<void> { const result = await runProcess("docker", ["info", "--format", "{{.ServerVersion}}"], 10_000).catch((error) => { throw new Error(`Docker unavailable: ${error instanceof Error ? error.message : String(error)}`); }); if (result.code !== 0) throw new Error(`Docker unavailable: ${result.stderr.trim()}. Generated code was not executed.`); }
  async run(request: ExperimentRequest): Promise<ExperimentResult> {
    validateTestPlan(request.plan); const id = `exp-${randomUUID().slice(0, 8)}`; const directory = resolve(this.stateDir, "experiments", id); const sourceDir = resolve(directory, "source");
    mkdirSync(sourceDir, { recursive: true }); mkdirSync(resolve(directory, "environment")); mkdirSync(resolve(directory, "artifacts"));
    const planText = `${JSON.stringify(request.plan, null, 2)}\n`; const planHash = createHash("sha256").update(planText).digest("hex");
    writeFileSync(resolve(directory, "hypothesis.md"), `# Hypothesis\n\n${request.plan.hypothesis}\n`, { mode: 0o600 }); writeFileSync(resolve(directory, "test-plan.md"), `<!-- immutable-plan-sha256: ${planHash} -->\n\n\`\`\`json\n${planText}\`\`\`\n`, { mode: 0o600 });
    for (const [name, content] of Object.entries(request.sourceFiles)) { if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error(`Unsafe source filename: ${name}`); writeFileSync(resolve(sourceDir, name), content, { mode: 0o600 }); }
    writeFileSync(resolve(directory, "data-manifest.json"), `${JSON.stringify(request.dataManifest ?? { datasets: [] }, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(resolve(directory, "experiment-manifest.json"), `${JSON.stringify({ id, createdBy: request.createdBy ?? "unknown", hypothesisStatus: "testing", planHash, createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(resolve(directory, "stdout.log"), "", { mode: 0o600 }); writeFileSync(resolve(directory, "stderr.log"), "", { mode: 0o600 }); writeFileSync(resolve(directory, "metrics.json"), "{}\n", { mode: 0o600 }); writeFileSync(resolve(directory, "review.md"), "# Independent review\n\nPending assignment to an independent reviewer.\n", { mode: 0o600 });
    try { await this.health(); } catch (error) { writeFileSync(resolve(directory, "stderr.log"), `${error instanceof Error ? error.message : String(error)}\n`, { mode: 0o600 }); return { id, status: "docker_unavailable", directory, planHash }; }
    if (!readFileSync(resolve(directory, "test-plan.md"), "utf8").includes(planHash)) throw new Error("Test plan changed before execution");
    const image = request.image ?? this.config.image; writeFileSync(resolve(directory, "environment", "runner.json"), `${JSON.stringify({ ...this.config, image, network: "none", readOnlyRoot: true }, null, 2)}\n`, { mode: 0o600 });
    const containerName = `hm-${id}`; const result = await runProcess("docker", dockerArguments(this.config, directory, image, request.command, containerName), this.config.timeout_seconds * 1000, () => { const cleanup = spawn("docker", ["rm", "-f", containerName], { stdio: "ignore", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } }); cleanup.unref(); });
    writeFileSync(resolve(directory, "stdout.log"), result.stdout, { mode: 0o600 }); writeFileSync(resolve(directory, "stderr.log"), result.stderr, { mode: 0o600 });
    const producedMetrics = resolve(directory, "artifacts", "metrics.json"); if (existsSync(producedMetrics)) copyFileSync(producedMetrics, resolve(directory, "metrics.json"));
    return { id, status: result.timeout ? "timeout" : result.code === 0 ? "completed" : "failed", exitCode: result.code, directory, planHash };
  }

  review(input: ExperimentReview): { experimentId: string; status: HypothesisStatus; reviewPath: string } {
    if (!/^exp-[a-f0-9]{8}$/.test(input.experimentId)) throw new Error("Invalid experiment id");
    const directory = resolve(this.stateDir, "experiments", input.experimentId); const manifestPath = resolve(directory, "experiment-manifest.json");
    if (!existsSync(manifestPath)) throw new Error(`Unknown experiment: ${input.experimentId}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { createdBy: string; planHash: string; hypothesisStatus: HypothesisStatus; reviewedBy?: string; reviewedAt?: string };
    if (manifest.createdBy === input.reviewerId) throw new Error("Independent review must be performed by an agent other than the experiment author");
    if (!input.summary.trim() || !input.limitations.trim()) throw new Error("Review summary and limitations are required");
    const reviewPath = resolve(directory, "review.md"); writeFileSync(reviewPath, `---\nexperiment_id: ${input.experimentId}\nreviewer_id: ${input.reviewerId}\nverdict: ${input.verdict}\nplan_sha256: ${manifest.planHash}\n---\n\n# Independent review\n\n${input.summary.trim()}\n\n# Limitations\n\n${input.limitations.trim()}\n`, { mode: 0o600 });
    manifest.hypothesisStatus = input.verdict; manifest.reviewedBy = input.reviewerId; manifest.reviewedAt = new Date().toISOString(); writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return { experimentId: input.experimentId, status: input.verdict, reviewPath };
  }
}
