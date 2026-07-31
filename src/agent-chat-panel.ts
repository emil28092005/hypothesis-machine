import { readFileSync, statSync } from "node:fs";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AgentRecord, AgentStatus } from "./types.js";

/** One-character status glyphs (OpenCode-style checklist markers). */
export const AGENT_STATUS_GLYPH: Record<AgentStatus, string> = {
  created: "·", running: "•", waiting: "·", completed: "✓", failed: "✖", cancelled: "·", interrupted: "!", archived: "·",
};

export function shortAgentName(id: string): string { return id.replace(/-[a-f0-9]{8}$/, ""); }

// ---------------------------------------------------------------------------
// Transcript parsing (pure, testable)
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  role: "user" | "assistant" | "tool" | "thinking";
  label: string;
  /** Full text; the renderer wraps/truncates to the available width. */
  text: string;
}

interface ParsedContent {
  text: string;
  tools: Array<{ name: string; args: string }>;
  thinking: string[];
}

function parseContentParts(parts: unknown): ParsedContent {
  const text: string[] = []; const tools: ParsedContent["tools"] = []; const thinking: string[] = [];
  if (!Array.isArray(parts)) return { text: "", tools, thinking };
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    switch (record.type) {
      case "text": if (typeof record.text === "string" && record.text.trim()) text.push(record.text); break;
      case "thinking": if (typeof record.thinking === "string" && record.thinking.trim()) thinking.push(record.thinking); break;
      case "toolCall": {
        const name = typeof record.name === "string" ? record.name : "tool";
        let args = typeof record.arguments === "string" ? record.arguments : JSON.stringify(record.arguments ?? "");
        try { args = JSON.stringify(JSON.parse(args), null, 1); } catch { /* keep the raw string */ }
        tools.push({ name, args });
        break;
      }
    }
  }
  return { text: text.join("\n\n"), tools, thinking };
}

function parseToolResult(parsed: Record<string, unknown>): TranscriptEntry | undefined {
  const message = parsed.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") return undefined;
  const name = typeof message.toolName === "string" ? message.toolName : "tool";
  const parts = Array.isArray(message.content) ? message.content : [];
  const text = parts
    .map((part): string => (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text as string : ""))
    .join("\n").trim();
  return { role: "tool", label: `← ${name}`, text: text || "(no text result)" };
}

/** Return the actual provider/model recorded by Pi in an agent session, if any. */
export function parseAgentModel(sessionFile: string | undefined): string | undefined {
  if (!sessionFile) return undefined;
  let raw: string;
  try { raw = readFileSync(sessionFile, "utf8"); } catch { return undefined; }
  let model: string | undefined;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (parsed.type !== "model_change") continue;
    const provider = parsed.provider; const modelId = parsed.modelId;
    if (typeof provider === "string" && typeof modelId === "string") model = `${provider}/${modelId}`;
  }
  return model;
}

/**
 * Read a Pi agent session JSONL and reduce it to a renderable transcript.
 * Entries that fail to parse are skipped; a missing/unreadable file falls back
 * to the agent's task so the inspector still shows something useful.
 */
export function parseAgentTranscript(sessionFile: string | undefined, fallbackText?: string): TranscriptEntry[] {
  const fallback = (): TranscriptEntry[] => (fallbackText ? [{ role: "assistant", label: "task", text: fallbackText }] : []);
  if (!sessionFile) return fallback();
  let raw: string;
  try { raw = readFileSync(sessionFile, "utf8"); } catch { return fallback(); }
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (parsed.type !== "message") continue;
    const message = parsed.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") continue;
    const role = message.role;
    if (role === "user") {
      const content = parseContentParts(message.content);
      if (content.text) entries.push({ role: "user", label: "user", text: content.text });
    } else if (role === "assistant") {
      const content = parseContentParts(message.content);
      if (content.text) entries.push({ role: "assistant", label: "assistant", text: content.text });
      for (const t of content.thinking) entries.push({ role: "thinking", label: "thinking", text: t });
      for (const tool of content.tools) entries.push({ role: "tool", label: `→ ${tool.name}`, text: tool.args });
    } else if (role === "toolResult") {
      const result = parseToolResult(parsed);
      if (result) entries.push(result);
    }
  }
  if (entries.length === 0 && fallbackText) entries.push({ role: "assistant", label: "task", text: fallbackText });
  return entries;
}

// ---------------------------------------------------------------------------
// Agent tree flattening (pure, testable)
// ---------------------------------------------------------------------------

export interface AgentTreeRow {
  id: string;
  depth: number;
  status: AgentStatus;
  name: string;
  task: string;
  elapsed: string;
  hasSession: boolean;
}

export function agentElapsed(record: AgentRecord, now: number): string {
  if (!record.startedAt) return "";
  const start = Date.parse(record.startedAt);
  const end = record.finishedAt ? Date.parse(record.finishedAt) : record.status === "running" || record.status === "waiting" ? now : undefined;
  if (!end) return "";
  const span = Math.max(0, Math.round((end - start) / 1000));
  return `${String(Math.floor(span / 60)).padStart(2, "0")}:${String(span % 60).padStart(2, "0")}`;
}

/** Depth-first flatten of the agent tree, root first, preserving hierarchy order. */
export function buildTreeRows(agents: AgentRecord[], rootId: string, now: number): AgentTreeRow[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const rows: AgentTreeRow[] = [];
  const walk = (id: string, depth: number): void => {
    const agent = byId.get(id);
    if (!agent) return;
    rows.push({
      id, depth, status: agent.status, name: shortAgentName(agent.id),
      task: agent.task.replace(/\s+/g, " ").trim(),
      elapsed: agentElapsed(agent, now), hasSession: Boolean(agent.sessionFile),
    });
    for (const child of agent.children) walk(child, depth + 1);
  };
  walk(rootId, 0);
  return rows;
}

// ---------------------------------------------------------------------------
// Chat rendering (pure, testable)
// ---------------------------------------------------------------------------

export interface RenderedChatLine {
  kind: "separator" | "content";
  role?: TranscriptEntry["role"];
  text: string;
}

const SEPARATOR_MIN_WIDTH = 14;

/** Flatten a transcript into wrapped, width-safe lines with role-aware separators. */
export function renderTranscriptLines(entries: TranscriptEntry[], width: number): RenderedChatLine[] {
  const lines: RenderedChatLine[] = [];
  const contentWidth = Math.max(10, width - 2);
  for (const entry of entries) {
    const dashCount = Math.max(1, SEPARATOR_MIN_WIDTH - entry.label.length);
    const sep = `── ${entry.label} ${"─".repeat(dashCount)}`;
    lines.push({ kind: "separator", role: entry.role, text: truncateToWidth(sep, width, "") });
    for (const wrapped of wrapTextWithAnsi(entry.text, contentWidth)) {
      for (const sub of wrapped.split("\n")) lines.push({ kind: "content", role: entry.role, text: truncateToWidth(sub, width, "") });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Interactive inspector component (OpenCode-style agent chat tracking)
// ---------------------------------------------------------------------------

export type AgentChatPanelResult = { action: "openSession"; agentId: string } | { action: "close" };

export interface AgentChatPanelOptions {
  getAgents: () => AgentRecord[];
  rootId: string;
  runId: string;
  goal: string;
  theme: Theme;
  /** Optional lowercase query; non-matching agents are dimmed in the tree. */
  filter?: string;
}

/** Result carrying the agent id when the user asks to open the full session. */
export function openSessionResult(agentId: string): AgentChatPanelResult { return { action: "openSession", agentId }; }
export function closeResult(): AgentChatPanelResult { return { action: "close" }; }

export class AgentChatPanel {
  /** Index into the flattened tree; shared by both panes. */
  private selected = 0;
  /** Agent whose chat is shown in the right pane. */
  private viewing: string | null = null;
  /** True when focus is on the chat pane. */
  private chatFocused = false;
  /** Scroll offset in wrapped lines (0 = newest at bottom). */
  private chatScroll = 0;
  private thinkingVisible = false;
  private readonly parseCache = new Map<string, { mtimeMs: number; entries: TranscriptEntry[] }>();
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  /** Resolves the awaiting `ctx.ui.custom` promise; set by the UI factory. */
  onDone: (result: AgentChatPanelResult) => void = closeResult;

  constructor(private readonly options: AgentChatPanelOptions) {}

  invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }

  private rows(now = Date.now()): AgentTreeRow[] { return buildTreeRows(this.options.getAgents(), this.options.rootId, now); }

  private transcriptOf(record: AgentRecord | undefined): TranscriptEntry[] {
    const fallback = record?.task;
    if (!record?.sessionFile) return fallback ? [{ role: "assistant", label: "task", text: fallback }] : [];
    const file = record.sessionFile;
    try {
      const stat = statSync(file);
      const cached = this.parseCache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs) return cached.entries;
      const entries = parseAgentTranscript(file);
      this.parseCache.set(file, { mtimeMs: stat.mtimeMs, entries });
      return entries;
    } catch {
      return this.parseCache.get(file)?.entries ?? parseAgentTranscript(file);
    }
  }

  private viewportRows(): number {
    const rows = typeof process.stdout.rows === "number" && process.stdout.rows > 0 ? process.stdout.rows : 24;
    return Math.max(10, rows - 5);
  }

  handleInput(data: string): void {
    const rows = this.rows();
    if (this.chatFocused && this.viewing) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.left) || matchesKey(data, "h")) { this.chatFocused = false; }
      else if (matchesKey(data, "q")) { this.onDone(closeResult()); }
      else if (matchesKey(data, Key.up) || matchesKey(data, "k")) { this.chatScroll++; }
      else if (matchesKey(data, Key.down) || matchesKey(data, "j")) { this.chatScroll = Math.max(0, this.chatScroll - 1); }
      else if (matchesKey(data, Key.pageUp) || matchesKey(data, "ctrl+u")) { this.chatScroll += Math.max(5, Math.floor(this.viewportRows() / 2)); }
      else if (matchesKey(data, Key.pageDown) || matchesKey(data, "ctrl+d")) { this.chatScroll = Math.max(0, this.chatScroll - Math.max(5, Math.floor(this.viewportRows() / 2))); }
      else if (matchesKey(data, "t")) { this.thinkingVisible = !this.thinkingVisible; this.chatScroll = 0; }
      else if (matchesKey(data, "o")) { this.onDone(openSessionResult(this.viewing)); }
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "q")) { this.onDone(closeResult()); return; }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right) || matchesKey(data, "l")) {
      const row = rows[this.selected]; if (row?.hasSession || row) { this.viewing = row.id; this.chatFocused = true; this.chatScroll = 0; } return;
    }
    if (matchesKey(data, Key.enter)) {
      const row = rows[this.selected]; if (row) { this.viewing = row.id; this.chatFocused = true; this.chatScroll = 0; } return;
    }
    if (matchesKey(data, Key.up) || matchesKey(data, "k")) { this.selected = Math.max(0, this.selected - 1); return; }
    if (matchesKey(data, Key.down) || matchesKey(data, "j")) { this.selected = Math.min(rows.length - 1, this.selected + 1); return; }
    if (matchesKey(data, Key.home)) { this.selected = 0; return; }
    if (matchesKey(data, Key.end)) { this.selected = Math.max(0, rows.length - 1); return; }
  }

  private treeLines(rows: AgentTreeRow[], width: number): string[] {
    const theme = this.options.theme;
    const filter = (this.options.filter ?? "").trim().toLowerCase();
    const selected = this.chatFocused ? -1 : this.selected;
    return rows.map((row, index) => {
      const indent = "  ".repeat(Math.min(row.depth, 8));
      const marker = index === selected ? theme.fg("accent", "▸") : " ";
      const color = row.status === "completed" ? "success" : row.status === "failed" ? "error" : "accent";
      const glyph = theme.fg(color, AGENT_STATUS_GLYPH[row.status]);
      const status = row.status === "running" ? theme.fg("warning", "running") : theme.fg("dim", row.status);
      const time = row.elapsed ? theme.fg("dim", row.elapsed) : "";
      const noSession = row.hasSession ? "" : theme.fg("dim", "· no chat yet");
      const line = `${indent}${marker} ${glyph} ${theme.bold(row.name)} ${status} ${time} ${noSession}`;
      const task = truncateToWidth(row.task, Math.max(0, width - visibleWidth(line) - 1), "");
      const rendered = truncateToWidth(`${line} ${task}`.replace(/\s+$/, ""), width, "");
      if (filter && !row.id.toLowerCase().includes(filter) && !row.name.toLowerCase().includes(filter) && !row.task.toLowerCase().includes(filter)) {
        return theme.fg("dim", rendered);
      }
      return rendered;
    });
  }

  private chatLines(record: AgentRecord | undefined, width: number): string[] {
    const theme = this.options.theme;
    if (!record) return [theme.fg("dim", "Select an agent in the left pane.")];
    const glyph = AGENT_STATUS_GLYPH[record.status];
    const statusColor = record.status === "failed" ? "error" : record.status === "completed" ? "success" : "accent";
    const row = this.rows().find((candidate) => candidate.id === record.id);
    const model = parseAgentModel(record.sessionFile);
    const head = `${glyph} ${shortAgentName(record.id)} [${record.status}]${row?.elapsed ? ` ${theme.fg("dim", row.elapsed)}` : ""}${model ? ` · ${theme.fg("dim", model)}` : ""}`;
    const lines: string[] = [truncateToWidth(theme.fg(statusColor, head), width, "")];
    const task = truncateToWidth(record.task.replace(/\s+/g, " ").trim(), Math.max(0, width - 4), "");
    if (task) lines.push(theme.fg("muted", task));
    lines.push(theme.fg("dim", "─".repeat(Math.max(1, width))));
    const entries = this.transcriptOf(record);
    const visible = this.thinkingVisible ? entries : entries.filter((entry) => entry.role !== "thinking");
    if (visible.length === 0) {
      lines.push(theme.fg("dim", "No chat transcript yet."));
      return lines;
    }
    const rendered = renderTranscriptLines(visible, width);
    const height = this.viewportRows() - 4;
    const start = Math.max(0, rendered.length - height - this.chatScroll);
    const end = Math.min(rendered.length, start + height + 1);
    const slice = rendered.slice(start, end);
    for (const line of slice) {
      if (line.kind === "separator") lines.push(theme.fg("dim", line.text));
      else if (line.role === "user") lines.push(theme.fg("userMessageText", line.text));
      else if (line.role === "assistant") lines.push(theme.fg("text", line.text));
      else if (line.role === "thinking") lines.push(theme.fg("thinkingMedium", line.text));
      else lines.push(theme.fg("toolOutput", line.text));
    }
    const scrolled = rendered.length - height > 0;
    if (scrolled) {
      const pos = Math.max(0, rendered.length - height - this.chatScroll);
      lines.push(truncateToWidth(theme.fg("dim", `… ${pos + 1}–${end} of ${rendered.length} lines · pgup/pgdn scroll`), width, ""));
    }
    return lines;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const theme = this.options.theme;
    const rows = this.rows();
    const agents = this.options.getAgents();
    const active = agents.filter((agent) => agent.status === "running" || agent.status === "waiting").length;
    const goal = truncateToWidth(this.options.goal.replace(/\s+/g, " ").trim(), Math.max(0, width - 44), "");
    const lines: string[] = [];
    lines.push(truncateToWidth(theme.fg("accent", `◆ ${this.options.runId} · ${goal} · ${agents.length} agents · ${active} active`), width, ""));
    lines.push(theme.fg("dim", "─".repeat(Math.max(1, width))));
    lines.push(truncateToWidth(theme.fg("dim", `↑↓ select · enter/tab open chat · t thinking · o full session · esc close   ${this.thinkingVisible ? "· thinking ON" : ""}`), width, ""));
    lines.push(theme.fg("dim", "─".repeat(Math.max(1, width))));

    const twoPane = width >= 60;
    const treeWidth = twoPane ? Math.max(30, Math.min(width - 1, Math.floor(width * 0.32))) : 0;
    const chatWidth = twoPane ? Math.max(10, width - treeWidth - 1) : width;
    const height = this.viewportRows();
    const viewing = agents.find((agent) => agent.id === this.viewing);
    const tree = twoPane || !viewing ? this.treeLines(rows, twoPane ? treeWidth : width) : [];
    const chat = twoPane || viewing ? this.chatLines(viewing, chatWidth) : [];
    const rowCount = Math.max(tree.length, chat.length, height);
    const paddedTree = tree.length < rowCount ? [...tree, ...Array(rowCount - tree.length).fill("")] : tree;
    const paddedChat = chat.length < rowCount ? [...chat, ...Array(rowCount - chat.length).fill("")] : chat;
    for (let index = 0; index < rowCount; index++) {
      const left = paddedTree[index] ?? "";
      const right = paddedChat[index] ?? "";
      if (!twoPane) { lines.push(left || right); continue; }
      const leftPad = left + " ".repeat(Math.max(0, treeWidth - visibleWidth(left)));
      const sep = theme.fg("borderMuted", "│");
      lines.push(leftPad + sep + right);
    }
    lines.push(theme.fg("dim", "─".repeat(Math.max(1, width))));
    this.cachedWidth = width; this.cachedLines = lines;
    return lines;
  }
}
