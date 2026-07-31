# Changelog

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
