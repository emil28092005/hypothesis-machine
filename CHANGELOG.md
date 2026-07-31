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
