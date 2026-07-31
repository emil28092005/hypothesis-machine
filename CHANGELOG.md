# Changelog

## Unreleased

- Fixed the research loop and agent tree getting permanently stuck after
  `research_control stop`: `start` now restarts a stopped/completed run in the
  same session (`AgentTree.restart` revives the run, archives old branches, and
  resets the root), `ResearchLoop.start` resets iteration counters, and goal
  changes are allowed after stop/completion.
- Cancelled/failed/archived children no longer count toward the per-agent child
  limit, and archived agents are ignored by the duplicate-task guard.
- `cancel()` no longer overwrites an already recorded agent result.
- Added a per-agent execution timeout (`agent_timeout_seconds`, default 1800)
  so a hung agent session fails instead of blocking `wait` forever.
- Full-text search now prefix-matches tokens (tolerates Russian/English
  inflections without stemming) and safely handles punctuation and FTS5
  metacharacters instead of throwing or returning false negatives.
- Hardened the web gateway against SSRF TOCTOU: outbound downloads now resolve
  DNS once, validate the address, and connect to the validated IP directly
  (pinned resolution), so DNS rebinding cannot redirect the connection to a
  private target; malformed search results no longer break the whole query;
  the web cache is bounded (oldest entries evicted past 500 files).
- Experiment review is now truly independent: the reviewer must not be a
  descendant of the experiment author (in addition to not being the author).
- Experiment stdout/stderr are capped at 512 KB so runaway container output
  cannot exhaust memory or disk.
- Verified that Pi's extension tool registry is per-extension-instance, so
  reload re-registration is safe (no fix required).
- `research_control pause`/`resume` no longer desync the agent tree from the
  loop: pausing a non-running loop now errors instead of silently marking the
  tree as paused, and resume requires the loop to actually be paused.
- `read_artifact` now resolves symlinks before the confinement check, so a
  symlink inside the project cannot leak files from outside it.
- Added a live subagent dashboard: a TUI widget above the editor shows the
  research run id, loop status, iteration, active agents with elapsed time,
  and recently finished agents (updated every 1.5 s, hidden when idle).
- Subagents no longer stall the main chat on serial model backends: new
  `agent_concurrency` (default 3) caps how many subagent sessions stream at
  once, and optional `subagent_model` routes subagents to a different
  model/backend (e.g. a local Ollama model) so they never contend with the
  main session.
- New `/agents` command opens an interactive overlay with the full agent tree:
  tree glyphs (├─/└─/│), colored statuses and icons, live elapsed time,
  keyboard navigation (↑/↓), and a detail pane (Enter) showing each agent's
  task and result. The live widget header now hints at `/agents`.
- New `/agents-panel` command toggles a persistent OpenCode-style right-side
  panel with the live agent tree: non-capturing (typing keeps working),
  auto-refreshed every 1.5 s, hidden on terminals narrower than 100 columns,
  and closed automatically on shutdown.

## 0.1.1 — 2026-07-31

- Added GitHub CI, CodeQL, Dependabot, contribution/security templates, and the
  local release checklist.
- Updated the development toolchain to ESLint 10 and aligned the minimum Node.js
  version with Pi 0.83 (`22.19+`).
- Added the official `ModelRegistry` compatibility path for Pi 0.78 while
  retaining shared `ModelRuntime` behavior on Pi 0.83+.
- Added `agent_end` continuation fallback for Pi versions predating
  `agent_settled`.
- Improved startup diagnostics and verified `/team` through Pi 0.78 RPC mode.
- Fixed Redis container capabilities and verified a live Firecrawl v2 scrape.

## 0.1.0 — 2026-07-31

- Initial Pi extension package.
- Recursive persistent AgentSessions and dynamic Markdown agent factory.
- Tree limits, replication, messaging, cancellation, recovery, and `/team`.
- Markdown/SQLite research memory and source provenance.
- Local SearXNG/Firecrawl gateway with SSRF controls and cache.
- Explicit bounded research loop.
- Docker-only reproducible experiment runner.
- Unit, integration, and extension smoke tests.
