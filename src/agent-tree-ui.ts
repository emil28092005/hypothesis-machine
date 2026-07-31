import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AgentTree } from "./agent-tree.js";
import type { AgentRecord } from "./types.js";

interface TreeRow { record: AgentRecord; prefix: string; depth: number }

/** Flatten the agent tree into rows with tree glyphs (├─/└─/│). */
function buildRows(tree: AgentTree): TreeRow[] {
  const rows: TreeRow[] = [];
  const root = tree.inspect(tree.rootId);
  const walk = (record: AgentRecord, ancestors: boolean[], last: boolean, depth: number): void => {
    const indent = ancestors.map((isLast) => (isLast ? "   " : "│  ")).join("");
    const connector = ancestors.length === 0 ? "" : last ? "└─ " : "├─ ";
    rows.push({ record, prefix: indent + connector, depth });
    record.children.forEach((childId, index) => walk(tree.inspect(childId), [...ancestors, last], index === record.children.length - 1, depth + 1));
  };
  walk(root, [], false, 0);
  return rows;
}

const STATUS_COLOR: Record<AgentRecord["status"], (theme: Theme, text: string) => string> = {
  running: (t, s) => t.fg("accent", s),
  waiting: (t, s) => t.fg("accent", s),
  completed: (t, s) => t.fg("success", s),
  failed: (t, s) => t.fg("error", s),
  cancelled: (t, s) => t.fg("dim", s),
  interrupted: (t, s) => t.fg("warning", s),
  created: (t, s) => t.fg("text", s),
  archived: (t, s) => t.fg("dim", s),
};
const STATUS_ICON: Record<AgentRecord["status"], string> = {
  running: "▸", waiting: "⏸", completed: "✓", failed: "✖", cancelled: "·", interrupted: "⚠", created: "·", archived: "·",
};

function shortName(id: string): string { return id.replace(/-[a-f0-9]{8}$/, ""); }

function elapsed(record: AgentRecord, now: number): string {
  if (!record.startedAt) return "";
  const start = Date.parse(record.startedAt);
  const end = record.finishedAt ? Date.parse(record.finishedAt) : (record.status === "running" || record.status === "waiting") ? now : undefined;
  if (!end) return "";
  const span = Math.max(0, Math.round((end - start) / 1000));
  return `${String(Math.floor(span / 60)).padStart(2, "0")}:${String(span % 60).padStart(2, "0")}`;
}

/** Cache of the last observed session-file size and its extracted activity line. */
const activityCache = new Map<string, { size: number; line: string }>();

function collapse(text: string): string { return text.replace(/\s+/g, " ").trim(); }

/** Read the tail of an agent session file and extract its most recent activity: last tool call (name + query) or last assistant text. */
export function agentLastActivity(sessionFile: string | undefined): string | undefined {
  if (!sessionFile) return undefined;
  let size: number;
  try { size = statSync(sessionFile).size; } catch { return undefined; }
  const cached = activityCache.get(sessionFile);
  if (cached && cached.size === size) return cached.line || undefined;
  let text = "";
  try {
    const fd = openSync(sessionFile, "r");
    try { const start = Math.max(0, size - 65536); const buf = Buffer.alloc(size - start); readSync(fd, buf, 0, buf.length, start); text = buf.toString("utf8"); } finally { closeSync(fd); }
  } catch { return cached?.line || undefined; }
  const queries = new Map<string, string | undefined>();
  let toolName: string | undefined; let toolId: string | undefined; let lastText: string | undefined;
  for (const raw of text.split("\n")) {
    let entry: { message?: { role?: string; toolName?: string; toolCallId?: string; content?: Array<{ type?: string; id?: string; name?: string; arguments?: unknown; text?: string }> } };
    try { entry = JSON.parse(raw) as typeof entry; } catch { continue; }
    const msg = entry?.message; if (!msg) continue;
    if (msg.role === "toolResult") { toolName = msg.toolName; toolId = msg.toolCallId; }
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === "toolCall" && typeof part.id === "string") {
          const args = part.arguments as Record<string, unknown> | undefined;
          const query = typeof args?.query === "string" ? args.query : args ? String(Object.values(args)[0] ?? "") : "";
          queries.set(part.id, query);
        }
        if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) lastText = collapse(part.text);
      }
    }
  }
  const line = toolName ? ` ${toolName}${toolId && queries.get(toolId) ? `: \"${queries.get(toolId)}\"` : ""}` : lastText ? ` ${lastText}` : "";
  activityCache.set(sessionFile, { size, line });
  return line || undefined;
}

/** Persistent non-capturing right-side panel: live agent tree without keyboard navigation. */
export function createAgentPanelComponent(
  tree: AgentTree,
  tui: { requestRender(): void },
  theme: Theme,
  done: () => void,
): { render(width: number): string[]; invalidate(): void; handleInput(data: string): void; dispose(): void } {
  const timer = setInterval(() => tui.requestRender(), 1500);
  return {
    render(width) {
      const rows = buildRows(tree).filter((row) => row.depth > 0);
      const now = Date.now();
      const active = rows.filter((row) => row.record.status === "running" || row.record.status === "waiting").length;
      const lines: string[] = [theme.fg("accent", `◆ agents`) + theme.fg("dim", ` · ${tree.runId}`), theme.fg("dim", `${active} active · ${rows.length} agents`), ""];
      for (const { record, prefix } of rows) {
        const icon = STATUS_ICON[record.status];
        const status = STATUS_COLOR[record.status](theme, record.status);
        const time = elapsed(record, now);
        lines.push(`${prefix}${theme.fg("text", icon)} ${theme.fg("text", shortName(record.id))} ${status}${time ? ` ${theme.fg("dim", time)}` : ""}`);
        if (record.status === "running" || record.status === "waiting") {
          const activity = agentLastActivity(record.sessionFile);
          if (activity) lines.push(theme.fg("dim", `  ${truncateToWidth(activity, Math.max(20, width - 8))}`));
        }
      }
      lines.push("", theme.fg("dim", "/agents — details · /agents-panel — hide"));
      return lines.map((line) => truncateToWidth(line, width));
    },
    invalidate() { /* rebuilt fresh on every render */ },
    handleInput() { /* non-capturing: keys go to the editor */ },
    dispose() { clearInterval(timer); },
  };
}

/** Interactive overlay showing the full agent tree with live statuses, keyboard navigation, and a detail pane. */
export function createAgentTreeOverlay(
  tree: AgentTree,
  tui: { requestRender(): void },
  theme: Theme,
  done: () => void,
): { render(width: number): string[]; invalidate(): void; handleInput(data: string): void; dispose(): void } {
  let selected = 0;
  let detail = false;
  const timer = setInterval(() => tui.requestRender(), 1500);
  return {
    render(width) {
      const rows = buildRows(tree);
      if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
      const now = Date.now();
      const lines: string[] = [theme.fg("accent", `◆ Agent tree · ${tree.runId} · ${rows.length - 1} agents`), ""];
      for (let i = 0; i < rows.length; i++) {
        const { record, prefix } = rows[i]!;
        const marker = i === selected ? theme.fg("accent", ">") : " ";
        const icon = STATUS_ICON[record.status];
        const status = STATUS_COLOR[record.status](theme, record.status);
        const time = elapsed(record, now);
        lines.push(`${marker} ${prefix}${theme.fg("text", icon)} ${theme.fg("text", shortName(record.id))} ${status}${time ? ` ${theme.fg("dim", time)}` : ""}`);
      }
      if (detail && rows[selected]) {
        const { record } = rows[selected]!;
        lines.push("", theme.fg("dim", "task:"), ...wrapTextWithAnsi(record.task, width - 2).slice(0, 4).map((line) => theme.fg("text", line)));
        if (record.result?.summary) lines.push(theme.fg("dim", "result:"), ...wrapTextWithAnsi(record.result.summary, width - 2).slice(0, 5).map((line) => theme.fg("muted", line)));
        if (record.error) lines.push(theme.fg("error", `error: ${truncateToWidth(record.error, width - 2)}`));
      }
      lines.push("", theme.fg("dim", "↑↓ navigate · enter toggle details · esc close"));
      return lines.map((line) => truncateToWidth(line, width));
    },
    invalidate() { /* rebuilt fresh on every render */ },
    handleInput(data) {
      const rows = buildRows(tree);
      if (matchesKey(data, Key.up)) { if (selected > 0) { selected--; tui.requestRender(); } }
      else if (matchesKey(data, Key.down)) { if (selected < rows.length - 1) { selected++; tui.requestRender(); } }
      else if (matchesKey(data, Key.enter)) { detail = !detail; tui.requestRender(); }
      else if (matchesKey(data, Key.escape)) { done(); }
    },
    dispose() { clearInterval(timer); },
  };
}
