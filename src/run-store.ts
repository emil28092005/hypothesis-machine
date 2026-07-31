import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentRecord } from "./types.js";

export interface RunManifest {
  version: 1;
  runId: string;
  goal: string;
  status: "active" | "paused" | "stopped" | "completed";
  rootAgentId: string;
  createdAt: string;
  updatedAt: string;
  agents: Record<string, AgentRecord>;
}

export class RunStore {
  constructor(readonly stateDir: string) {}
  runDir(runId: string): string { return resolve(this.stateDir, "runs", runId); }
  manifestPath(runId: string): string { return resolve(this.runDir(runId), "manifest.json"); }
  agentDir(runId: string): string { return resolve(this.runDir(runId), "agents"); }
  sessionDir(runId: string): string { return resolve(this.runDir(runId), "sessions"); }

  create(runId: string, goal: string, root: AgentRecord): RunManifest {
    const now = new Date().toISOString();
    const manifest: RunManifest = { version: 1, runId, goal, status: "active", rootAgentId: root.id, createdAt: now, updatedAt: now, agents: { [root.id]: root } };
    this.save(manifest);
    return manifest;
  }

  load(runId: string): RunManifest {
    const data = JSON.parse(readFileSync(this.manifestPath(runId), "utf8")) as RunManifest;
    if (data.version !== 1 || data.runId !== runId || typeof data.agents !== "object") throw new Error(`Invalid run manifest: ${runId}`);
    return data;
  }

  exists(runId: string): boolean { return existsSync(this.manifestPath(runId)); }

  save(manifest: RunManifest): void {
    manifest.updatedAt = new Date().toISOString();
    const path = this.manifestPath(manifest.runId);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
  }
}
