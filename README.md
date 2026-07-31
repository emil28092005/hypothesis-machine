# Hypothesis Machine

Hypothesis Machine is an official Pi Coding Agent extension that turns the normal
interactive Pi session into the supervisor of a recursive research team. It does
not fork Pi or provide another UI. Any child is a persistent Pi `AgentSession` and
can dynamically create its own specialized children.

The working MVP includes recursive/parallel agents, persistent tree recovery,
research memory with FTS, local web adapters, a bounded research loop, and a
Docker-only experiment runner.

> **Project status:** early MVP (`0.1.x`). The core is tested locally, including a
> real three-level Pi agent run, but public APIs and stored formats may still
> change before `1.0`.

## Requirements

- Node.js 22.19 or newer and npm;
- Pi 0.78 or newer (0.83 recommended) and the normal Pi model/auth configuration;
- Docker + Compose for web infrastructure and computational experiments;
- roughly 12 GB RAM for the full Firecrawl stack (SearXNG alone is much smaller).

Runtime dependencies are limited to the four official Pi packages, `typebox`
(Pi's tool schemas), and `yaml` (agent/config frontmatter). SQLite comes from
Node.js; no external database library is used.

## Install and connect to Pi

From this directory:

```bash
npm install
npm run typecheck && npm test && npm run build
pi install .
```

For development without installation:

```bash
pi --extension ./src/index.ts
```

Pi remains the same chat interface, model selector, credential store, session UI,
and streaming runtime. Do not install third-party subagent extensions for this
package; Hypothesis Machine has its own recursive implementation.

Every subagent is pinned to `deepseek/deepseek-v4-flash`, using Pi's built-in
Direct DeepSeek API provider rather than inheriting the Supervisor's LLM. Add the
key once through `/login deepseek` (or set `DEEPSEEK_API_KEY`); the extension never
reads or copies it. Pi 0.83+ uses its official `ModelRuntime`; Pi 0.78 uses the
provided `ModelRegistry`. Override `subagent_model` only to deliberately choose a
different Pi model. After updating this local package, restart Pi or run `/reload`.

Optional project configuration:

```bash
mkdir -p .hypothesis-machine
cp .hypothesis-machine.example.yaml .hypothesis-machine/config.yaml
```

## Local web infrastructure

```bash
docker compose -f infra/compose.yaml pull
docker compose -f infra/compose.yaml up -d
curl 'http://127.0.0.1:8888/search?q=pi&format=json'
curl -s http://127.0.0.1:3002/ | head
```

Search routes to SearXNG; reading/crawling routes to self-hosted Firecrawl. The
Browser Use fallback is an optional local adapter because current Browser Use
requires a separate model credential; see
[`services/browser-worker/README.md`](services/browser-worker/README.md).

## First run

Start normal Pi in the project, then enter:

```text
Исследуй возможность применения метода A к задаче B.
Создай независимые направления для литературы, данных и критики.
Разреши агентам создавать подагентов.
Продолжай до появления проверяемой гипотезы или до трёх
итераций без информационного прироста.
```

Or use `/research <goal>`. The Supervisor calls coded tools; `spawn_agent` creates
a generated Markdown spec and a separate Pi session. A child can call the same
tool to create a grandchild. Foreground spawns return the result immediately;
background branches are controlled with `agent_control`.

## Commands

- `/team` — tree, tasks, and statuses;
- `/agent [filter]` — OpenCode-style inspector: agent tree on the left, live chat transcript of the selected agent on the right (`↑↓` select, `enter` open chat, `t` toggle thinking, `o` open the full session, `esc` close);
- `/agent-open [filter]` — open a subagent's full chat as its own session;
- `/back` — return to the main session after `/agent-open`;
- `/research <goal>` — start the explicit bounded loop;
- `/research-status`, `/research-pause`, `/research-resume`, `/research-stop`;
- `/findings`, `/hypotheses`.

The same operations are model-callable tools, so natural language such as “create
an independent critic”, “steer agent X”, or “cancel that branch” works without a
separate command UI.

## State and memory

```text
.hypothesis-machine/
├── runs/<run>/manifest.json, agents/*.md, sessions/*.jsonl
├── memory/{findings,hypotheses,questions,syntheses,decisions,agent-lessons}/
├── sources/<source-id>/{original.bin,metadata.json}
├── artifacts/web-cache/
├── experiments/<exp-id>/
└── index.sqlite
```

Pi JSONL stores conversations/tool calls/usage. Hypothesis Machine stores only
domain results and relationships. Markdown and original bytes are source of
truth; SQLite is a rebuildable search index. A model answer without sources cannot
be published as `corroborated`.

## Experiments

`run_experiment` requires hypothesis, data, baseline, split, metrics, success and
refutation criteria, confounders, and resource limits before execution. The plan
hash is frozen, source is written to an isolated experiment directory, and Docker
runs with no network or secrets. Results include logs, environment, metrics/files
created by the experiment, and space for independent `review.md`. A different
agent must call `review_experiment`; code rejects self-review and records one of
the final hypothesis verdicts in the experiment manifest.

## Security and limitations

Read [`docs/security.md`](docs/security.md) before autonomous work. Web content is
untrusted, private networks are blocked, and Docker never degrades to host
execution. Current MVP limitations:

- live recursive model execution requires configured Pi credentials and was not
  exercised by the free automated suite;
- Browser Use is an adapter contract, not enabled in default Compose;
- Firecrawl consumes substantial resources and its upstream images are not digest-pinned;
- independent review is a dynamic agent pattern, not a hard-coded mandatory role;
- the SQLite API in Node 22 is still marked experimental;
- strict filesystem isolation for Pi read-only tools requires an OS/Pi sandbox.

Troubleshooting: `docker compose -f infra/compose.yaml ps`, verify SearXNG JSON is
enabled, verify Firecrawl at port 3002, run `docker info`, and use
`/research-status`. Active children from an unclean shutdown restore as
`interrupted`; their session file and lineage remain available.

Design details: [`docs/architecture.md`](docs/architecture.md), verified Pi APIs:
[`docs/pi-capabilities.md`](docs/pi-capabilities.md), development:
[`docs/development.md`](docs/development.md).

## Contributing and releases

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the local workflow and
[`docs/releasing.md`](docs/releasing.md) for the maintainer checklist. Please
report security issues privately as described in [`SECURITY.md`](SECURITY.md).

Released under the [MIT License](LICENSE).
