import { Theme } from "@earendil-works/pi-coding-agent";
import { createAgentPanelComponent, agentLastActivity } from "./src/agent-tree-ui.js";
import type { AgentRecord } from "./src/types.js";

const theme = new Theme(
  { accent: "#8abeb7", border: "#5f87ff", borderAccent: "#00d7ff", borderMuted: "#505050", success: "#b5bd68", error: "#cc6666", warning: "#ffff00", muted: "#808080", dim: "#666666", text: "#d4d4d4", thinkingText: "#808080", userMessageText: "#d4d4d4", customMessageText: "#d4d4d4", customMessageLabel: "#9575cd", toolTitle: "#d4d4d4", toolOutput: "#808080", mdHeading: "#f0c674", mdLink: "#81a2be", mdLinkUrl: "#666666", mdCode: "#8abeb7", mdCodeBlock: "#b5bd68", mdCodeBlockBorder: "#808080", mdQuote: "#808080", mdQuoteBorder: "#808080", mdHr: "#808080", mdListBullet: "#8abeb7", toolDiffAdded: "#b5bd68", toolDiffRemoved: "#cc6666", toolDiffContext: "#808080", syntaxComment: "#808080", syntaxKeyword: "#cc6666", syntaxFunction: "#8abeb7", syntaxVariable: "#d4d4d4", syntaxString: "#b5bd68", syntaxNumber: "#f0c674", syntaxType: "#5f87ff", syntaxOperator: "#d4d4d4", syntaxPunctuation: "#808080", thinkingOff: "#666666", thinkingMinimal: "#666666", thinkingLow: "#666666", thinkingMedium: "#666666", thinkingHigh: "#666666", thinkingXhigh: "#666666", thinkingMax: "#666666", bashMode: "#cc6666" },
  { selectedBg: "#3a3a4a", userMessageBg: "#343541", customMessageBg: "#2d2838", toolPendingBg: "#282832", toolSuccessBg: "#283228", toolErrorBg: "#3c2828" },
  "truecolor",
);

const base: Omit<AgentRecord, "id" | "status" | "startedAt" | "finishedAt"> = {
  runId: "run-132965dd", parentId: "root", children: [], lineage: [], depth: 1,
  task: "x", taskFingerprint: "x", expectedOutput: "", completionCriteria: "", specPath: "",
  createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
};
const mk = (id: string, status: AgentRecord["status"], startedMin: number, finishedMin?: number): AgentRecord => ({
  ...base, id, status,
  startedAt: new Date(Date.now() - startedMin * 60000).toISOString(),
  finishedAt: finishedMin !== undefined ? new Date(Date.now() - finishedMin * 60000).toISOString() : undefined,
});

// Fake tree
const agents = new Map<string, AgentRecord>();
agents.set("root", { ...base, id: "root", parentId: null, depth: 0, status: "completed", startedAt: new Date(Date.now() - 30 * 60000).toISOString(), finishedAt: new Date(Date.now() - 25 * 60000).toISOString() });
agents.set("market-competitors-bb389dda", mk("market-competitors-bb389dda", "running", 3));
agents.set("regulatory-gov-support-3b922f86", mk("regulatory-gov-support-3b922f86", "waiting", 3));
agents.set("llm-infrastructure-niches-b1308f72", mk("llm-infrastructure-niches-b1308f72", "created", 0));
agents.set("science-education-niches-293d399a", mk("science-education-niches-293d399a", "completed", 55, 12));
agents.set("demand-b2b-b2g-57637d25", mk("demand-b2b-b2g-57637d25", "failed", 40, 9));
const tree = {
  rootId: "root", runId: "run-132965dd",
  list: () => [...agents.values()],
} as never;

const tui = { requestRender() {}, terminal: { rows: 40 } } as never;
const panel = createAgentPanelComponent(tree, tui, theme, () => {});
const out = panel.render(50);
// strip ANSI, show visibly
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
console.log("+" + "-".repeat(50) + "+");
for (const line of out) console.log("|" + strip(line) + "|");
console.log("+" + "-".repeat(50) + "+");
console.log("lines:", out.length, "| last line ends with reset:", out[out.length-1]!.endsWith("\x1b[0m"));
