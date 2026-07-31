import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import type { AgentSpec } from "./types.js";

const REQUIRED_SECTIONS = ["Role", "Goal", "Context", "Responsibilities", "Completion criteria", "Expected output"] as const;
const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const ALLOWED_TOOLS = new Set(["read", "grep", "find", "ls", "search_memory", "read_artifact", "publish_finding", "spawn_agent", "agent_control", "web_search", "web_read", "web_crawl", "web_browse", "download_source", "run_experiment", "review_experiment"]);

export class AgentSpecError extends Error {}

export function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "agent";
}

function section(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = body.match(new RegExp(`^# ${escaped}\\s*\\n([\\s\\S]*?)(?=^# |$)`, "mi"));
  return found?.[1]?.trim() ?? "";
}

export function parseAgentSpec(markdown: string): AgentSpec {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new AgentSpecError("Agent specification must start with YAML frontmatter");
  const frontmatter = YAML.parse(match[1]!) as Record<string, unknown>;
  const body = match[2]!;
  const missing = REQUIRED_SECTIONS.filter((name) => !section(body, name));
  if (missing.length) throw new AgentSpecError(`Missing or empty sections: ${missing.join(", ")}`);
  const required = ["id", "name", "root_run_id", "depth", "can_spawn_agents", "max_children", "tools"];
  const missingFields = required.filter((key) => frontmatter[key] === undefined);
  if (missingFields.length) throw new AgentSpecError(`Missing frontmatter fields: ${missingFields.join(", ")}`);
  if (typeof frontmatter.id !== "string" || !ID_RE.test(frontmatter.id)) throw new AgentSpecError("id must be a lowercase kebab-case identifier");
  if (typeof frontmatter.name !== "string" || !frontmatter.name.trim()) throw new AgentSpecError("name must be non-empty");
  if (typeof frontmatter.root_run_id !== "string" || !frontmatter.root_run_id.trim()) throw new AgentSpecError("root_run_id must be non-empty");
  if (!Number.isInteger(frontmatter.depth) || Number(frontmatter.depth) < 0) throw new AgentSpecError("depth must be a non-negative integer");
  if (typeof frontmatter.can_spawn_agents !== "boolean") throw new AgentSpecError("can_spawn_agents must be boolean");
  if (!Number.isInteger(frontmatter.max_children) || Number(frontmatter.max_children) < 0) throw new AgentSpecError("max_children must be a non-negative integer");
  if (!Array.isArray(frontmatter.tools) || frontmatter.tools.some((tool) => typeof tool !== "string")) throw new AgentSpecError("tools must be a string array");
  const unknownTools = (frontmatter.tools as string[]).filter((tool) => !ALLOWED_TOOLS.has(tool)); if (unknownTools.length) throw new AgentSpecError(`Unsupported tools: ${unknownTools.join(", ")}`);
  if (new Set(frontmatter.tools as string[]).size !== (frontmatter.tools as string[]).length) throw new AgentSpecError("tools must not contain duplicates");
  if (frontmatter.replication_of && frontmatter.independent_context !== true) throw new AgentSpecError("replication_of requires independent_context: true");
  const spec = {
    ...frontmatter,
    parent_id: frontmatter.parent_id == null ? null : String(frontmatter.parent_id),
    role: section(body, "Role"), goal: section(body, "Goal"), context: section(body, "Context"),
    responsibilities: section(body, "Responsibilities"), completion_criteria: section(body, "Completion criteria"),
    expected_output: section(body, "Expected output"),
  } as unknown as AgentSpec;
  if (!spec.goal.trim() || !spec.expected_output.trim() || !spec.completion_criteria.trim()) throw new AgentSpecError("Goal, expected output, and completion criteria must be concrete");
  return spec;
}

export function serializeAgentSpec(spec: AgentSpec): string {
  const { role, goal, context, responsibilities, completion_criteria, expected_output, ...frontmatter } = spec;
  return `---\n${YAML.stringify(frontmatter).trim()}\n---\n\n# Role\n\n${role}\n\n# Goal\n\n${goal}\n\n# Context\n\n${context || "No additional context."}\n\n# Responsibilities\n\n${responsibilities || "Complete the assigned goal and report evidence."}\n\n# Completion criteria\n\n${completion_criteria}\n\n# Expected output\n\n${expected_output}\n`;
}

export function writeAgentSpec(baseDir: string, spec: AgentSpec): string {
  const path = resolve(baseDir, `${spec.id}.md`);
  mkdirSync(dirname(path), { recursive: true });
  const markdown = serializeAgentSpec(spec);
  parseAgentSpec(markdown);
  writeFileSync(path, markdown, { encoding: "utf8", mode: 0o600 });
  return path;
}

export function readAgentSpec(path: string): AgentSpec { return parseAgentSpec(readFileSync(path, "utf8")); }
