import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { ResearchLimits } from "./types.js";

export const DEFAULT_SUBAGENT_MODEL = "deepseek/deepseek-v4-flash";

export interface HypothesisMachineConfig extends ResearchLimits {
  state_dir: string;
  searxng_url: string;
  firecrawl_url: string;
  browser_use_url?: string;
  web_timeout_ms: number;
  max_download_bytes: number;
  /** Pi model used for every spawned agent. Defaults to DeepSeek V4 Flash through Pi's built-in direct DeepSeek provider. */
  subagent_model: string;
  experiment: { image: string; cpus: number; memory_mb: number; timeout_seconds: number };
}

export const DEFAULT_CONFIG: HypothesisMachineConfig = {
  state_dir: ".hypothesis-machine",
  max_depth: 6,
  max_children_per_agent: 8,
  max_active_agents: 32,
  max_total_agents_per_run: 200,
  max_iterations_without_progress: 3,
  max_research_iterations: 12,
  agent_timeout_seconds: 1800,
  agent_concurrency: 3,
  allow_recursive_spawning: true,
  searxng_url: "http://127.0.0.1:8888",
  firecrawl_url: "http://127.0.0.1:3002",
  web_timeout_ms: 45_000,
  max_download_bytes: 10 * 1024 * 1024,
  subagent_model: DEFAULT_SUBAGENT_MODEL,
  experiment: { image: "python:3.12-slim", cpus: 1, memory_mb: 1024, timeout_seconds: 300 },
};

export function loadConfig(cwd: string): HypothesisMachineConfig {
  const file = resolve(cwd, DEFAULT_CONFIG.state_dir, "config.yaml");
  if (!existsSync(file)) return structuredClone(DEFAULT_CONFIG);
  const value = YAML.parse(readFileSync(file, "utf8")) as Partial<HypothesisMachineConfig>;
  const config = { ...DEFAULT_CONFIG, ...value, experiment: { ...DEFAULT_CONFIG.experiment, ...value.experiment } };
  // "inherit" was the old default; never permit it to re-enable parent-model routing.
  return config.subagent_model === "inherit" ? { ...config, subagent_model: DEFAULT_SUBAGENT_MODEL } : config;
}
