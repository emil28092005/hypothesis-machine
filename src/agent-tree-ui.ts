import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AgentTree } from "./agent-tree.js";
import type { AgentRecord } from "./types.js";

interface TreeRow { record: AgentRecord; prefix: string }

/** Flatten the agent tree into rows with tree glyphs (├─/└─/│). */
function buildRows(tree: AgentTree): TreeRow[] {
  const rows: TreeRow[] = [];
  const root = tree.inspect(tree.rootId);
  const walk = (record: AgentRecord, ancestors: boolean[], last: boolean): void => {
    const indent = ancestors.map((isLast) => (isLast ? "   " : "│  ")).join("");
    const connector = ancestors.length === 0 ? "" : last ? "└─ " : "├─ ";
    rows.push({ record, prefix: indent + connector });
    record.children.forEach((childId, index) => walk(tree.inspect(childId), [...ancestors, last], index === record.children.length - 1));
  };
  walk(root, [], false);
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
