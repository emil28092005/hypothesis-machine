# Development

Requirements: Node.js 22.19+, npm, Pi credentials for live model tests, Docker with
Compose for local web services and experiments.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run smoke
docker compose -f infra/compose.yaml config
```

The automated suite does not call a model or paid service. Integration tests use
`AgentRuntimeFactory` fakes and cover child/grandchild lineage, parallel work,
steering, cancellation, crash recovery, structured results, and findings.

Manual extension smoke without a model call:

```bash
printf '%s\n' '{"type":"get_commands"}' | \
  PI_OFFLINE=1 npx pi --mode rpc --no-session --no-extensions \
  --extension ./src/index.ts --approve
```

To inspect web health inside Pi, ask the agent to use a web tool or test the local
endpoints directly. SearXNG JSON must be enabled by `infra/searxng/settings.yml`.
Firecrawl v2 endpoints are used (`/v2/scrape`, `/v2/crawl`). SearXNG binds to
host port 8888 by default; override it with `SEARXNG_PORT` and match `searxng_url`.

To reset only the derived search index, stop Pi and delete
`.hypothesis-machine/index.sqlite*`; `ResearchMemory.rebuildIndex()` reconstructs
it from Markdown. Never delete `runs/`, `sources/`, or `experiments/` unless their
loss is intended.
