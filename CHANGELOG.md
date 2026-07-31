# Changelog

## Unreleased

- New `/agent [filter]` OpenCode-style chat inspector: a full TUI panel shows the
  agent tree on the left and the selected agent's live chat transcript on the
  right (`↑↓` select, `enter`/`tab` open chat, `t` toggle thinking, `o` open the
  full session, `esc` close). Transcripts are parsed from the agent session
  JSONL (user/assistant/tool-call/tool-result/thinking blocks) and refresh every
  1.5s while an agent is streaming; the tree shows status glyphs, elapsed time,
  and per-agent tasks. `/agent-open` keeps the previous session-switching flow
  (`Subagent Actions → Open`), with `/back` returning to the main session.

- New `/agent [filter]` command opens a subagent's full chat session in the TUI
  (OpenCode-style `Subagent Actions → Open`): a selector lists the run's agents
  with status glyphs, elapsed time, and task; picking one switches the session
  to the agent's own conversation so it can be read (and continued once idle)
  in the normal pi view. `/back` returns to the main session. The run is
  re-linked automatically: an agent chat session carries no RUN_ENTRY, so the
  run id is derived from the session file path
  (`<stateDir>/runs/<runId>/sessions/…`) and the run is restored instead of a
  new one being created; the main session file is recorded in the run manifest
  so `/back` works even after a reload while viewing an agent chat.
- The live widget is re-attached safely on every session switch (timer guard).

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
- The live widget above the editor shows the research run id, loop status,
  iteration, active agents with elapsed time, and recently finished agents
  (updated every 1.5 s, hidden when idle).
- Subagents no longer stall the main chat on serial model backends: new
  `agent_concurrency` (default 3) caps how many subagent sessions stream at
  once, and optional `subagent_model` routes subagents to a different
  model/backend (e.g. a local Ollama model) so they never contend with the
  main session.

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
